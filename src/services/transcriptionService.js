import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import logger from '../utils/logger.js';

/**
 * Transcription Service
 * Handles audio transcription and speaker diarization
 * Integrates with local Faster-Whisper Docker service
 */
class TranscriptionService {
  constructor() {
    this.userMappings = this.loadUserMappings();
    this.whisperApiUrl = process.env.WHISPER_API_URL || 'http://localhost:7704';
    this.whisperModel = process.env.WHISPER_MODEL || 'base';
    this.whisperLanguage = process.env.WHISPER_LANGUAGE || 'en';
  }

  /**
   * Load user ID to name mappings from config file
   * Maps Discord user IDs to display names for diarization
   * @private
   * @returns {Object} User ID -> name mapping
   */
  loadUserMappings() {
    try {
      const configPath = './config/userMappings.json';
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(data);
      }
      return {};
    } catch (error) {
      logger.warn('Error loading user mappings', { error: error.message });
      return {};
    }
  }

  /**
   * Get display name for user
   * Falls back to user ID if name mapping not found
   * @param {string} userId - Discord user ID
   * @param {string} fallbackName - Default name if no mapping found
   * @returns {string} Display name
   */
  getUserName(userId, fallbackName = null) {
    return this.userMappings[userId] || fallbackName || userId;
  }

  /**
   * Transcribe audio file using local Whisper model
   * Simulates Whisper transcription with speaker diarization
   * In production, integrate with actual Whisper service or API
   * @param {string} audioFilePath - Path to MP3 file
   * @param {Array} participants - List of meeting participants
   * @returns {Promise<Object>} Transcription data
   */
  async transcribeAudio(audioFilePath, participants = []) {
    try {
      // Check if file exists
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const stats = fs.statSync(audioFilePath);
      logger.info(`Starting transcription of ${audioFilePath} (${stats.size} bytes)`);

      // PRODUCTION NOTE: Replace this with actual Whisper integration
      // Options:
      // 1. Local Whisper via @xenova/transformers (browser-compatible)
      // 2. OpenAI Whisper API
      // 3. Faster-Whisper server (self-hosted, optimized)
      // 4. Azure Speech Services

      const transcript = await this.performTranscription(audioFilePath);

      // Add speaker labels and timestamps
      const enrichedTranscript = this.enrichTranscriptWithSpeakerData(
        transcript,
        participants
      );

      logger.info('Transcription completed successfully');

      return enrichedTranscript;
    } catch (error) {
      logger.error('Error transcribing audio', {
        error: error.message,
        filePath: audioFilePath,
      });
      throw error;
    }
  }

  /**
   * Perform actual transcription using local Faster-Whisper API
   * @private
   * @param {string} audioFilePath - Audio file path
   * @returns {Promise<Object>} Raw transcription data
   */
  async performTranscription(audioFilePath) {
    try {
      // Check if Whisper service is available
      await this.checkWhisperHealth();

      // Create form data with audio file
      const form = new FormData();
      form.append('file', fs.createReadStream(audioFilePath));
      form.append('language', this.whisperLanguage);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities', 'segment');

      logger.debug('Sending audio to Whisper API', {
        url: `${this.whisperApiUrl}/v1/audio/transcriptions`,
        fileSize: fs.statSync(audioFilePath).size,
        language: this.whisperLanguage,
      });

      // Call Whisper API
      const response = await axios.post(
        `${this.whisperApiUrl}/v1/audio/transcriptions`,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
          timeout: 300000, // 5 minutes timeout
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      logger.info('Whisper transcription completed', {
        duration: response.data.duration,
        language: response.data.language,
        segments: response.data.segments?.length || 0,
      });

      return response.data;
    } catch (error) {
      // Fallback to placeholder if Whisper service is unavailable
      if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
        logger.warn('Whisper service unavailable, using placeholder transcription', {
          error: error.message,
        });
        return this.getPlaceholderTranscription();
      }
      throw error;
    }
  }

  /**
   * Check if Whisper service is healthy
   * @private
   * @returns {Promise<boolean>}
   */
  async checkWhisperHealth() {
    try {
      await axios.get(`${this.whisperApiUrl}/health`, { timeout: 5000 });
      return true;
    } catch (error) {
      logger.warn('Whisper health check failed', {
        url: this.whisperApiUrl,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get placeholder transcription when Whisper is unavailable
   * @private
   * @returns {Object} Placeholder transcription data
   */
  getPlaceholderTranscription() {
    logger.info(
      'Using placeholder transcription - Whisper service not available'
    );

    return {
      text: 'Meeting discussion audio - Whisper service unavailable',
      segments: [
        {
          id: 0,
          seek: 0,
          start: 0.0,
          end: 10.0,
          text: 'Transcription service temporarily unavailable. Please ensure Docker container is running.',
          tokens: [],
          temperature: 0.0,
          avg_logprob: -0.5,
          compression_ratio: 1.5,
          no_speech_prob: 0.1,
        },
      ],
      language: 'en',
      duration: 10.0,
    };
  }

  /**
   * Enrich transcript with speaker labels and timestamps
   * Maps audio segments to meeting participants
   * @private
   * @param {Object} transcript - Raw Whisper transcription
   * @param {Array} participants - Participant information
   * @returns {Object} Enhanced transcript with speaker data
   */
  enrichTranscriptWithSpeakerData(transcript, participants = []) {
    // Create speaking time tracker
    const speakingTimeMap = new Map();
    participants.forEach((p) => {
      speakingTimeMap.set(p.userId, 0);
    });

    // Enhanced segments with speaker labels
    const enhancedSegments = transcript.segments.map((segment, index) => {
      // Simple speaker assignment: rotate through participants
      // In production, use voice-based speaker diarization
      const speakerIndex = index % Math.max(participants.length, 1);
      const speaker =
        participants[speakerIndex] || { userId: 'unknown', username: 'Unknown' };

      // Track speaking time
      const duration = segment.end - segment.start;
      const currentTime = speakingTimeMap.get(speaker.userId) || 0;
      speakingTimeMap.set(speaker.userId, currentTime + duration);

      return {
        ...segment,
        speaker: speaker.username,
        speakerId: speaker.userId,
        timestamp: this.formatTimestamp(segment.start),
      };
    });

    // Format final transcript with speaker labels
    const formattedTranscript = enhancedSegments
      .map(
        (seg) => `[${seg.timestamp}] ${seg.speaker}: ${seg.text}`
      )
      .join('\n');

    return {
      fullText: transcript.text,
      formattedTranscript,
      segments: enhancedSegments,
      speakingTime: Object.fromEntries(speakingTimeMap),
      language: transcript.language,
      duration: transcript.segments[transcript.segments.length - 1]?.end || 0,
    };
  }

  /**
   * Format seconds to HH:MM:SS timestamp
   * @private
   * @param {number} seconds - Seconds value
   * @returns {string} Formatted timestamp
   */
  formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Save transcript to file
   * @param {string} transcript - Transcript text
   * @param {string} meetingId - Meeting identifier
   * @returns {Promise<string>} File path where transcript was saved
   */
  async saveTranscript(transcript, meetingId) {
    try {
      const transcriptsPath = './transcripts';
      if (!fs.existsSync(transcriptsPath)) {
        fs.mkdirSync(transcriptsPath, { recursive: true });
      }

      const filePath = path.join(
        transcriptsPath,
        `${meetingId}-transcript.txt`
      );
      fs.writeFileSync(filePath, transcript);

      logger.info(`Saved transcript to ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Error saving transcript', {
        error: error.message,
        meetingId,
      });
      throw error;
    }
  }

  /**
   * Calculate speaking statistics from transcript
   * @param {Object} transcription - Transcription object with speaking time
   * @returns {Object} Speaking statistics
   */
  calculateSpeakingStats(transcription) {
    const speakingTime = transcription.speakingTime || {};
    const totalTime = Object.values(speakingTime).reduce((a, b) => a + b, 0);

    const stats = {};
    Object.entries(speakingTime).forEach(([userId, time]) => {
      stats[userId] = {
        speakingTime: Math.floor(time),
        percentage: totalTime > 0 ? ((time / totalTime) * 100).toFixed(1) : 0,
      };
    });

    return stats;
  }

  /**
   * Validate transcription quality
   * Check for minimum duration, speech content, etc.
   * @param {Object} transcription - Transcription object
   * @returns {Object} Quality assessment
   */
  assessQuality(transcription) {
    const duration = transcription.duration || 0;
    const textLength = transcription.fullText?.length || 0;
    const segmentCount = transcription.segments?.length || 0;

    let quality = 'excellent';

    if (duration < 60) quality = 'fair'; // Less than 1 minute
    if (textLength < 100) quality = 'poor'; // Very little text
    if (segmentCount < 5) quality = 'fair'; // Few segments

    return {
      quality,
      duration,
      textLength,
      segmentCount,
      assessment: `${quality.charAt(0).toUpperCase() + quality.slice(1)} quality transcription (${Math.floor(duration)}s, ${textLength} characters)`,
    };
  }
}

const transcriptionService = new TranscriptionService();
export default transcriptionService;
