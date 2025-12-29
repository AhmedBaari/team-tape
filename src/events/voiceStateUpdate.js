
import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import mongoService from '../services/mongoService.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import { createRecordingStartEmbed, createErrorEmbed } from '../utils/embedBuilder.js';

/**
 * Get notification channel for a guild
 * @param {Guild} guild - Discord guild
 * @returns {Promise<TextChannel|null>}
 */
async function getNotificationChannel(guild) {
  try {
    const config = await mongoService.getOrCreateGuildConfig(guild.id);
    if (config.notificationChannelId) {
      const channel = await guild.channels.fetch(config.notificationChannelId).catch(() => null);
      if (channel && channel.isTextBased()) return channel;
    }
  } catch (err) {
    logger.debug('Error fetching notification channel from GuildConfig', { error: err.message, guildId: guild.id });
  }
  // Fallback to system channel
  return guild.systemChannel;
}

// Feature #3: Track recent DM prompts to avoid spamming users
const recentPrompts = new Map();
const PROMPT_COOLDOWN = 5 * 60 * 1000; // 5 minutes

/**
 * Voice State Update Event Handler
 * Monitors voice channel state changes to:
 * - Track when users join/leave during recordings
 * - Auto-stop recordings when channel becomes empty
 * - Update participant metadata
 */
export default {
  name: 'voiceStateUpdate',
  once: false,

  /**
   * Execute voice state update handler
   * @param {VoiceState} oldState - Previous voice state
   * @param {VoiceState} newState - New voice state
   * @param {Client} client - Discord client
   */
  async execute(oldState, newState, client) {
    try {
      const member = newState.member || oldState.member;
      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

      // User left a voice channel
      if (oldChannel && !newChannel) {
        await handleUserLeftChannel(oldChannel, member);
      }

      // User joined a voice channel
      if (!oldChannel && newChannel) {
        await handleUserJoinedChannel(newChannel, member, client);
        // Feature #3: Send DM prompt
        await sendRecordingPromptIfAppropriate(newChannel, member, client);
      }

      // User switched channels
      if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
        await handleUserLeftChannel(oldChannel, member);
        await handleUserJoinedChannel(newChannel, member, client);
        // Feature #3: Send DM prompt for new channel
        await sendRecordingPromptIfAppropriate(newChannel, member, client);
      }
    } catch (error) {
      logger.error('Error in voiceStateUpdate handler', {
        error: error.message,
        stack: error.stack,
      });
    }
  },
};

/**
 * Handle user leaving a voice channel
 * @param {VoiceChannel} channel - Voice channel user left
 * @param {GuildMember} member - Member who left
 */
async function handleUserLeftChannel(channel, member) {
  try {
    // Check if there's an active recording in this channel
    const activeRecordings = audioRecorder.getActiveRecordings();
    const channelRecording = activeRecordings.find(
      (r) => r.channelId === channel.id
    );

    if (!channelRecording) {
      return; // No active recording
    }

    logger.debug(`User left voice channel during recording`, {
      userId: member.id,
      username: member.displayName,
      channelId: channel.id,
      meetingId: channelRecording.meetingId,
    });

    // Get the full session to access startTime
    const session = audioRecorder.getSession(channelRecording.meetingId);

    // Update participant data
    try {
      // Calculate duration properly - use session startTime, not channelRecording
      const participantDuration = session && session.startTime
        ? Math.floor((Date.now() - session.startTime) / 1000) // Convert to seconds
        : 0;

      await mongoService.updateParticipant(
        channelRecording.meetingId,
        member.id,
        {
          leftAt: new Date(),
          duration: participantDuration,
        }
      );
    } catch (error) {
      logger.warn('Could not update participant in database', {
        error: error.message,
        meetingId: channelRecording.meetingId,
        userId: member.id,
      });
    }

    // FEATURE #4: Check if channel is now empty (excluding bots)
    const remainingMembers = channel.members.filter((m) => !m.user.bot);

    if (remainingMembers.size === 0) {
      logger.info('Voice channel empty, starting 30-second auto-stop timer', {
        meetingId: channelRecording.meetingId,
        channelId: channel.id,
        channelName: channel.name,
      });

      // Start 30-second timer
      audioRecorder.startEmptyChannelTimer(
        channelRecording.meetingId,
        async () => {
          // This callback is executed after 30 seconds if no one rejoins
          await executeAutoStop(channelRecording.meetingId, channel);
        }
      );
    }
  } catch (error) {
    logger.error('Error handling user left channel', {
      error: error.message,
      channelId: channel.id,
    });
  }
}

/**
 * Handle user joining a voice channel
 * @param {VoiceChannel} channel - Voice channel user joined
 * @param {GuildMember} member - Member who joined
 * @param {Client} client - Discord client
 */
async function handleUserJoinedChannel(channel, member, client) {
  try {
    // Check if there's an active recording in this channel
    const activeRecordings = audioRecorder.getActiveRecordings();
    const channelRecording = activeRecordings.find((r) => r.channelId === channel.id);

    if (!channelRecording) {
      return; // No active recording
    }

    logger.debug(`User joined voice channel during recording`, {
      userId: member.id,
      username: member.displayName,
      channelId: channel.id,
      meetingId: channelRecording.meetingId,
    });

    // FEATURE #4: Cancel auto-stop timer if someone rejoins
    const session = audioRecorder.getSession(channelRecording.meetingId);
    if (session && session.emptyChannelTimer) {
      audioRecorder.cancelEmptyChannelTimer(channelRecording.meetingId);
      logger.info('User rejoined, auto-stop timer cancelled', {
        meetingId: channelRecording.meetingId,
        userId: member.id,
        username: member.displayName,
      });
    }

    // Add new participant to meeting
    try {
      await mongoService.addParticipant(channelRecording.meetingId, {
        userId: member.id,
        username: member.displayName,
        joinedAt: new Date(),
        duration: 0,
        wasDeafened: member.voice.deaf,
        speakingTime: 0,
      });

      logger.info('Added participant to ongoing recording', {
        meetingId: channelRecording.meetingId,
        userId: member.id,
        username: member.displayName,
      });
    } catch (error) {
      logger.warn('Could not add participant to database', {
        error: error.message,
        meetingId: channelRecording.meetingId,
        userId: member.id,
      });
    }
  } catch (error) {
    logger.error('Error handling user joined channel', {
      error: error.message,
      channelId: channel.id,
    });
  }
}

// ============================================
// FEATURE #3: DM PROMPT LOGIC
// ============================================

/**
 * Send recording prompt DM if appropriate
 * @param {VoiceChannel} channel - Voice channel user joined
 * @param {GuildMember} member - Member who joined
 * @param {Client} client - Discord client
 */
async function sendRecordingPromptIfAppropriate(channel, member, client) {
  try {
    // Don't prompt bots
    if (member.user.bot) {
      return;
    }

    // Check if user was recently prompted for this channel (cooldown)
    if (isOnCooldown(member.id, channel.id)) {
      logger.debug('User on cooldown for voice join prompt', {
        userId: member.id,
        channelId: channel.id,
      });
      return;
    }

    // Check if there's already an active recording in this channel
    const activeRecordings = audioRecorder.getActiveRecordings();
    const existingRecording = activeRecordings.find((r) => r.channelId === channel.id);

    if (existingRecording) {
      // Recording already active - send different message
      await sendRecordingActiveMessage(member, channel, existingRecording);
      return;
    }

    // Check if bot has permission to join voice channel
    const permissions = channel.permissionsFor(client.user);
    if (!permissions || !permissions.has('Connect') || !permissions.has('Speak')) {
      logger.warn('Bot lacks permission to join voice channel', {
        channelId: channel.id,
        channelName: channel.name,
        guildId: channel.guildId,
      });
      return; // Don't prompt if we can't record anyway
    }

    // Send DM prompt
    await sendRecordingPrompt(member, channel, client);

    // Track this prompt
    trackPrompt(member.id, channel.id);
  } catch (error) {
    logger.error('Error sending recording prompt', {
      error: error.message,
      channelId: channel.id,
      userId: member.id,
    });
  }
}

function isOnCooldown(userId, channelId) {
  if (!recentPrompts.has(userId)) {
    return false;
  }
  const userPrompts = recentPrompts.get(userId);
  if (!userPrompts.has(channelId)) {
    return false;
  }
  const lastPrompt = userPrompts.get(channelId);
  const timeSincePrompt = Date.now() - lastPrompt;
  return timeSincePrompt < PROMPT_COOLDOWN;
}

function trackPrompt(userId, channelId) {
  if (!recentPrompts.has(userId)) {
    recentPrompts.set(userId, new Map());
  }
  const userPrompts = recentPrompts.get(userId);
  userPrompts.set(channelId, Date.now());
  setTimeout(() => {
    const userPrompts = recentPrompts.get(userId);
    if (userPrompts) {
      userPrompts.delete(channelId);
      if (userPrompts.size === 0) {
        recentPrompts.delete(userId);
      }
    }
  }, PROMPT_COOLDOWN);
}

async function sendRecordingPrompt(member, channel, client) {
  try {
    const embed = new EmbedBuilder()
      .setColor('#32B8C6')
      .setTitle('🎙️ Start Recording?')
      .setDescription(
        `You joined **${channel.name}** in **${channel.guild.name}**.\n\n` +
        `Would you like to start recording this meeting?`
      )
      .addFields(
        {
          name: '📍 Voice Channel',
          value: channel.name,
          inline: true,
        },
        {
          name: '👥 Current Members',
          value: `${channel.members.size} members`,
          inline: true,
        }
      )
      .setFooter({ text: 'This prompt expires in 5 minutes' })
      .setTimestamp();

    const startButton = new ButtonBuilder()
      .setCustomId(`start_recording_${channel.id}_${Date.now()}`)
      .setLabel('Start Recording')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success);

    const dismissButton = new ButtonBuilder()
      .setCustomId(`dismiss_prompt_${Date.now()}`)
      .setLabel('No Thanks')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(startButton, dismissButton);

    const dmMessage = await member.send({
      embeds: [embed],
      components: [row],
    });

    logger.info('Sent recording prompt DM', {
      userId: member.id,
      username: member.displayName,
      channelId: channel.id,
      channelName: channel.name,
    });

    const collector = dmMessage.createMessageComponentCollector({
      time: 5 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      try {
        if (interaction.customId.startsWith('start_recording_')) {
          await handleStartRecording(interaction, member, channel, client);
        } else if (interaction.customId.startsWith('dismiss_prompt_')) {
          await handleDismiss(interaction);
        }
        collector.stop('button_clicked');
      } catch (error) {
        logger.error('Error handling button interaction', {
          error: error.message,
          customId: interaction.customId,
          userId: member.id,
        });
        await interaction.reply({
          content: '❌ An error occurred. Please try using `/start-recording` command instead.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => { });
      }
    });

    collector.on('end', async (collected, reason) => {
      try {
        startButton.setDisabled(true);
        dismissButton.setDisabled(true);
        await dmMessage.edit({ components: [row] });
        logger.debug('Voice join prompt collector ended', {
          reason,
          collected: collected.size,
          userId: member.id,
        });
      } catch (error) {
        logger.warn('Could not disable buttons on DM', {
          error: error.message,
        });
      }
    });
  } catch (error) {
    if (error.code === 50007) {
      logger.debug('Cannot send DM to user (DMs disabled)', {
        userId: member.id,
        username: member.displayName,
      });
    } else {
      logger.warn('Error sending recording prompt DM', {
        error: error.message,
        userId: member.id,
      });
    }
  }
}

async function handleStartRecording(interaction, member, channel, client) {
  await interaction.deferReply();
  try {
    const freshMember = await channel.guild.members.fetch(member.id);
    if (!freshMember.voice.channel || freshMember.voice.channel.id !== channel.id) {
      const embed = createErrorEmbed(
        'Not in Voice Channel',
        `You are no longer in ${channel.name}. Please rejoin and try again.`
      );
      return await interaction.editReply({ embeds: [embed] });
    }
    const activeRecordings = audioRecorder.getActiveRecordings();
    const existingRecording = activeRecordings.find((r) => r.channelId === channel.id);
    if (existingRecording) {
      const embed = createErrorEmbed(
        'Recording Already Active',
        `Recording is already in progress in ${channel.name}.\nMeeting ID: \`${existingRecording.meetingId}\``
      );
      return await interaction.editReply({ embeds: [embed] });
    }
    const meetingId = `mtg_${uuidv4().substring(0, 8)}`;
    const participants = Array.from(channel.members.values());
    const participantNames = participants.map((m) => m.displayName);
    const meetingData = {
      meetingId,
      channelId: channel.id,
      channelName: channel.name,
      guildId: channel.guildId,
      guildName: channel.guild.name,
      startTimestamp: new Date(),
      recordingStatus: 'recording',
      participants: participants.map((m) => ({
        userId: m.id,
        username: m.displayName,
        joinedAt: new Date(),
        duration: 0,
        wasDeafened: m.voice.deaf,
        speakingTime: 0,
      })),
    };
    await mongoService.createMeeting(meetingData);
    await audioRecorder.startRecording(channel, meetingId, client);
    const { embed: startEmbed, components } = createRecordingStartEmbed(
      channel.name,
      participantNames,
      meetingId,
      member.id
    );
    logger.info('Recording started via DM prompt', {
      meetingId,
      channelName: channel.name,
      participants: participantNames.length,
      guildId: channel.guildId,
      startedBy: member.id,
    });
    const replyMessage = await interaction.editReply({
      embeds: [startEmbed],
      components,
      content: `✅ **Recording Started**\nMeeting ID: \`${meetingId}\``,
    });

    // Set up button collector for stop button
    if (components.length > 0) {
      const { executeStopRecording } = await import('../commands/stop-recording.js');
      const collector = replyMessage.createMessageComponentCollector({
        time: 24 * 60 * 60 * 1000, // 24 hours
      });

      collector.on('collect', async (buttonInteraction) => {
        try {
          // Check permissions
          if (buttonInteraction.user.id !== member.id &&
            !buttonInteraction.member?.permissions.has('Administrator')) {
            await buttonInteraction.reply({
              content: '❌ You do not have permission to stop this recording.\nOnly the person who started it or server administrators can stop it.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await buttonInteraction.deferReply({ flags: MessageFlags.None });
          logger.info('Stop button clicked in DM', {
            meetingId,
            clickedBy: buttonInteraction.user.id,
          });

          // Execute stop logic
          await executeStopRecording(
            channel.guildId,
            channel,
            buttonInteraction,
            meetingId
          );

          // Disable button
          components[0].components[0].setDisabled(true);
          await replyMessage.edit({ components });
          collector.stop('button_clicked');
        } catch (error) {
          logger.error('Error handling stop button click in DM', {
            error: error.message,
            meetingId,
            userId: buttonInteraction.user.id,
          });

          const errorEmbed = createErrorEmbed(
            'Error',
            'Failed to stop recording via button. Please try `/stop-recording` command instead.'
          );

          if (buttonInteraction.deferred) {
            await buttonInteraction.editReply({ embeds: [errorEmbed] });
          } else {
            await buttonInteraction.reply({
              embeds: [errorEmbed],
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      });

      collector.on('end', async (collected, reason) => {
        try {
          if (reason === 'time') {
            components[0].components[0].setDisabled(true);
            await replyMessage.edit({ components });
            logger.debug('Stop button disabled due to timeout in DM', {
              meetingId,
              reason,
            });
          }
        } catch (error) {
          logger.warn('Could not disable stop button in DM', {
            error: error.message,
            meetingId,
          });
        }
      });
    }
  } catch (error) {
    logger.error('Error starting recording from DM prompt', {
      error: error.message,
      userId: member.id,
      channelId: channel.id,
    });
    const embed = createErrorEmbed(
      'Recording Error',
      'Failed to start recording. Please try using `/start-recording` command instead.'
    );
    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleDismiss(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#808080')
    .setDescription('👍 No problem! You can always start recording using `/start-recording` command.')
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
  logger.debug('User dismissed recording prompt', {
    userId: interaction.user.id,
  });
}

async function sendRecordingActiveMessage(member, channel, recording) {
  try {
    const duration = Math.floor((Date.now() - (recording.duration || 0)) / 1000);
    const durationStr = `${Math.floor(duration / 60)}m ${duration % 60}s`;
    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('🔴 Recording in Progress')
      .setDescription(
        `You joined **${channel.name}** where a recording is already in progress.\n\n` +
        `**Meeting ID**: \`${recording.meetingId}\`\n` +
        `**Duration**: ${durationStr}\n\n` +
        `⚠️ Your audio will be recorded from now on.`
      )
      .setFooter({ text: 'Use /stop-recording to end the recording' })
      .setTimestamp();
    await member.send({ embeds: [embed] });
    logger.info('Sent recording active notification', {
      userId: member.id,
      meetingId: recording.meetingId,
    });
  } catch (error) {
    if (error.code === 50007) {
      logger.debug('Cannot send DM to user (DMs disabled)', {
        userId: member.id,
      });
    } else {
      logger.warn('Error sending recording active message', {
        error: error.message,
        userId: member.id,
      });
    }
  }
}

/**
 * FEATURE #4: Execute auto-stop after timer expires
 * @param {string} meetingId - Meeting identifier
 * @param {VoiceChannel} channel - Voice channel
 */
async function executeAutoStop(meetingId, channel) {
  try {
    logger.info('Executing auto-stop for empty channel', {
      meetingId,
      channelId: channel.id,
      channelName: channel.name,
    });

    // Stop recording
    const recordingInfo = await audioRecorder.stopRecording(meetingId);

    // Update meeting status
    await mongoService.updateMeeting(meetingId, {
      recordingStatus: 'completed',
      endTimestamp: new Date(),
      duration: recordingInfo.duration,
      endReason: 'auto_empty_channel',
    });

    logger.info('Recording auto-stopped successfully', {
      meetingId,
      duration: recordingInfo.duration,
      reason: 'Channel empty for 30 seconds',
    });

    // Notify in notification channel if configured
    const notificationChannel = await getNotificationChannel(channel.guild);
    if (notificationChannel) {
      const durationMin = Math.floor(recordingInfo.duration / 60);
      const durationSec = recordingInfo.duration % 60;

      await notificationChannel.send(
        `🔴 **Recording Auto-Stopped**\n` +
        `Meeting \`${meetingId}\` ended automatically (channel empty for 30 seconds).\n\n` +
        `**Duration**: ${durationMin}m ${durationSec}s\n` +
        `**Participants**: ${recordingInfo.participantCount}\n` +
        `**Channel**: ${channel.name}\n\n` +
        `Processing will continue automatically. Summary will be posted when ready.`
      );
    }
  } catch (error) {
    logger.error('Error executing auto-stop', {
      error: error.message,
      stack: error.stack,
      meetingId,
    });

    // Try to notify about error
    const notificationChannel = await getNotificationChannel(channel.guild);
    if (notificationChannel) {
      await notificationChannel
        .send(
          `⚠️ **Auto-Stop Error**\n` +
          `Failed to auto-stop recording \`${meetingId}\`: ${error.message}\n` +
          `Please use \`/stop-recording\` manually.`
        )
        .catch(() => { });
    }
  }
}
