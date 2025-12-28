# Feature #5: Stop Button in Recording Started Embed

## Implementation Overview

This feature adds an interactive "Stop Recording" button to the recording started message, allowing authorized users to quickly stop the recording without typing a command. It includes permission checks and proper cleanup.

**Key Design Decisions**:
- Button is added to the recording start embed
- Only recording starter OR server admins can click
- Unauthorized users get ephemeral error message
- Button disables after click or 24-hour timeout
- Reuses stop logic from `/stop-recording` command

---

## Files to Modify

### 1. src/utils/embedBuilder.js

#### Changes Required

Modify `createRecordingStartEmbed()` to return both embed AND button components.

#### Complete Modified Code

```javascript
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Creates a Discord embed for meeting summary
 * Formats Perplexity AI summary and participant data
 * @param {Object} meetingData - Meeting data from MongoDB
 * @returns {EmbedBuilder} Formatted Discord embed
 */
export function createMeetingSummaryEmbed(meetingData) {
  const {
    meetingId,
    startTimestamp,
    duration,
    participants,
    summary,
    recordingStatus,
  } = meetingData;

  // Convert duration from seconds to human-readable format
  const durationMinutes = Math.floor(duration / 60);
  const durationSeconds = duration % 60;
  const durationStr =
    durationMinutes > 0
      ? `${durationMinutes}m ${durationSeconds}s`
      : `${durationSeconds}s`;

  const embed = new EmbedBuilder()
    .setColor('#2180B1') // TeamTape primary color (teal)
    .setTitle('🎙️ Meeting Recording Summary')
    .setDescription(summary?.executiveSummary || 'Summary generation in progress...')
    .addFields(
      {
        name: '⏰ Duration',
        value: durationStr,
        inline: true,
      },
      {
        name: '👥 Participants',
        value: participants.length.toString(),
        inline: true,
      },
      {
        name: '📄 Status',
        value: recordingStatus.charAt(0).toUpperCase() + recordingStatus.slice(1),
        inline: true,
      }
    );

  // Add key points if available
  if (summary?.keyPoints && summary.keyPoints.length > 0) {
    const keyPointsText = summary.keyPoints
      .slice(0, 5) // Limit to 5 points due to Discord embed limits
      .map((point) => `• ${point}`)
      .join('\n');

    embed.addFields({
      name: '🔍 Key Points',
      value: keyPointsText || 'No key points extracted',
      inline: false,
    });
  }

  // Add action items if available
  if (summary?.actionItems && summary.actionItems.length > 0) {
    const actionItemsText = summary.actionItems
      .slice(0, 3) // Limit to 3 items
      .map(
        (item) =>
          `• **${item.task}** ${item.assignee ? `(${item.assignee})` : ''}`
      )
      .join('\n');

    if (actionItemsText) {
      embed.addFields({
        name: '✅ Action Items',
        value: actionItemsText,
        inline: false,
      });
    }
  }

  // Add innovations if available
  if (summary?.innovations && summary.innovations.length > 0) {
    const innovationsText = summary.innovations
      .slice(0, 3)
      .map((innovation) => `❤️ ${innovation}`)
      .join('\n');

    if (innovationsText) {
      embed.addFields({
        name: '💡 Ideas & Innovations',
        value: innovationsText,
        inline: false,
      });
    }
  }

  // Add participants list
  const participantsList = participants
    .map(
      (p) =>
        `• **${p.username}** - ${Math.floor(p.duration / 60)}m ${
          p.duration % 60
        }s${p.wasDeafened ? ' [Deafened]' : ''}`
    )
    .join('\n');

  if (participantsList) {
    embed.addFields({
      name: '👥 Participants',
      value: participantsList,
      inline: false,
    });
  }

  // Add timestamp and recording ID
  embed.setFooter({
    text: `Recording ID: ${meetingId}`,
  });
  embed.setTimestamp(startTimestamp);

  return embed;
}

/**
 * Creates a notification embed for recording start
 * FEATURE #5: Returns both embed and button row
 * @param {string} channelName - Voice channel name
 * @param {Array} users - List of users in channel
 * @param {string} meetingId - Meeting ID for button interaction
 * @param {string} starterId - User ID who started the recording
 * @returns {Object} { embed: EmbedBuilder, components: ActionRowBuilder[] }
 */
export function createRecordingStartEmbed(channelName, users, meetingId = null, starterId = null) {
  const embed = new EmbedBuilder()
    .setColor('#32B8C6') // Teal success color
    .setTitle('🎙️ Recording Started')
    .setDescription(`Meeting recording has begun in **${channelName}**`)
    .addFields(
      {
        name: '👥 Participants',
        value: users.map((u) => `• ${u}`).join('\n') || 'No users',
        inline: false,
      },
      {
        name: '⚠️ Note',
        value:
          'This meeting is being recorded. All audio will be transcribed and summarized.',
        inline: false,
      }
    )
    .setTimestamp();

  // FEATURE #5: Add stop button if meetingId provided
  const components = [];
  if (meetingId && starterId) {
    const stopButton = new ButtonBuilder()
      .setCustomId(`stop_recording_${meetingId}_${starterId}_${Date.now()}`)
      .setLabel('Stop Recording')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(stopButton);
    components.push(row);
  }

  return { embed, components };
}

/**
 * Creates a notification embed for recording stop confirmation
 * @returns {EmbedBuilder}
 */
export function createRecordingStopConfirmEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#FFA500') // Orange warning color
    .setTitle('❌ Recording Stopping Soon')
    .setDescription(
      'Only 1 person remaining in the voice channel. Recording will stop in 60 seconds unless more participants join.'
    )
    .addFields({
      name: '🔀 You can:',
      value: '✅ **Continue** - Keep recording\n❌ **Stop** - End recording now',
      inline: false,
    })
    .setTimestamp();

  return embed;
}

/**
 * Creates an error notification embed
 * @param {string} title - Error title
 * @param {string} message - Error description
 * @param {string} stage - Processing stage where error occurred
 * @returns {EmbedBuilder}
 */
export function createErrorEmbed(title, message, stage = null) {
  const embed = new EmbedBuilder()
    .setColor('#C01530') // Red error color
    .setTitle(`❌ ${title}`)
    .setDescription(message);

  if (stage) {
    embed.addFields({
      name: 'Stage',
      value: stage,
      inline: true,
    });
  }

  embed.setTimestamp();
  return embed;
}

/**
 * Creates a processing status embed
 * @param {string} status - Current processing status
 * @param {Array} stages - Array of processing stages with status
 * @returns {EmbedBuilder}
 */
export function createProcessingStatusEmbed(status, stages = []) {
  const statusColors = {
    pending: '#9370DB', // Purple
    processing: '#FFA500', // Orange
    completed: '#32B8C6', // Teal
    failed: '#C01530', // Red
  };

  const embed = new EmbedBuilder()
    .setColor(statusColors[status] || '#32B8C6')
    .setTitle('🔄 Processing Status')
    .setDescription(`Current Status: **${status.toUpperCase()}**`);

  if (stages.length > 0) {
    const stagesText = stages
      .map((stage) => {
        const icon = stage.status === 'completed' ? '✅' : '⏳';
        return `${icon} ${stage.name}`;
      })
      .join('\n');

    embed.addFields({
      name: 'Stages',
      value: stagesText,
      inline: false,
    });
  }

  embed.setTimestamp();
  return embed;
}

/**
 * Creates statistics embed for guild
 * @param {Object} stats - Statistics object
 * @returns {EmbedBuilder}
 */
export function createStatsEmbed(stats) {
  const embed = new EmbedBuilder()
    .setColor('#2180B1')
    .setTitle('📊 Meeting Statistics')
    .addFields(
      {
        name: '🎙️ Total Meetings',
        value: stats.totalMeetings.toString(),
        inline: true,
      },
      {
        name: '✅ Completed',
        value: stats.completedMeetings.toString(),
        inline: true,
      },
      {
        name: '👥 Unique Participants',
        value: stats.totalParticipants.toString(),
        inline: true,
      },
      {
        name: '⏰ Total Duration',
        value: `${Math.floor(stats.totalDuration / 3600)}h ${Math.floor(
          (stats.totalDuration % 3600) / 60
        )}m`,
        inline: true,
      },
      {
        name: '📊 Average Duration',
        value: `${Math.floor(stats.averageDuration / 60)}m ${Math.floor(
          stats.averageDuration % 60
        )}s`,
        inline: true,
      }
    )
    .setTimestamp();

  return embed;
}

export default {
  createMeetingSummaryEmbed,
  createRecordingStartEmbed,
  createRecordingStopConfirmEmbed,
  createErrorEmbed,
  createProcessingStatusEmbed,
  createStatsEmbed,
};
```

---

### 2. src/commands/start-recording.js

#### Changes Required

1. Update `createRecordingStartEmbed` call to use new return format
2. Send message with button components
3. Set up message component collector
4. Handle button click interactions
5. Track recording starter ID for permission check

#### Complete Modified Code

```javascript
import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionsBitField,
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import mongoService from '../services/mongoService.js';
import {
  createRecordingStartEmbed,
  createErrorEmbed,
} from '../utils/embedBuilder.js';
import { executeStopRecording } from './stop-recording.js'; // Import shared function

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
      startedBy: interaction.user.id, // FEATURE #5: Track who started recording
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

    // Send message with stop button
    const replyMessage = await interaction.editReply({
      embeds: [startEmbed],
      components,
      content: `🎙️ **Recording Started**\nMeeting ID: \`${meetingId}\``,
    });

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
```

---

### 3. src/commands/stop-recording.js

#### Changes Required

1. Extract stop logic into reusable `executeStopRecording` function
2. Export function for use by button handler
3. Update existing `execute` function to call the shared function

#### Complete Modified Code

```javascript
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import logger from '../utils/logger.js';
import audioRecorder from '../services/audioRecorder.js';
import mongoService from '../services/mongoService.js';
import transcriptionService from '../services/transcriptionService.js';
import perplexityService from '../services/perplexityService.js';
import {
  createMeetingSummaryEmbed,
  createErrorEmbed,
} from '../utils/embedBuilder.js';
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
    await executeStopRecording(
      interaction.guildId,
      interaction.channel,
      interaction
    );
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
 * FEATURE #5: Shared stop recording logic
 * Can be called by command or button interaction
 * @param {string} guildId - Discord guild ID
 * @param {TextChannel} channel - Discord text channel for posting results
 * @param {Interaction} interaction - Command or button interaction
 * @param {string} forceMeetingId - Optional: Force specific meeting ID (for button clicks)
 */
export async function executeStopRecording(
  guildId,
  channel,
  interaction,
  forceMeetingId = null
) {
  try {
    // Get active recordings for this guild
    const activeRecordings = audioRecorder.getActiveRecordings();

    // Filter recordings for this guild
    const guildRecordings = activeRecordings.filter((r) => r.guildId === guildId);

    logger.debug('Active recordings check', {
      totalActive: activeRecordings.length,
      guildRecordings: guildRecordings.length,
      guildId,
    });

    if (guildRecordings.length === 0) {
      const embed = createErrorEmbed(
        'No Active Recording',
        'There is no active recording in this server.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Determine which meeting to stop
    let meetingId;
    if (forceMeetingId) {
      // Button click - use specific meeting ID
      meetingId = forceMeetingId;
    } else {
      // Command - use most recent recording
      const latestRecording = guildRecordings[guildRecordings.length - 1];
      meetingId = latestRecording.meetingId;
    }

    logger.info('Stopping recording', { meetingId, guildId });

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
      audioFilePath: recordingInfo.filePath,
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
    processRecording(meetingId, channel, processingMessage, interaction.client).catch(
      (error) => {
        logger.error('Error in background processing', {
          error: error.message,
          meetingId,
        });
      }
    );

    logger.info('Processing pipeline initiated', { meetingId });
  } catch (error) {
    logger.error('Error in executeStopRecording', {
      error: error.message,
      stack: error.stack,
      guildId,
    });
    throw error; // Re-throw to be caught by caller
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

    // Get user audio files from recording session
    const recordingSession = audioRecorder.getSession(meetingId);
    const userAudioFiles = recordingSession?.userAudioFiles || [];

    // Validate audio files exist (either per-user files or merged file)
    if (userAudioFiles.length > 0) {
      // Using per-user audio files - verify they exist
      logger.info('Using per-user audio files for transcription', {
        meetingId,
        userCount: userAudioFiles.length,
      });

      for (const userFile of userAudioFiles) {
        if (!fs.existsSync(userFile.filePath)) {
          throw new Error(`User audio file does not exist: ${userFile.filePath}`);
        }
      }
    } else {
      // Fallback to merged file - verify it exists
      if (!meeting.audioFilePath) {
        throw new Error(`Audio file path not found in meeting record: ${meetingId}`);
      }

      if (!fs.existsSync(meeting.audioFilePath)) {
        throw new Error(
          `Audio file does not exist on disk: ${meeting.audioFilePath}`
        );
      }

      logger.debug('Using merged audio file for transcription', {
        meetingId,
        audioFilePath: meeting.audioFilePath,
      });
    }

    let transcriptPath;
    let transcription;

    if (userAudioFiles.length === 0) {
      logger.warn(
        'No per-user audio files found, falling back to single-file transcription'
      );
      // Fallback to old method if no per-user files
      transcription = await transcriptionService.transcribeAudio(
        meeting.audioFilePath,
        meeting.participants
      );

      // Save transcript
      transcriptPath = await transcriptionService.saveTranscript(
        transcription.formattedTranscript,
        meetingId
      );

      await mongoService.saveTranscript(
        meetingId,
        transcription.formattedTranscript,
        transcriptPath
      );

      logger.info('Transcription completed (fallback mode)', { meetingId });
    } else {
      // Step 1: Transcribe each user's audio separately with Discord-level speaker identification
      logger.info('Starting per-user transcription with Discord speaker identification', {
        meetingId,
        userCount: userAudioFiles.length,
      });

      transcription = await transcriptionService.transcribePerUser(
        userAudioFiles,
        meeting.participants
      );

      // Save transcript
      transcriptPath = await transcriptionService.saveTranscript(
        transcription.formattedTranscript,
        meetingId
      );

      await mongoService.saveTranscript(
        meetingId,
        transcription.formattedTranscript,
        transcriptPath
      );

      logger.info('Per-user transcription completed', {
        meetingId,
        userCount: transcription.userCount,
        totalSegments: transcription.segments.length,
      });
    }

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

    // Post results to Discord (SINGLE SUMMARY MESSAGE)
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

    // BUG FIX #1: Update processing message to redirect to results (No duplicate summary)
    try {
      const redirectEmbed = new EmbedBuilder()
        .setColor('#32B8C6')
        .setTitle('✅ Recording Processed Successfully')
        .setDescription(`Meeting summary and files posted below ⬇️`)
        .addFields({
          name: '📋 Meeting ID',
          value: `\`${meetingId}\``,
          inline: true,
        })
        .setTimestamp();

      await processingMessage.edit({
        embeds: [redirectEmbed],
        content: null,
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
```

---

## Permission Logic

```javascript
/**
 * Check if user can stop the recording
 * Returns true if:
 * - User started the recording, OR
 * - User is a server administrator
 */
function canStopRecording(interaction, recordingStarterId) {
  // Is recording starter
  if (interaction.user.id === recordingStarterId) {
    return true;
  }

  // Is administrator
  if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  return false;
}
```

---

## Testing Procedure

### Test Case 1: Authorized Stop (Recording Starter)

**Steps**:
1. User A uses `/start-recording`
2. Verify embed appears with "Stop Recording" button
3. User A clicks the stop button
4. Verify recording stops
5. Verify button disables

**Expected Behavior**:
- Button click is accepted
- Recording stops normally
- Processing begins
- Button becomes disabled and unclickable

**Expected Logs**:
```
[INFO] Recording started { meetingId: 'mtg_...', startedBy: '123...' }
[INFO] Stop button clicked { meetingId: 'mtg_...', clickedBy: '123...', startedBy: '123...' }
[INFO] Stopping recording { meetingId: 'mtg_...', guildId: '...' }
```

---

### Test Case 2: Authorized Stop (Admin)

**Steps**:
1. User A (non-admin) uses `/start-recording`
2. User B (admin) clicks the stop button
3. Verify recording stops
4. Verify button disables

**Expected Behavior**:
- Admin can stop recording started by another user
- Recording stops normally
- Button disables

**Expected Logs**:
```
[INFO] Stop button clicked { meetingId: 'mtg_...', clickedBy: '456...', startedBy: '123...' }
```

---

### Test Case 3: Unauthorized Stop

**Steps**:
1. User A starts recording
2. User C (non-admin, not starter) clicks stop button
3. Verify ephemeral error message
4. Verify recording continues
5. Verify button remains enabled

**Expected Behavior**:
- User C sees ephemeral message: "You do not have permission..."
- Recording is NOT stopped
- Button stays active
- User A can still click button

**Expected Message**:
```
❌ You do not have permission to stop this recording.
Only the person who started it or server administrators can stop it.
```

---

### Test Case 4: Button Timeout

**Steps**:
1. Start recording
2. Wait 24 hours (or modify timeout to 1 minute for testing)
3. Verify button disables automatically
4. Try clicking button
5. Verify "This interaction failed" (Discord default)

**Expected Behavior**:
- Button becomes disabled after timeout
- Collector ends with reason: 'time'
- Recording continues (timeout doesn't stop it)

**Expected Logs**:
```
[DEBUG] Stop button disabled due to timeout { meetingId: 'mtg_...', reason: 'time' }
```

---

### Test Case 5: Multiple Button Clicks

**Steps**:
1. User A starts recording
2. User A clicks stop button
3. Immediately try clicking again
4. Verify second click has no effect

**Expected Behavior**:
- First click: Stops recording
- Second click: Interaction failed (button disabled)
- No duplicate stop execution

---

### Test Case 6: Button Click During Manual Stop

**Steps**:
1. User A starts recording
2. User A uses `/stop-recording` command
3. While processing, User A clicks stop button
4. Verify no duplicate stop

**Expected Behavior**:
- Command initiates stop
- Button click is ignored or returns error
- No duplicate processing
- Only ONE summary posted

---

## Database Schema Addition

Add `startedBy` field to Meeting model:

```javascript
// In src/models/Meeting.js
{
  startedBy: {
    type: String,
    required: false,
    description: 'Discord user ID who started the recording',
  },
}
```

---

## Edge Cases Handled

1. **Missing meetingId in button**: If `meetingId` not provided to `createRecordingStartEmbed`, no button is added
2. **Deleted message**: If message is deleted, collector ends gracefully
3. **User leaves server**: Permission check handles missing member
4. **Recording already stopped**: `executeStopRecording` validates recording exists
5. **Button disabled by collector**: Discord prevents interaction with disabled buttons

---

## Integration Notes

- Works with Feature #4 (auto-stop): Button is disabled if auto-stop executes first
- Works with Feature #3 (DM prompt): DM-initiated recordings also get stop button
- Works with Bug Fix #1: Uses same `processRecording` function with redirect logic
- Works with Feature #6: Stop button uses configured notification channel

---

## Performance Considerations

- Collector is lightweight (event-driven)
- Only one collector per recording
- Collector is automatically cleaned up on end
- Button customId includes timestamp to ensure uniqueness

---

## Rollback Plan

If button causes issues:

1. Remove `meetingId` and `starterId` from `createRecordingStartEmbed` calls
2. Function will return empty components array
3. No button will appear (feature disabled)
4. Recording still works via `/stop-recording` command
