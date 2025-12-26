import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream';
import prism from 'prism-media';
import logger from '../utils/logger.js';

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

      // Join voice channel
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guildId,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false, // Must be able to hear to record
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
        userAudioStreams: new Map(),
        isRecording: true,
      };

      this.activeRecordings.set(meetingId, recordingSession);
      logger.info(`Started recording: ${meetingId} in channel: ${channel.name}`);

      return recordingSession;
    } catch (error) {
      logger.error('Error starting recording', {
        error: error.message,
        meetingId,
        channelId: channel.id,
      });
      throw error;
    }
  }

  /**
   * Record audio from a specific user in voice channel
   * Creates transcoding pipeline to capture user audio
   * @param {string} meetingId - Meeting identifier
   * @param {User} user - Discord user
   * @param {AudioReceiveStream} audioStream - User's audio stream
   * @returns {Promise<void>}
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

      // Close all user audio streams
      for (const [userId, streamInfo] of session.userAudioStreams) {
        try {
          streamInfo.stream.destroy();
          streamInfo.decoder.destroy();
        } catch (error) {
          logger.warn(`Error closing stream for user ${userId}`, {
            error: error.message,
          });
        }
      }

      // Disconnect from voice channel
      session.connection.destroy();

      const duration = Date.now() - session.startTime;

      session.isRecording = false;

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
