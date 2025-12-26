import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import mongoService from '../services/mongoService.js';
import {
  createRecordingStartEmbed,
  createErrorEmbed,
} from '../utils/embedBuilder.js';

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

    // Create and send start notification
    const startEmbed = createRecordingStartEmbed(
      voiceChannel.name,
      participantNames
    );

    logger.info('Recording started', {
      meetingId,
      channelName: voiceChannel.name,
      participants: participantNames.length,
      guildId: interaction.guildId,
    });

    await interaction.editReply({
      embeds: [startEmbed],
      content: `🎙️ **Recording Started**\nMeeting ID: \`${meetingId}\``,
    });

    // Send notification to guild (optional: to a configured channel)
    try {
      if (voiceChannel.guild.systemChannel) {
        await voiceChannel.guild.systemChannel.send({
          embeds: [startEmbed],
        });
      }
    } catch (error) {
      logger.warn('Could not send guild notification', {
        error: error.message,
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

export const category = 'recording';
export const permissions = [];
