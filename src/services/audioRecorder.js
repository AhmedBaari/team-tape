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
        selfMute: true,  // Bot should be muted
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
        userStreamCount: new Map(),  // Map<userId, number> - track stream numbers
        isRecording: true,
      };

      this.activeRecordings.set(meetingId, recordingSession);

      // Listen for speaking events to capture audio from users
      connection.receiver.speaking.on('start', (userId) => {
        logger.debug(`User ${userId} started speaking in ${meetingId}`);
        this.handleUserSpeaking(meetingId, userId, connection, client);
      });

      connection.receiver.speaking.on('end', (userId) => {
        logger.debug(`User ${userId} stopped speaking in ${meetingId}`);
      });

      // Handle connection state changes
      connection.on('stateChange', (oldState, newState) => {
        logger.debug(`Voice connection state changed: ${oldState.status} -> ${newState.status}`);

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

      // Initialize user stream array if first time
      if (!session.userAudioStreams.has(userId)) {
        session.userAudioStreams.set(userId, []);
        session.userStreamCount.set(userId, 0);
        session.lastSubscriptionTime = session.lastSubscriptionTime || new Map();
      }

      // Debounce: Prevent creating new subscription too quickly
      // Increased to 3 seconds to reduce fragmentation
      const now = Date.now();
      const lastTime = session.lastSubscriptionTime?.get(userId) || 0;
      if (now - lastTime < 3000) {
        logger.debug(`Debouncing subscription for user ${userId} (${now - lastTime}ms since last)`);
        return;
      }
      session.lastSubscriptionTime.set(userId, now);

      // Get stream number for this user
      const streamNumber = session.userStreamCount.get(userId);
      session.userStreamCount.set(userId, streamNumber + 1);

      // Subscribe to user's audio stream
      // Use 5 seconds of silence to reduce fragmentation
      const audioStream = connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 5000, // Increased from 3000 to 5000ms
        },
      });

      audioStream.setMaxListeners(20);

      const user = await client.users.fetch(userId).catch(() => ({ id: userId, username: 'Unknown' }));

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
        startTime: now, // This is the absolute timestamp when this segment started
        streamNumber,
      };

      session.userAudioStreams.get(userId).push(userStreamInfo);

      // Pipeline: Opus stream -> Decoder -> File
      audioStream.pipe(opusDecoder).pipe(writeStream);

      // Handle stream end - ensure data is flushed
      audioStream.on('end', () => {
        logger.debug(`Audio stream ended for user ${user.username} in ${meetingId}`);
        // Force flush and close decoder, then close write stream
        if (opusDecoder && !opusDecoder.destroyed) {
          opusDecoder.end();
        }
      });

      // Ensure write stream closes when decoder ends
      opusDecoder.on('end', () => {
        writeStream.end();
      });

      opusDecoder.on('error', (error) => {
        logger.warn(`Decoder error for user ${userId}`, { error: error.message });
        writeStream.end();
      });

      audioStream.on('error', (error) => {
        // Handle DAVE encryption errors gracefully
        // These are non-fatal as we can still capture unencrypted audio
        if (error.message && error.message.includes('DecryptionFailed')) {
          logger.warn(`DAVE decryption error for user ${userId} (audio still captured)`, {
            error: error.message,
            meetingId,
          });
        } else {
          logger.error(`Audio stream error for user ${userId}`, {
            error: error.message,
            stack: error.stack,
            meetingId,
          });
        }
      });

      logger.info(`Started recording audio from user: ${user.username} (${userId}) in ${meetingId}`);
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
      // Audio will be buffered and processed during transcription
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

      // Wait for all streams to close
      await Promise.all(closePromises);

      // Wait additional 500ms to ensure all file writes are flushed to disk
      await new Promise(resolve => setTimeout(resolve, 500));

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

          logger.info(
            `Concatenated ${pcmFiles.length} PCM files for user ${userId}`
          );

          // Convert concatenated PCM to MP3
          await execPromise(
            `ffmpeg -f s16le -ar 48000 -ac 2 -i "${tempConcatFile}" -q:a 2 -y "${userMp3Path}"`
          );

          // Clean up temp file
          try {
            fs.unlinkSync(tempConcatFile);
          } catch (error) {
            logger.warn(
              `Could not delete temp concat file: ${tempConcatFile}`,
              { error: error.message }
            );
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
        logger.warn(
          `No audio files found for ${meetingId}, creating empty MP3`
        );
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
