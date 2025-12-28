# Feature #3: Voice Channel Join DM Prompt

## Implementation Overview

This feature sends a DM to users when they join a voice channel, prompting them to start recording if desired. It uses Discord.js buttons for user interaction and handles edge cases like disabled DMs, existing recordings, and permission issues gracefully.

**Key Design Decisions**:
- Listen to `voiceStateUpdate` events (already exists, will enhance)
- Only prompt when user joins (not when switching channels or unmuting)
- Don't spam users - track recent prompts per user
- Handle button interactions with 5-minute timeout
- Gracefully handle DM failures

---

## Files to Create

### 1. src/events/voiceJoinPrompt.js

```javascript
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import { v4 as uuidv4 } from 'uuid';
import mongoService from '../services/mongoService.js';
import { createRecordingStartEmbed, createErrorEmbed } from '../utils/embedBuilder.js';

/**
 * Track recent DM prompts to avoid spamming users
 * Map<userId, Map<channelId, timestamp>>
 */
const recentPrompts = new Map();
const PROMPT_COOLDOWN = 5 * 60 * 1000; // 5 minutes

/**
 * Voice Join Prompt Handler
 * Sends DM to users asking if they want to start recording
 * Attached to voiceStateUpdate event
 */
export default {
  name: 'voiceStateUpdate',
  once: false,

  /**
   * Execute voice join prompt logic
   * @param {VoiceState} oldState - Previous voice state
   * @param {VoiceState} newState - New voice state
   * @param {Client} client - Discord client
   */
  async execute(oldState, newState, client) {
    try {
      const member = newState.member || oldState.member;
      const oldChannel = oldState.channel;
      const newChannel = newState.channel;

      // Only proceed if user joined a voice channel (not switched or unmuted)
      if (!oldChannel && newChannel) {
        await handleVoiceJoin(newChannel, member, client);
      }
    } catch (error) {
      logger.error('Error in voice join prompt handler', {
        error: error.message,
        stack: error.stack,
      });
    }
  },
};

/**
 * Handle user joining a voice channel
 * Send DM prompt if appropriate
 * @param {VoiceChannel} channel - Voice channel user joined
 * @param {GuildMember} member - Member who joined
 * @param {Client} client - Discord client
 */
async function handleVoiceJoin(channel, member, client) {
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
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
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
    logger.error('Error handling voice join', {
      error: error.message,
      channelId: channel.id,
      userId: member.id,
    });
  }
}

/**
 * Check if user is on cooldown for this channel
 * @param {string} userId - Discord user ID
 * @param {string} channelId - Voice channel ID
 * @returns {boolean}
 */
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

/**
 * Track that we sent a prompt to this user for this channel
 * @param {string} userId - Discord user ID
 * @param {string} channelId - Voice channel ID
 */
function trackPrompt(userId, channelId) {
  if (!recentPrompts.has(userId)) {
    recentPrompts.set(userId, new Map());
  }

  const userPrompts = recentPrompts.get(userId);
  userPrompts.set(channelId, Date.now());

  // Clean up old entries after cooldown expires
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

/**
 * Send DM to user asking if they want to start recording
 * @param {GuildMember} member - Member to DM
 * @param {VoiceChannel} channel - Voice channel they joined
 * @param {Client} client - Discord client
 */
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

    // Create buttons
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

    // Send DM
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

    // Set up button collector
    const collector = dmMessage.createMessageComponentCollector({
      time: 5 * 60 * 1000, // 5 minutes
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
        }).catch(() => {});
      }
    });

    collector.on('end', async (collected, reason) => {
      try {
        // Disable buttons after timeout or click
        startButton.setDisabled(true);
        dismissButton.setDisabled(true);

        await dmMessage.edit({
          components: [row],
        });

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
    // Most likely: User has DMs disabled
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

/**
 * Handle "Start Recording" button click
 * @param {ButtonInteraction} interaction - Button interaction
 * @param {GuildMember} member - Member who clicked
 * @param {VoiceChannel} channel - Voice channel
 * @param {Client} client - Discord client
 */
async function handleStartRecording(interaction, member, channel, client) {
  await interaction.deferReply();

  try {
    // Verify user is still in the voice channel
    const freshMember = await channel.guild.members.fetch(member.id);
    if (!freshMember.voice.channel || freshMember.voice.channel.id !== channel.id) {
      const embed = createErrorEmbed(
        'Not in Voice Channel',
        `You are no longer in ${channel.name}. Please rejoin and try again.`
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Check if recording already started
    const activeRecordings = audioRecorder.getActiveRecordings();
    const existingRecording = activeRecordings.find((r) => r.channelId === channel.id);

    if (existingRecording) {
      const embed = createErrorEmbed(
        'Recording Already Active',
        `Recording is already in progress in ${channel.name}.\nMeeting ID: \`${existingRecording.meetingId}\``
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Generate meeting ID
    const meetingId = `mtg_${uuidv4().substring(0, 8)}`;

    // Get participants
    const participants = Array.from(channel.members.values());
    const participantNames = participants.map((m) => m.displayName);

    // Create meeting record
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

    // Start recording
    await audioRecorder.startRecording(channel, meetingId, client);

    // Create success embed
    const startEmbed = createRecordingStartEmbed(channel.name, participantNames);

    logger.info('Recording started via DM prompt', {
      meetingId,
      channelName: channel.name,
      participants: participantNames.length,
      guildId: channel.guildId,
      startedBy: member.id,
    });

    await interaction.editReply({
      embeds: [startEmbed],
      content: `✅ **Recording Started**\nMeeting ID: \`${meetingId}\``,
    });
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

/**
 * Handle "No Thanks" button click
 * @param {ButtonInteraction} interaction - Button interaction
 */
async function handleDismiss(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#808080')
    .setDescription('👍 No problem! You can always start recording using `/start-recording` command.')
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
  });

  logger.debug('User dismissed recording prompt', {
    userId: interaction.user.id,
  });
}

/**
 * Send message when recording is already active
 * @param {GuildMember} member - Member who joined
 * @param {VoiceChannel} channel - Voice channel
 * @param {Object} recording - Active recording info
 */
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
```

---

## Files to Modify

### 1. src/index.js

The `voiceJoinPrompt` event handler needs to be loaded. Since we're using the same event name (`voiceStateUpdate`) as the existing handler, we need to merge them or handle both.

**Approach**: Modify the existing `voiceStateUpdate.js` to include the DM prompt logic.

**Alternative Approach** (Recommended): Load both event handlers. Discord.js allows multiple handlers for the same event.

**No changes needed to index.js** - The event loading logic at lines 199-234 already loads all events from the `events/` directory. Simply placing `voiceJoinPrompt.js` in that directory will register it.

However, we need to **rename** our new file to avoid conflicts:

**Rename**: `voiceJoinPrompt.js` → `voiceJoinPrompt.js` (keep as is)

**Modify existing**: `src/events/voiceStateUpdate.js`

Actually, looking at the existing code, the file is already there handling user join/leave for recordings. We should **merge** the DM prompt logic into the existing file.

### Modified Approach: Enhance src/events/voiceStateUpdate.js

Add the DM prompt logic to the existing `voiceStateUpdate.js` file:

```javascript
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
 * Track recent DM prompts to avoid spamming users
 * Map<userId, Map<channelId, timestamp>>
 */
const recentPrompts = new Map();
const PROMPT_COOLDOWN = 5 * 60 * 1000; // 5 minutes

/**
 * Voice State Update Event Handler
 * Monitors voice channel state changes to:
 * - Send DM prompts when users join channels (Feature #3)
 * - Track when users join/leave during recordings
 * - Auto-stop recordings when channel becomes empty (Feature #4)
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
      const participantDuration =
        session && session.startTime
          ? Math.floor((Date.now() - session.startTime) / 1000) // Convert to seconds
          : 0;

      await mongoService.updateParticipant(channelRecording.meetingId, member.id, {
        leftAt: new Date(),
        duration: participantDuration,
      });
    } catch (error) {
      logger.warn('Could not update participant in database', {
        error: error.message,
        meetingId: channelRecording.meetingId,
        userId: member.id,
      });
    }

    // Check if channel is now empty (excluding bots)
    const remainingMembers = channel.members.filter((m) => !m.user.bot);

    if (remainingMembers.size === 0) {
      logger.info('Voice channel empty, auto-stopping recording', {
        meetingId: channelRecording.meetingId,
        channelId: channel.id,
        channelName: channel.name,
      });

      // Auto-stop the recording
      try {
        const recordingInfo = await audioRecorder.stopRecording(
          channelRecording.meetingId
        );

        // Update meeting status
        await mongoService.updateMeeting(channelRecording.meetingId, {
          recordingStatus: 'completed',
          endTimestamp: new Date(),
          duration: recordingInfo.duration,
          endReason: 'auto_empty_channel',
        });

        logger.info('Recording auto-stopped successfully', {
          meetingId: channelRecording.meetingId,
          duration: recordingInfo.duration,
        });

        // Optionally notify in text channel
        if (channel.guild.systemChannel) {
          await channel.guild.systemChannel.send(
            `🔴 **Recording Auto-Stopped**\n` +
              `Meeting \`${channelRecording.meetingId}\` ended because everyone left the voice channel.\n` +
              `Duration: ${recordingInfo.duration}s | Participants: ${recordingInfo.participantCount}\n` +
              `Processing will continue automatically.`
          );
        }
      } catch (error) {
        logger.error('Error auto-stopping recording', {
          error: error.message,
          meetingId: channelRecording.meetingId,
        });
      }
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
    const channelRecording = activeRecordings.find(
      (r) => r.channelId === channel.id
    );

    if (!channelRecording) {
      return; // No active recording
    }

    logger.debug(`User joined voice channel during recording`, {
      userId: member.id,
      username: member.displayName,
      channelId: channel.id,
      meetingId: channelRecording.meetingId,
    });

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

/**
 * Check if user is on cooldown for this channel
 * @param {string} userId - Discord user ID
 * @param {string} channelId - Voice channel ID
 * @returns {boolean}
 */
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

/**
 * Track that we sent a prompt to this user for this channel
 * @param {string} userId - Discord user ID
 * @param {string} channelId - Voice channel ID
 */
function trackPrompt(userId, channelId) {
  if (!recentPrompts.has(userId)) {
    recentPrompts.set(userId, new Map());
  }

  const userPrompts = recentPrompts.get(userId);
  userPrompts.set(channelId, Date.now());

  // Clean up old entries after cooldown expires
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

/**
 * Send DM to user asking if they want to start recording
 * @param {GuildMember} member - Member to DM
 * @param {VoiceChannel} channel - Voice channel they joined
 * @param {Client} client - Discord client
 */
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

    // Create buttons
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

    // Send DM
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

    // Set up button collector
    const collector = dmMessage.createMessageComponentCollector({
      time: 5 * 60 * 1000, // 5 minutes
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

        await interaction
          .reply({
            content:
              '❌ An error occurred. Please try using `/start-recording` command instead.',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    });

    collector.on('end', async (collected, reason) => {
      try {
        // Disable buttons after timeout or click
        startButton.setDisabled(true);
        dismissButton.setDisabled(true);

        await dmMessage.edit({
          components: [row],
        });

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
    // Most likely: User has DMs disabled
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

/**
 * Handle "Start Recording" button click
 * @param {ButtonInteraction} interaction - Button interaction
 * @param {GuildMember} member - Member who clicked
 * @param {VoiceChannel} channel - Voice channel
 * @param {Client} client - Discord client
 */
async function handleStartRecording(interaction, member, channel, client) {
  await interaction.deferReply();

  try {
    // Verify user is still in the voice channel
    const freshMember = await channel.guild.members.fetch(member.id);
    if (!freshMember.voice.channel || freshMember.voice.channel.id !== channel.id) {
      const embed = createErrorEmbed(
        'Not in Voice Channel',
        `You are no longer in ${channel.name}. Please rejoin and try again.`
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Check if recording already started
    const activeRecordings = audioRecorder.getActiveRecordings();
    const existingRecording = activeRecordings.find((r) => r.channelId === channel.id);

    if (existingRecording) {
      const embed = createErrorEmbed(
        'Recording Already Active',
        `Recording is already in progress in ${channel.name}.\nMeeting ID: \`${existingRecording.meetingId}\``
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Generate meeting ID
    const meetingId = `mtg_${uuidv4().substring(0, 8)}`;

    // Get participants
    const participants = Array.from(channel.members.values());
    const participantNames = participants.map((m) => m.displayName);

    // Create meeting record
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

    // Start recording
    await audioRecorder.startRecording(channel, meetingId, client);

    // Create success embed
    const startEmbed = createRecordingStartEmbed(channel.name, participantNames);

    logger.info('Recording started via DM prompt', {
      meetingId,
      channelName: channel.name,
      participants: participantNames.length,
      guildId: channel.guildId,
      startedBy: member.id,
    });

    await interaction.editReply({
      embeds: [startEmbed],
      content: `✅ **Recording Started**\nMeeting ID: \`${meetingId}\``,
    });
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

/**
 * Handle "No Thanks" button click
 * @param {ButtonInteraction} interaction - Button interaction
 */
async function handleDismiss(interaction) {
  const embed = new EmbedBuilder()
    .setColor('#808080')
    .setDescription(
      '👍 No problem! You can always start recording using `/start-recording` command.'
    )
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
  });

  logger.debug('User dismissed recording prompt', {
    userId: interaction.user.id,
  });
}

/**
 * Send message when recording is already active
 * @param {GuildMember} member - Member who joined
 * @param {VoiceChannel} channel - Voice channel
 * @param {Object} recording - Active recording info
 */
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
```

---

## Database Changes

**None** - This feature doesn't require database schema changes.

---

## Environment Variables

**None needed** - Uses existing Discord configuration.

---

## Testing Procedure

### Manual Test Steps

#### Test 1: Basic DM Prompt
1. Join a voice channel
2. Verify you receive a DM with:
   - Embed showing channel name and member count
   - Two buttons: "Start Recording" and "No Thanks"
3. Click "No Thanks"
4. Verify message shows dismissal confirmation
5. Verify buttons are disabled

#### Test 2: Start Recording via DM
1. Join a different voice channel
2. Receive DM prompt
3. Click "Start Recording"
4. Verify:
   - Recording starts successfully
   - DM shows success message with meeting ID
   - Bot joins the voice channel
   - MongoDB has meeting record

#### Test 3: DMs Disabled
1. Disable DMs from server members in Discord settings
2. Join a voice channel
3. Verify:
   - No crash/error in bot logs
   - Log shows "Cannot send DM (DMs disabled)"
   - No DM received (expected)

#### Test 4: Recording Already Active
1. Start recording in a voice channel using `/start-recording`
2. Have another user join the same channel
3. Verify they receive a DM saying "Recording in Progress"
4. Verify they see meeting ID and duration
5. Verify no "Start Recording" button

#### Test 5: Multiple Users Join Simultaneously
1. Have 3 users join the same voice channel at nearly the same time
2. Verify:
   - Each user gets their own DM
   - No DMs get mixed up or lost
   - All collectors work independently

#### Test 6: Cooldown System
1. Join a voice channel (receive prompt)
2. Leave and immediately rejoin the same channel
3. Verify you do NOT receive a second prompt (cooldown active)
4. Wait 5+ minutes
5. Leave and rejoin
6. Verify you receive a new prompt (cooldown expired)

#### Test 7: Bot Lacks Permissions
1. Remove bot's "Connect" permission for a voice channel
2. Join that voice channel
3. Verify:
   - No DM received (bot can't record anyway)
   - Log shows "Bot lacks permission"

#### Test 8: User Leaves Before Clicking
1. Join a voice channel (receive DM)
2. Leave the voice channel before clicking any button
3. Click "Start Recording" button
4. Verify you receive error message "You are no longer in [channel]"

### Expected Logs

**Success Case**:
```
[INFO] Sent recording prompt DM { userId: '123...', username: 'User1', channelId: '789...', channelName: 'General' }
[INFO] Recording started via DM prompt { meetingId: 'mtg_abc12345', channelName: 'General', participants: 2, guildId: '456...', startedBy: '123...' }
```

**DMs Disabled**:
```
[DEBUG] Cannot send DM to user (DMs disabled) { userId: '123...', username: 'User1' }
```

**Recording Already Active**:
```
[INFO] Sent recording active notification { userId: '123...', meetingId: 'mtg_xyz98765' }
```

**Cooldown Active**:
```
[DEBUG] User on cooldown for voice join prompt { userId: '123...', channelId: '789...' }
```

**Permission Issue**:
```
[WARN] Bot lacks permission to join voice channel { channelId: '789...', channelName: 'Private', guildId: '456...' }
```

---

## Integration Notes

- This feature integrates with existing `voiceStateUpdate.js` event handler
- DM prompts are **non-intrusive** - failures don't break the bot
- Cooldown system prevents spam
- Works alongside Feature #4 (auto-stop) without conflicts
- No changes needed to other commands or services
