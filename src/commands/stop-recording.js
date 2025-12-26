import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import mongoService from '../services/mongoService.js';
import transcriptionService from '../services/transcriptionService.js';
import perplexityService from '../services/perplexityService.js';
import { createMeetingSummaryEmbed, createErrorEmbed } from '../utils/embedBuilder.js';
import { AttachmentBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

/**
 * Stop Recording Command
 * Stops active recording and initiates processing pipeline:
 * 1. Finalize audio file
 * 2. Transcribe with speaker labels
 * 3. Generate AI summary via Perplexity
 * 4. Upload results to Discord and MongoDB
 */
export const data = new SlashCommandBuilder()
  .setName('stop-recording')
  .setDescription('Stop the current meeting recording and process results');

/**
 * Execute stop-recording command
 * @param {Interaction} interaction - Discord interaction object
 */
export async function execute(interaction) {
  // Use flags instead of deprecated ephemeral option
  await interaction.deferReply({ flags: MessageFlags.None });

  try {
    // Get active recordings for this guild
    const activeRecordings = audioRecorder.getActiveRecordings();

    // Filter recordings for this guild
    const guildRecordings = activeRecordings.filter(
      (r) => r.guildId === interaction.guildId
    );

    logger.debug('Active recordings check', {
      totalActive: activeRecordings.length,
      guildRecordings: guildRecordings.length,
      guildId: interaction.guildId,
    });

    if (guildRecordings.length === 0) {
      const embed = createErrorEmbed(
        'No Active Recording',
        'There is no active recording in this server.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Get the most recent recording for this guild
    const latestRecording = guildRecordings[guildRecordings.length - 1];
    const meetingId = latestRecording.meetingId;

    logger.info('Stopping recording', { meetingId, guildId: interaction.guildId });

    // Stop recording
    const recordingInfo = await audioRecorder.stopRecording(meetingId);

    // Validate recording info
    if (!recordingInfo.filePath) {
      throw new Error('Recording stopped but no file path returned');
    }

    logger.debug('Recording file details', {
      meetingId,
      filePath: recordingInfo.filePath,
      fileName: recordingInfo.fileName,
    });

    // Update meeting status and save audio file path
    await mongoService.updateMeeting(meetingId, {
      recordingStatus: 'processing',
      endTimestamp: new Date(),
      duration: recordingInfo.duration,
      audioFilePath: recordingInfo.filePath, // FIX: Save the audio file path
    });

    logger.info('Recording stopped, starting processing pipeline', {
      meetingId,
      duration: recordingInfo.duration,
      participants: recordingInfo.participantCount,
    });

    // Send processing status
    const processingEmbed = createErrorEmbed(
      'Processing Recording',
      `Meeting ${meetingId}\n⏳ Transcribing audio...\n⏳ Generating summary...\n⏳ Uploading results...`,
      'processing'
    );
    processingEmbed.setColor('#FFA500');

    const processingMessage = await interaction.editReply({
      embeds: [processingEmbed],
    });

    // Start background processing
    processRecording(meetingId, interaction.channel, processingMessage, interaction.client)
      .catch((error) => {
        logger.error('Error in background processing', {
          error: error.message,
          meetingId,
        });
      });

    logger.info('Processing pipeline initiated', { meetingId });
  } catch (error) {
    logger.error('Error executing stop-recording command', {
      error: error.message,
      stack: error.stack,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    const embed = createErrorEmbed(
      'Recording Error',
      'Failed to stop recording. Please try again.'
    );
    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Background processing pipeline for recording
 * Handles transcription, summary generation, and archival
 * @private
 * @param {string} meetingId - Meeting identifier
 * @param {TextChannel} channel - Discord text channel for posting results
 * @param {Message} processingMessage - Message to update with status
 * @param {Client} client - Discord client
 */
async function processRecording(meetingId, channel, processingMessage, client) {
  try {
    const meeting = await mongoService.findMeeting(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    // Validate audio file path exists
    if (!meeting.audioFilePath) {
      throw new Error(`Audio file path not found in meeting record: ${meetingId}`);
    }

    // Verify file actually exists on disk
    if (!fs.existsSync(meeting.audioFilePath)) {
      throw new Error(`Audio file does not exist on disk: ${meeting.audioFilePath}`);
    }

    logger.debug('Audio file validation passed', {
      meetingId,
      audioFilePath: meeting.audioFilePath,
    });

    // Step 1: Transcribe audio
    logger.info('Starting transcription', { meetingId });
    const transcription = await transcriptionService.transcribeAudio(
      meeting.audioFilePath,
      meeting.participants
    );

    // Save transcript
    const transcriptPath = await transcriptionService.saveTranscript(
      transcription.formattedTranscript,
      meetingId
    );

    await mongoService.saveTranscript(
      meetingId,
      transcription.formattedTranscript,
      transcriptPath
    );

    logger.info('Transcription completed', { meetingId });

    // Step 2: Generate summary via Perplexity
    logger.info('Generating summary via Perplexity API', { meetingId });
    const summary = await perplexityService.generateMeetingSummary(
      transcription.formattedTranscript,
      meeting.participants
    );

    await mongoService.saveSummary(meetingId, summary);
    logger.info('Summary generated and saved', { meetingId });

    // Step 3: Create rich Discord embed and upload files
    const updatedMeeting = await mongoService.findMeeting(meetingId);
    const embed = createMeetingSummaryEmbed(updatedMeeting);

    // Prepare file attachments
    const attachments = [];

    // Attach transcript file if it exists
    if (fs.existsSync(transcriptPath)) {
      attachments.push(new AttachmentBuilder(transcriptPath));
    }

    // Attach audio file if it exists
    if (
      meeting.audioFilePath &&
      fs.existsSync(meeting.audioFilePath) &&
      fs.statSync(meeting.audioFilePath).size < 25 * 1024 * 1024 // Discord 25MB limit
    ) {
      attachments.push(new AttachmentBuilder(meeting.audioFilePath));
    }

    // Post results to Discord
    const resultMessage = await channel.send({
      embeds: [embed],
      files: attachments,
      content: `🎉 **Meeting Complete** - ${updatedMeeting.meetingId}`,
    });

    // Store Discord message ID for reference
    await mongoService.updateMeeting(meetingId, {
      discordMessageId: resultMessage.id,
      recordingStatus: 'completed',
    });

    logger.info('Recording processing completed successfully', { meetingId });

    // Update processing message
    try {
      await processingMessage.edit({
        embeds: [embed],
        content: '✅ **Recording Processed Successfully**',
      });
    } catch (error) {
      logger.warn('Could not update processing message', {
        error: error.message,
      });
    }
  } catch (error) {
    logger.error('Error in recording processing pipeline', {
      error: error.message,
      stack: error.stack,
      meetingId,
    });

    // Record error in MongoDB
    try {
      const errorStage = error.message.includes('transcript')
        ? 'transcription'
        : error.message.includes('summary')
          ? 'summary'
          : 'upload';

      await mongoService.recordError(meetingId, errorStage, error.message);

      // Update meeting status
      await mongoService.updateMeeting(meetingId, {
        recordingStatus: 'failed',
      });
    } catch (dbError) {
      logger.error('Could not record processing error in database', {
        error: dbError.message,
      });
    }

    // Notify user of error
    try {
      const errorEmbed = createErrorEmbed(
        'Processing Failed',
        `Failed to process recording: ${error.message}`
      );
      await processingMessage.edit({
        embeds: [errorEmbed],
      });
    } catch (notifyError) {
      logger.warn('Could not send error notification', {
        error: notifyError.message,
      });
    }
  }
}

export const category = 'recording';
export const permissions = [];
