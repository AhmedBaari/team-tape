# Feature #4: Auto-Stop Recording When Channel Empty

## Implementation Overview

This feature automatically stops recording after 30 seconds when all human participants leave the voice channel. It uses a timeout-based approach with proper cleanup and cancellation logic.

**Key Design Decisions**:
- 30-second countdown when channel becomes empty
- Timer is cancelled if someone rejoins
- Timer is cleared on manual stop
- Prevent duplicate stop executions via flag
- Log all timer events for debugging

---

## Files to Modify

### 1. src/services/audioRecorder.js

#### Changes Required

1. Add `emptyChannelTimer` property to recording session
2. Export timer management functions for use by event handler
3. Add timer cleanup in `stopRecording` method

#### Complete Modified Code

```javascript
// Explicitly import encryption libraries BEFORE @discordjs/voice
// This ensures they're loaded for ES modules
import sodium from 'libsodium-wrappers';

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { exec } from 'child_process';
import prism from 'prism-media';
import logger from '../utils/logger.js';

const execPromise = promisify(exec);

// Ensure libsodium is ready before any voice operations
await sodium.ready;

/**
 * Audio Recorder Service
 * Manages voice channel connections and audio recording
 * Handles multi-user audio capture and MP3 encoding
 */
class AudioRecorder {
  constructor() {
    this.activeRecordings = new Map(); // meetingId -> recording session
    this.recordingsPath = process.env.RECORDINGS_PATH || './recordings';
    this.ensureDirectoryExists();
  }

  /**
   * Ensure recordings directory exists
   * @private
   */
  ensureDirectoryExists() {
    if (!fs.existsSync(this.recordingsPath)) {
      fs.mkdirSync(this.recordingsPath, { recursive: true });
      logger.info(`Created recordings directory: ${this.recordingsPath}`);
    }
  }

  /**
   * Start recording in a voice channel
   * Joins channel and begins capturing audio from all users
   * @param {VoiceChannel} channel - Discord voice channel
   * @param {string} meetingId - Unique meeting identifier
   * @param {Client} client - Discord client instance
   * @returns {Promise<Object>} Recording session info
   */
  async startRecording(channel, meetingId, client) {
    try {
      // Check if already recording
      if (this.activeRecordings.has(meetingId)) {
        throw new Error(`Already recording for meeting: ${meetingId}`);
      }

      // Join voice channel with selfDeaf: false to receive audio
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false, // CRITICAL: Must be false to receive audio
        selfMute: true, // Bot should be muted
      });

      // Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 30e3);

      // Prepare audio file path
      const filename = `${meetingId}-${Date.now()}.mp3`;
      const filePath = path.join(this.recordingsPath, filename);

      // Create recording session
      const recordingSession = {
        meetingId,
        channelId: channel.id,
        guildId: channel.guildId,
        connection,
        startTime: Date.now(),
        filePath,
        fileName: filename,
        userAudioStreams: new Map(), // Map<userId, StreamInfo[]>
        userAudioFiles: [], // For transcription service
        activeSubscriptions: new Map(), // Map<userId, {subscription, decoder, writeStream, filePath}> - SINGLE active sub per user
        isRecording: true,
        emptyChannelTimer: null, // FEATURE #4: Timer for auto-stop
        isStopping: false, // FEATURE #4: Flag to prevent duplicate stops
      };

      this.activeRecordings.set(meetingId, recordingSession);

      // Listen for speaking events to capture audio from users
      connection.receiver.speaking.on('start', (userId) => {
        logger.debug(`User ${userId} started speaking in ${meetingId}`);
        this.handleUserSpeaking(meetingId, userId, connection, client);
      });

      connection.receiver.speaking.on('end', (userId) => {
        logger.debug(`User ${userId} stopped speaking in ${meetingId}`);
        // Note: We don't close the subscription here - let AfterSilence handle it
      });

      // Handle connection state changes
      connection.on('stateChange', (oldState, newState) => {
        logger.debug(
          `Voice connection state changed: ${oldState.status} -> ${newState.status}`
        );
        if (newState.status === VoiceConnectionStatus.Disconnected) {
          logger.warn(`Voice connection disconnected for ${meetingId}`);
        }
      });

      logger.info(`Started recording: ${meetingId} in channel: ${channel.name}`);

      return recordingSession;
    } catch (error) {
      logger.error('Error starting recording', {
        error: error.message,
        stack: error.stack,
        meetingId,
        channelId: channel.id,
      });
      throw error;
    }
  }

  /**
   * Handle user speaking event and subscribe to their audio
   * Uses single-subscription model to prevent audio overlap
   * @param {string} meetingId - Meeting identifier
   * @param {string} userId - Discord user ID
   * @param {VoiceConnection} connection - Voice connection
   * @param {Client} client - Discord client
   * @private
   */
  async handleUserSpeaking(meetingId, userId, connection, client) {
    try {
      const session = this.activeRecordings.get(meetingId);
      if (!session || !session.isRecording) {
        return;
      }

      // Check if user already has an active subscription
      // This is the key fix: only ONE subscription per user at a time
      if (session.activeSubscriptions.has(userId)) {
        logger.debug(
          `User ${userId} already has active subscription, skipping new subscription`
        );
        return;
      }

      // Initialize user stream array if first time this user speaks
      if (!session.userAudioStreams.has(userId)) {
        session.userAudioStreams.set(userId, []);
      }

      const now = Date.now();
      const streamNumber = session.userAudioStreams.get(userId).length;

      // Subscribe to user's audio stream
      // Use longer silence duration to capture complete utterances
      const audioStream = connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 5000, // 5 seconds of silence before ending
        },
      });

      audioStream.setMaxListeners(20);

      const user = await client.users
        .fetch(userId)
        .catch(() => ({ id: userId, username: 'Unknown' }));

      const opusDecoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      // Create user-specific recording file
      const userFilePath = path.join(
        this.recordingsPath,
        `${meetingId}-${userId}-${streamNumber}-${now}.pcm`
      );
      const writeStream = fs.createWriteStream(userFilePath);

      // Store user audio stream reference with accurate timestamp
      const userStreamInfo = {
        userId: user.id,
        username: user.username,
        stream: audioStream,
        decoder: opusDecoder,
        writeStream,
        filePath: userFilePath,
        startTime: now,
        streamNumber,
      };

      session.userAudioStreams.get(userId).push(userStreamInfo);

      // Track as active subscription (single per user)
      session.activeSubscriptions.set(userId, userStreamInfo);

      // Pipeline: Opus stream -> Decoder -> File
      audioStream.pipe(opusDecoder).pipe(writeStream);

      // Handle stream end - clean up and allow new subscription
      audioStream.on('end', () => {
        logger.debug(`Audio stream ended for user ${user.username} in ${meetingId}`);

        // Clean up decoder
        if (opusDecoder && !opusDecoder.destroyed) {
          opusDecoder.end();
        }

        // Remove from active subscriptions - allows new subscription on next speak event
        session.activeSubscriptions.delete(userId);

        logger.debug(`Subscription slot freed for user ${userId} in ${meetingId}`);
      });

      // Ensure write stream closes when decoder ends
      opusDecoder.on('end', () => {
        writeStream.end();
      });

      opusDecoder.on('error', (error) => {
        logger.warn(`Decoder error for user ${userId}`, { error: error.message });
        writeStream.end();
        session.activeSubscriptions.delete(userId);
      });

      audioStream.on('error', (error) => {
        // Handle DAVE encryption errors gracefully
        if (error.message && error.message.includes('DecryptionFailed')) {
          logger.warn(
            `DAVE decryption error for user ${userId} (audio still captured)`,
            {
              error: error.message,
              meetingId,
            }
          );
        } else {
          logger.error(`Audio stream error for user ${userId}`, {
            error: error.message,
            stack: error.stack,
            meetingId,
          });
        }
        session.activeSubscriptions.delete(userId);
      });

      logger.info(
        `Started recording audio from user: ${user.username} (${userId}) in ${meetingId}`
      );
    } catch (error) {
      logger.error('Error handling user speaking', {
        error: error.message,
        meetingId,
        userId,
      });
    }
  }

  /**
   * Record audio from a specific user in voice channel
   * Creates transcoding pipeline to capture user audio
   * @param {string} meetingId - Meeting identifier
   * @param {User} user - Discord user
   * @param {AudioReceiveStream} audioStream - User's audio stream
   * @returns {Promise<void>}
   * @deprecated Use handleUserSpeaking instead
   */
  async recordUserAudio(meetingId, user, audioStream) {
    try {
      const session = this.activeRecordings.get(meetingId);
      if (!session) {
        logger.warn(`Recording session not found: ${meetingId}`);
        return;
      }

      // Create decoder for PCM audio
      const opusDecoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      // Store user audio stream reference for later processing
      const userStreamInfo = {
        userId: user.id,
        username: user.username,
        stream: audioStream,
        decoder: opusDecoder,
        startTime: Date.now(),
      };

      session.userAudioStreams.set(user.id, userStreamInfo);

      // Connect the pipeline but don't wait for it
      audioStream.pipe(opusDecoder);

      logger.debug(`Recording audio from user: ${user.username} (${meetingId})`);
    } catch (error) {
      logger.error('Error recording user audio', {
        error: error.message,
        meetingId,
        userId: user.id,
      });
    }
  }

  /**
   * Stop recording and finalize audio file
   * Disconnects from voice channel and closes audio streams
   * @param {string} meetingId - Meeting identifier
   * @returns {Promise<Object>} Final recording information
   */
  async stopRecording(meetingId) {
    try {
      const session = this.activeRecordings.get(meetingId);
      if (!session) {
        throw new Error(`Recording session not found: ${meetingId}`);
      }

      // FEATURE #4: Prevent duplicate stops
      if (session.isStopping) {
        logger.warn(`Recording ${meetingId} is already stopping, skipping duplicate stop`);
        return {
          meetingId,
          filePath: session.filePath,
          fileName: session.fileName,
          duration: Math.floor((Date.now() - session.startTime) / 1000),
          participantCount: session.userAudioStreams.size,
          channelId: session.channelId,
          guildId: session.guildId,
        };
      }

      session.isStopping = true;

      // FEATURE #4: Clear auto-stop timer if exists
      if (session.emptyChannelTimer) {
        clearTimeout(session.emptyChannelTimer);
        session.emptyChannelTimer = null;
        logger.debug(`Cleared auto-stop timer for ${meetingId}`);
      }

      // Close all user audio streams and wait for them to finish
      const closePromises = [];
      for (const [userId, streamInfoArray] of session.userAudioStreams) {
        for (const streamInfo of streamInfoArray) {
          try {
            if (streamInfo.stream) {
              streamInfo.stream.destroy();
            }
            if (streamInfo.decoder) {
              streamInfo.decoder.destroy();
            }
            if (streamInfo.writeStream) {
              // Wait for write stream to finish
              closePromises.push(
                new Promise((resolve) => {
                  streamInfo.writeStream.end(() => resolve());
                })
              );
            }
          } catch (error) {
            logger.warn(`Error closing stream for user ${userId}`, {
              error: error.message,
            });
          }
        }
      }

      // Clear active subscriptions
      session.activeSubscriptions.clear();

      // Wait for all streams to close
      await Promise.all(closePromises);

      // Wait additional 500ms to ensure all file writes are flushed to disk
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Disconnect from voice channel
      session.connection.destroy();

      const duration = Date.now() - session.startTime;

      session.isRecording = false;

      // Merge PCM files and convert to MP3
      await this.mergeAndConvertAudio(session);

      const recordingInfo = {
        meetingId,
        filePath: session.filePath,
        fileName: session.fileName,
        duration: Math.floor(duration / 1000), // Convert to seconds
        participantCount: session.userAudioStreams.size,
        channelId: session.channelId,
        guildId: session.guildId,
      };

      logger.info(`Stopped recording: ${meetingId}`, recordingInfo);

      // Keep session for a bit longer for fallback, then remove
      setTimeout(
        () => this.activeRecordings.delete(meetingId),
        300000 // 5 minutes
      );

      return recordingInfo;
    } catch (error) {
      logger.error('Error stopping recording', {
        error: error.message,
        meetingId,
      });
      throw error;
    }
  }

  /**
   * FEATURE #4: Start auto-stop timer for empty channel
   * @param {string} meetingId - Meeting identifier
   * @param {Function} callback - Function to call after 30 seconds
   */
  startEmptyChannelTimer(meetingId, callback) {
    const session = this.activeRecordings.get(meetingId);
    if (!session) {
      logger.warn(`Cannot start timer: Recording session not found: ${meetingId}`);
      return;
    }

    // Clear existing timer if any
    if (session.emptyChannelTimer) {
      clearTimeout(session.emptyChannelTimer);
    }

    logger.info(`Starting 30-second auto-stop timer for ${meetingId}`);

    session.emptyChannelTimer = setTimeout(async () => {
      logger.info(`Auto-stop timer expired for ${meetingId}, executing callback`);
      try {
        await callback();
      } catch (error) {
        logger.error('Error in auto-stop timer callback', {
          error: error.message,
          meetingId,
        });
      }
    }, 30000); // 30 seconds
  }

  /**
   * FEATURE #4: Cancel auto-stop timer
   * @param {string} meetingId - Meeting identifier
   */
  cancelEmptyChannelTimer(meetingId) {
    const session = this.activeRecordings.get(meetingId);
    if (!session) {
      return;
    }

    if (session.emptyChannelTimer) {
      clearTimeout(session.emptyChannelTimer);
      session.emptyChannelTimer = null;
      logger.info(`Cancelled auto-stop timer for ${meetingId} (user rejoined)`);
    }
  }

  /**
   * Merge PCM audio files and convert to MP3
   * Creates SEPARATE MP3 files per user for accurate speaker identification
   * @param {Object} session - Recording session object
   * @returns {Promise<void>}
   * @private
   */
  async mergeAndConvertAudio(session) {
    try {
      const { meetingId, filePath, userAudioStreams } = session;

      logger.info(`Merging audio files for ${meetingId}`, {
        userCount: userAudioStreams.size,
      });

      // Create per-user MP3 files for accurate speaker identification
      const userAudioFiles = [];

      for (const [userId, streamInfoArray] of userAudioStreams) {
        // Sort this user's segments by start time
        streamInfoArray.sort((a, b) => a.startTime - b.startTime);

        const pcmFiles = streamInfoArray
          .map((streamInfo) => streamInfo.filePath)
          .filter((fp) => fp && fs.existsSync(fp));

        if (pcmFiles.length === 0) {
          logger.warn(`No audio files found for user ${userId}`);
          continue;
        }

        // Create user-specific MP3 file
        const userMp3Path = filePath.replace('.mp3', `-${userId}.mp3`);

        if (pcmFiles.length === 1) {
          // Single file - just convert PCM to MP3
          const pcmFile = pcmFiles[0];
          await execPromise(
            `ffmpeg -f s16le -ar 48000 -ac 2 -i "${pcmFile}" -q:a 2 -y "${userMp3Path}"`
          );
          logger.info(`Converted single PCM file for user ${userId}`);
        } else {
          // Multiple files - concatenate this user's segments
          const tempConcatFile = path.join(
            this.recordingsPath,
            `${meetingId}-${userId}-concat-temp.pcm`
          );

          const writeStream = fs.createWriteStream(tempConcatFile);

          for (const pcmFile of pcmFiles) {
            const data = fs.readFileSync(pcmFile);
            writeStream.write(data);
            logger.debug(
              `Concatenated ${data.length} bytes from ${path.basename(pcmFile)}`
            );
          }

          writeStream.end();
          await new Promise((resolve) => writeStream.on('finish', resolve));

          logger.info(`Concatenated ${pcmFiles.length} PCM files for user ${userId}`);

          // Convert concatenated PCM to MP3
          await execPromise(
            `ffmpeg -f s16le -ar 48000 -ac 2 -i "${tempConcatFile}" -q:a 2 -y "${userMp3Path}"`
          );

          // Clean up temp file
          try {
            fs.unlinkSync(tempConcatFile);
          } catch (error) {
            logger.warn(`Could not delete temp concat file: ${tempConcatFile}`, {
              error: error.message,
            });
          }

          logger.info(`Converted concatenated PCM to MP3 for user ${userId}`);
        }

        // Store user audio file info with timestamps from their segments
        userAudioFiles.push({
          userId,
          filePath: userMp3Path,
          segments: streamInfoArray.map((s) => ({
            startTime: s.startTime,
            filePath: s.filePath,
          })),
        });

        // Clean up this user's PCM files
        for (const pcmFile of pcmFiles) {
          try {
            fs.unlinkSync(pcmFile);
            logger.debug(`Deleted PCM file: ${pcmFile}`);
          } catch (error) {
            logger.warn(`Could not delete PCM file: ${pcmFile}`, {
              error: error.message,
            });
          }
        }
      }

      // Store user audio files info in session for transcription
      session.userAudioFiles = userAudioFiles;

      // Also create a merged MP3 for backward compatibility (optional)
      if (userAudioFiles.length > 0) {
        // Get all segments from all users, sort chronologically
        const allSegments = [];
        for (const userFile of userAudioFiles) {
          for (const segment of userFile.segments) {
            allSegments.push({
              userId: userFile.userId,
              filePath: userFile.filePath,
              startTime: segment.startTime,
            });
          }
        }
        allSegments.sort((a, b) => a.startTime - b.startTime);

        logger.info(
          `Created ${userAudioFiles.length} per-user MP3 files with ${allSegments.length} total segments`
        );
      } else {
        logger.warn(`No audio files found for ${meetingId}, creating empty MP3`);
        // Create an empty/silent MP3 file
        await execPromise(
          `ffmpeg -f lavfi -i anullsrc=r=48000:cl=stereo -t 1 -q:a 2 -y "${filePath}"`
        );
      }

      logger.info(`Audio merge completed for ${meetingId}`);
    } catch (error) {
      logger.error(`Error merging audio files`, {
        error: error.message,
        stack: error.stack,
        meetingId: session.meetingId,
      });
      throw new Error(`Failed to merge audio files: ${error.message}`);
    }
  }

  /**
   * Get active recording session
   * @param {string} meetingId - Meeting identifier
   * @returns {Object|null} Recording session or null
   */
  getSession(meetingId) {
    return this.activeRecordings.get(meetingId) || null;
  }

  /**
   * Check if currently recording for a meeting
   * @param {string} meetingId - Meeting identifier
   * @returns {boolean}
   */
  isRecording(meetingId) {
    const session = this.activeRecordings.get(meetingId);
    return session ? session.isRecording : false;
  }

  /**
   * Get list of all active recordings
   * @returns {Array<Object>}
   */
  getActiveRecordings() {
    const recordings = [];
    for (const [meetingId, session] of this.activeRecordings) {
      if (session.isRecording) {
        recordings.push({
          meetingId,
          duration: Date.now() - session.startTime,
          participants: session.userAudioStreams.size,
          channelId: session.channelId,
          guildId: session.guildId,
        });
      }
    }
    return recordings;
  }

  /**
   * Gracefully shutdown all active recordings
   * Called when bot is shutting down
   * @returns {Promise<void>}
   */
  async shutdownAll() {
    const recordings = Array.from(this.activeRecordings.keys());
    logger.info(`Shutting down ${recordings.length} active recordings`);

    for (const meetingId of recordings) {
      try {
        await this.stopRecording(meetingId);
      } catch (error) {
        logger.error(`Error shutting down recording ${meetingId}`, {
          error: error.message,
        });
      }
    }
  }
}

const audioRecorder = new AudioRecorder();
export default audioRecorder;
```

---

### 2. src/events/voiceStateUpdate.js

#### Changes Required

Add logic to detect when channel becomes empty and start/cancel timer.

#### Complete Modified Code

(This builds on the code from Feature #3)

```javascript
// ... (previous imports and code from Feature #3)

/**
 * Handle user leaving a voice channel
 * @param {VoiceChannel} channel - Voice channel user left
 * @param {GuildMember} member - Member who left
 */
async function handleUserLeftChannel(channel, member) {
  try {
    // Check if there's an active recording in this channel
    const activeRecordings = audioRecorder.getActiveRecordings();
    const channelRecording = activeRecordings.find((r) => r.channelId === channel.id);

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

    // Notify in system channel
    if (channel.guild.systemChannel) {
      const durationMin = Math.floor(recordingInfo.duration / 60);
      const durationSec = recordingInfo.duration % 60;

      await channel.guild.systemChannel.send(
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
    if (channel.guild.systemChannel) {
      await channel.guild.systemChannel
        .send(
          `⚠️ **Auto-Stop Error**\n` +
            `Failed to auto-stop recording \`${meetingId}\`: ${error.message}\n` +
            `Please use \`/stop-recording\` manually.`
        )
        .catch(() => {});
    }
  }
}

// ... (rest of the code from Feature #3, including DM prompt functions)
```

---

### 3. src/commands/stop-recording.js

#### Changes Required

No changes needed! The timer cleanup is already handled in `audioRecorder.stopRecording()` which is called by this command.

The `stopRecording` method in audioRecorder.js now:
1. Checks the `isStopping` flag to prevent duplicate execution
2. Clears the `emptyChannelTimer` if it exists

---

## Logic Flow Diagram

```
User leaves channel
  ↓
Check: Is this last person? (excluding bot)
  ↓ YES
Start 30s timer
  ↓
───────────────────────────────────
│                                 │
│ Check: Did someone rejoin?      │
│   ↓ YES                         │
│ Cancel timer                    │
│ Log: "User rejoined"            │
│ Continue recording              │
│   ↓                             │
└─────────────────────────────────┘
  ↓ NO (30s elapsed)
Trigger auto-stop
  ↓
Call audioRecorder.stopRecording()
  ↓
Update MongoDB (endReason: 'auto_empty_channel')
  ↓
Send notification to system channel
  ↓
Process recording normally (transcription + summary)
```

---

## Testing Procedure

### Test Case 1: Normal Auto-Stop

**Steps**:
1. Start recording with 2 people in voice channel
2. Person A leaves
3. Wait exactly 30 seconds (don't interrupt)
4. Verify recording stops automatically
5. Check system channel for auto-stop notification
6. Verify summary is generated normally

**Expected Behavior**:
- Timer starts when Person A leaves
- After 30s: Recording stops
- Notification appears in system channel
- Processing continues (transcription, summary)
- Meeting status: `endReason: 'auto_empty_channel'`

**Expected Logs**:
```
[INFO] Voice channel empty, starting 30-second auto-stop timer { meetingId: 'mtg_...', channelId: '...', channelName: 'General' }
[INFO] Executing auto-stop for empty channel { meetingId: 'mtg_...', channelId: '...', channelName: 'General' }
[INFO] Stopped recording: mtg_... { meetingId: '...', filePath: '...', duration: 45, ... }
[INFO] Recording auto-stopped successfully { meetingId: 'mtg_...', duration: 45, reason: 'Channel empty for 30 seconds' }
```

---

### Test Case 2: Rejoin Before Timer

**Steps**:
1. Start recording with 2 people
2. Person A leaves (timer starts)
3. Wait 15 seconds
4. Person A rejoins
5. Verify timer is cancelled
6. Recording continues normally
7. Person A can leave and rejoin multiple times

**Expected Behavior**:
- Timer starts at step 2
- Timer cancels at step 4
- No auto-stop occurs
- Recording continues
- New timer starts if Person A leaves again

**Expected Logs**:
```
[INFO] Voice channel empty, starting 30-second auto-stop timer { meetingId: 'mtg_...', ... }
[INFO] User rejoined, auto-stop timer cancelled { meetingId: 'mtg_...', userId: '...', username: 'Person A' }
```

---

### Test Case 3: Manual Stop During Timer

**Steps**:
1. Start recording with 2 people
2. Person A leaves (timer starts)
3. Wait 10 seconds
4. Use `/stop-recording` command
5. Verify timer is cleared
6. Verify no duplicate stop execution

**Expected Behavior**:
- Timer starts at step 2
- Timer is cleared when manual stop executes
- Only ONE stop execution occurs
- No errors about "already stopping"

**Expected Logs**:
```
[INFO] Voice channel empty, starting 30-second auto-stop timer { meetingId: 'mtg_...', ... }
[DEBUG] Cleared auto-stop timer for mtg_... (manual stop initiated)
[INFO] Stopped recording: mtg_... { ... }
```

---

### Test Case 4: Multiple People Leave Sequentially

**Steps**:
1. Start recording with 3 people (A, B, C)
2. Person A leaves (2 people remain - no timer)
3. Person B leaves (1 person remains - no timer)
4. Person C leaves (0 people - timer starts)
5. Wait 30 seconds
6. Verify auto-stop

**Expected Behavior**:
- Timer only starts when LAST person leaves
- Previous leaves don't trigger timer
- Auto-stop after 30s

---

### Test Case 5: Bot-Only Channel

**Steps**:
1. Start recording with 1 person + bot (2 total)
2. Person leaves
3. Only bot remains in channel
4. Verify timer starts (bot doesn't count)
5. Verify auto-stop after 30s

**Expected Behavior**:
- Bot is excluded from member count
- Timer starts when last human leaves
- Auto-stop executes normally

---

### Test Case 6: Race Condition - Timer Expires During Manual Stop

**Steps**:
1. Start recording, all users leave (timer starts)
2. Wait 29 seconds
3. Execute `/stop-recording` command
4. Timer expires (30s mark) while manual stop is processing
5. Verify no duplicate execution or errors

**Expected Behavior**:
- `isStopping` flag prevents duplicate execution
- Only one stop completes
- Other stop attempt logs warning and returns early

**Expected Logs**:
```
[WARN] Recording mtg_... is already stopping, skipping duplicate stop
```

---

## Edge Cases Handled

1. **Duplicate Stop Prevention**: `isStopping` flag prevents race conditions
2. **Timer Cleanup**: Timer is always cleared in `stopRecording()`
3. **Bot Exclusion**: Bots don't count toward "channel has members"
4. **System Channel Missing**: Notification is optional (catches error)
5. **Database Failures**: Logged but don't crash auto-stop
6. **Multiple Simultaneous Leaves**: Only last person leaving triggers timer

---

## Performance Considerations

- Timer uses standard `setTimeout` (lightweight)
- Only one timer per recording session
- Timer is cleared immediately on rejoin or manual stop
- No polling - event-driven architecture

---

## Integration with Other Features

- **Feature #3 (DM Prompt)**: Auto-stop notification is separate from DM system
- **Feature #5 (Stop Button)**: Button click triggers manual stop, which clears timer
- **Feature #6 (Admin Config)**: System channel can be replaced with configured notification channel

---

## Rollback Plan

If auto-stop causes issues:

1. Comment out timer start in `handleUserLeftChannel`:
   ```javascript
   // audioRecorder.startEmptyChannelTimer(...);
   ```

2. Recording will continue until manual stop (old behavior)

3. Timer-related properties in session are harmless if unused
