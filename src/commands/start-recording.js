import { SlashCommandBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { executeStopRecording } from './stop-recording.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import mongoService from '../services/mongoService.js';
import {
  createRecordingStartEmbed,
  createErrorEmbed,
} from '../utils/embedBuilder.js';

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

/**
 * Start Recording Command
 * Initiates audio recording in the user's voice channel
 * Creates meeting record in MongoDB and begins voice capture
 */
export const data = new SlashCommandBuilder()
  .setName('start-recording')
  .setDescription('Start recording the current voice channel meeting')
  .addStringOption((option) =>
    option
      .setName('title')
      .setDescription('Optional: Title for this meeting')
      .setRequired(false)
  );

/**
 * Execute start-recording command
 * @param {Interaction} interaction - Discord interaction object
 */
export async function execute(interaction) {
  // Use flags instead of deprecated ephemeral option
  await interaction.deferReply({ flags: MessageFlags.None });

  try {
    // Check if user is in a voice channel
    if (!interaction.member.voice.channel) {
      const embed = createErrorEmbed(
        'Not in Voice Channel',
        'You must be in a voice channel to start recording.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    const voiceChannel = interaction.member.voice.channel;
    const participants = Array.from(voiceChannel.members.values());
    const participantNames = participants.map((m) => m.displayName);

    // Generate unique meeting ID
    const meetingId = `mtg_${uuidv4().substring(0, 8)}`;

    // Create meeting record in MongoDB
    const meetingData = {
      meetingId,
      channelId: voiceChannel.id,
      channelName: voiceChannel.name,
      guildId: interaction.guildId,
      guildName: interaction.guild.name,
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

    // Start audio recording
    const recordingSession = await audioRecorder.startRecording(
      voiceChannel,
      meetingId,
      interaction.client
    );

    // FEATURE #5: Create embed with stop button
    const { embed: startEmbed, components } = createRecordingStartEmbed(
      voiceChannel.name,
      participantNames,
      meetingId,
      interaction.user.id
    );

    logger.info('Recording started', {
      meetingId,
      channelName: voiceChannel.name,
      participants: participantNames.length,
      guildId: interaction.guildId,
      startedBy: interaction.user.id,
    });

    // Send message with stop button to notification channel if configured
    const notificationChannel = await getNotificationChannel(interaction.guild);
    let replyMessage;
    if (notificationChannel && notificationChannel.id !== interaction.channel.id) {
      // Post in notification channel, reply in interaction channel
      replyMessage = await notificationChannel.send({
        embeds: [startEmbed],
        components,
        content: `🎙️ **Recording Started**\nMeeting ID: \`${meetingId}\``,
      });
      await interaction.editReply({
        content: `✅ **Recording Started** in ${notificationChannel} (Meeting ID: \`${meetingId}\`)`,
      });
    } else {
      // Post in current channel
      replyMessage = await interaction.editReply({
        embeds: [startEmbed],
        components,
        content: `🎙️ **Recording Started**\nMeeting ID: \`${meetingId}\``,
      });
    }

    // FEATURE #5: Set up button collector
    if (components.length > 0) {
      const collector = replyMessage.createMessageComponentCollector({
        time: 24 * 60 * 60 * 1000, // 24 hours
      });

      collector.on('collect', async (buttonInteraction) => {
        try {
          // Check permissions
          if (!canStopRecording(buttonInteraction, interaction.user.id)) {
            await buttonInteraction.reply({
              content:
                '❌ You do not have permission to stop this recording.\nOnly the person who started it or server administrators can stop it.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // Defer reply
          await buttonInteraction.deferReply({ flags: MessageFlags.None });

          logger.info('Stop button clicked', {
            meetingId,
            clickedBy: buttonInteraction.user.id,
            clickedByUsername: buttonInteraction.user.tag,
            startedBy: interaction.user.id,
          });

          // Execute stop logic
          await executeStopRecording(
            interaction.guildId,
            buttonInteraction.channel,
            buttonInteraction,
            meetingId
          );

          // Disable button
          components[0].components[0].setDisabled(true);
          await replyMessage.edit({ components });

          collector.stop('button_clicked');
        } catch (error) {
          logger.error('Error handling stop button click', {
            error: error.message,
            stack: error.stack,
            meetingId,
            userId: buttonInteraction.user.id,
          });

          const errorEmbed = createErrorEmbed(
            'Error',
            'Failed to stop recording via button. Please try `/stop-recording` command.'
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
          // Disable button on timeout
          if (reason === 'time') {
            components[0].components[0].setDisabled(true);
            await replyMessage.edit({ components });
            logger.debug('Stop button disabled due to timeout', {
              meetingId,
              reason,
            });
          }
        } catch (error) {
          logger.warn('Could not disable stop button', {
            error: error.message,
            meetingId,
          });
        }
      });
    }
  } catch (error) {
    logger.error('Error executing start-recording command', {
      error: error.message,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    const embed = createErrorEmbed(
      'Recording Error',
      'Failed to start recording. Please try again.'
    );
    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Check if user can stop the recording
 * @param {ButtonInteraction} interaction - Button interaction
 * @param {string} recordingStarterId - User ID who started recording
 * @returns {boolean}
 */
function canStopRecording(interaction, recordingStarterId) {
  // Is recording starter
  if (interaction.user.id === recordingStarterId) {
    return true;
  }

  // Is administrator
  if (
    interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return true;
  }

  return false;
}

export const category = 'recording';
export const permissions = [];
