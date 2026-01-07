import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

import logger from '../utils/logger.js';
import mongoService from './mongoService.js';

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

    // Deduplication settings
    this.similarityThreshold = 0.85; // 85% similarity = duplicate
    this.containmentThreshold = 0.90; // 90% of text contained in another = duplicate
    this.minSegmentDuration = 0.3; // Minimum 300ms for valid segment
  }

  /**
   * Load user ID to name mappings from config file
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
   * @param {string} userId - Discord user ID
   * @param {string} fallbackName - Default name if no mapping found
   * @returns {string} Display name
   */
  async getUserName(userId, fallbackName = null, guildId = null) {
    // Priority: GuildConfig > userMappings.json > fallbackName > userId
    if (guildId) {
      try {
        const customName = await mongoService.getUserDisplayName(guildId, userId);
        if (customName) return customName;
      } catch (err) {
        logger.debug('Error fetching custom display name from GuildConfig', { error: err.message, userId, guildId });
      }
    }
    return this.userMappings[userId] || fallbackName || userId;
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * @private
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score between 0 and 1
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Check if one is substring of other
    if (s1.includes(s2) || s2.includes(s1)) {
      return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    }

    // Levenshtein distance
    const matrix = [];
    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[s1.length][s2.length];
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - distance / maxLength;
  }

  /**
   * Check if one text is substantially contained within another
   * Handles cases where one segment is a subset of another
   * @private
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {Object} Containment analysis result
   */
  checkContainment(text1, text2) {
    if (!text1 || !text2) return { isContained: false, ratio: 0 };

    const t1 = text1.toLowerCase().trim();
    const t2 = text2.toLowerCase().trim();

    // Direct substring check
    if (t1.includes(t2)) {
      return { isContained: true, ratio: t2.length / t1.length, container: 'text1', contained: 'text2' };
    }
    if (t2.includes(t1)) {
      return { isContained: true, ratio: t1.length / t2.length, container: 'text2', contained: 'text1' };
    }

    // Word-level containment check
    const words1 = t1.split(/\s+/).filter(w => w.length > 2);
    const words2 = t2.split(/\s+/).filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) {
      return { isContained: false, ratio: 0 };
    }

    // Count how many words from the shorter text appear in the longer
    const [shorter, longer] = words1.length <= words2.length
      ? [words1, words2]
      : [words2, words1];

    const longerSet = new Set(longer);
    const matchCount = shorter.filter(w => longerSet.has(w)).length;
    const containmentRatio = matchCount / shorter.length;

    return {
      isContained: containmentRatio >= this.containmentThreshold,
      ratio: containmentRatio,
      matchedWords: matchCount,
      totalWords: shorter.length,
    };
  }

  /**
   * Remove duplicate/near-duplicate segments from transcription
   * Handles Whisper's tendency to repeat phrases and overlapping audio
   * @private
   * @param {Array} segments - Array of transcription segments
   * @returns {Array} Deduplicated segments
   */
  deduplicateSegments(segments) {
    if (!segments || segments.length === 0) return [];

    const deduplicated = [];
    const recentTexts = []; // Track recent texts for duplicate detection
    const windowSize = 10; // Increased window for better duplicate detection

    for (const segment of segments) {
      const text = segment.text?.trim();

      // Skip empty or very short segments
      if (!text || text.length < 3) continue;

      // Skip segments that are too short in duration (likely noise)
      const duration = (segment.end || 0) - (segment.start || 0);
      if (duration < this.minSegmentDuration) continue;

      // Check for duplicates in recent window
      let isDuplicate = false;
      let duplicateReason = '';

      for (const recent of recentTexts.slice(-windowSize)) {
        // Check 1: Levenshtein similarity
        const similarity = this.calculateSimilarity(text, recent.text);
        if (similarity >= this.similarityThreshold) {
          isDuplicate = true;
          duplicateReason = `similarity ${(similarity * 100).toFixed(0)}%`;
          break;
        }

        // Check 2: Containment (one is subset of another)
        const containment = this.checkContainment(text, recent.text);
        if (containment.isContained) {
          isDuplicate = true;
          duplicateReason = `containment ${(containment.ratio * 100).toFixed(0)}%`;
          break;
        }
      }

      // Check if this text is a repetition within itself (Whisper hallucination)
      if (!isDuplicate && this.isInternalRepetition(text)) {
        // Clean the text by removing repetitions
        segment.text = this.cleanRepetitions(text);
        if (segment.text.length < 3) continue;
      }

      if (!isDuplicate) {
        deduplicated.push(segment);
        recentTexts.push({ text, speaker: segment.speaker });
      } else {
        logger.debug('Duplicate segment removed', {
          text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          reason: duplicateReason,
          speaker: segment.speaker,
        });
      }
    }

    logger.info(`Deduplication complete: ${segments.length} -> ${deduplicated.length} segments`);
    return deduplicated;
  }

  /**
   * Check if text contains internal repetitions (e.g., "hello hello hello")
   * @private
   * @param {string} text - Text to check
   * @returns {boolean} True if contains repetitions
   */
  isInternalRepetition(text) {
    if (!text || text.length < 10) return false;

    // Split into words and check for consecutive repetitions
    const words = text.toLowerCase().split(/\s+/);
    if (words.length < 4) return false;

    let repeatCount = 0;
    for (let i = 1; i < words.length; i++) {
      if (words[i] === words[i - 1] && words[i].length > 2) {
        repeatCount++;
      }
    }

    // Check for phrase repetitions
    const halfLen = Math.floor(text.length / 2);
    const firstHalf = text.substring(0, halfLen).trim();
    const secondHalf = text.substring(halfLen).trim();

    if (this.calculateSimilarity(firstHalf, secondHalf) > 0.8) {
      return true;
    }

    return repeatCount >= 2;
  }

  /**
   * Clean repeated phrases from text
   * @private
   * @param {string} text - Text with repetitions
   * @returns {string} Cleaned text
   */
  cleanRepetitions(text) {
    if (!text) return '';

    // Remove consecutive duplicate words
    const words = text.split(/\s+/);
    const cleaned = [words[0]];

    for (let i = 1; i < words.length; i++) {
      if (words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
        cleaned.push(words[i]);
      }
    }

    // If text is mostly repetition, keep first occurrence
    let result = cleaned.join(' ');

    // Check for phrase-level repetition and take first occurrence
    const patterns = result.match(/(.{10,}?)\1+/g);
    if (patterns) {
      for (const pattern of patterns) {
        const base = pattern.match(/(.{10,}?)\1+/)?.[1];
        if (base) {
          result = result.replace(pattern, base);
        }
      }
    }

    return result.trim();
  }

  /**
   * Transcribe audio files for each user separately with Discord-level speaker identification
   * @param {Array} userAudioFiles - Array of {userId, filePath, segments} objects
   * @param {Array} participants - List of meeting participants
   * @returns {Promise<Object>} Combined transcription with accurate speaker labels
   */
  /**
   * Transcribe audio files for each user separately with Discord-level speaker identification
   * Uses custom display names from GuildConfig if available
   * @param {Array} userAudioFiles - Array of {userId, filePath, segments} objects
   * @param {Array} participants - List of meeting participants
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>} Combined transcription with accurate speaker labels
   */
  async transcribePerUser(userAudioFiles, participants = [], guildId = null) {
    try {
      if (!userAudioFiles || userAudioFiles.length === 0) {
        throw new Error('No user audio files provided for transcription');
      }

      logger.info('Starting per-user transcription', {
        userCount: userAudioFiles.length,
        participantCount: participants.length,
      });

      // Create user lookup map
      const userMap = new Map();
      for (const participant of participants) {
        userMap.set(participant.userId, participant.username);
      }

      // Transcribe each user's audio separately
      const userTranscriptions = [];

      for (const userFile of userAudioFiles) {
        const { userId, filePath, segments } = userFile;

        if (!fs.existsSync(filePath)) {
          logger.warn(`Audio file not found for user ${userId}: ${filePath}`);
          continue;
        }

        // Use custom display name if available
        let username = userMap.get(userId);
        if (!username) {
          username = await this.getUserName(userId, null, guildId);
        }

        logger.info(`Transcribing audio for ${username} (${userId})`);

        // Transcribe this user's audio
        const transcript = await this.performTranscription(filePath);

        if (!transcript.segments || transcript.segments.length === 0) {
          logger.warn(`No segments returned for user ${username}`);
          continue;
        }

        // Get the actual start time from Discord segments
        const baseStartTime = segments?.[0]?.startTime || Date.now();

        // Add speaker information to each segment
        const enhancedSegments = transcript.segments.map((segment, index) => ({
          ...segment,
          speaker: username,
          speakerId: userId,
          absoluteStartTime: baseStartTime + (segment.start * 1000),
          absoluteEndTime: baseStartTime + (segment.end * 1000),
          segmentIndex: index,
        }));

        userTranscriptions.push({
          userId,
          username,
          filePath,
          segments: enhancedSegments,
          text: transcript.text,
          duration: transcript.duration,
          language: transcript.language,
          baseStartTime,
        });

        logger.info(
          `Completed transcription for ${username}: ${enhancedSegments.length} segments, ${Math.floor(transcript.duration)}s`
        );
      }

      if (userTranscriptions.length === 0) {
        throw new Error('No successful transcriptions from any user audio');
      }

      logger.info('All user audio transcribed, creating combined transcript', {
        totalSegments: userTranscriptions.reduce((sum, ut) => sum + ut.segments.length, 0),
        userCount: userTranscriptions.length,
      });

      // Merge all transcriptions chronologically with deduplication
      const mergedTranscript = this.mergeTranscriptsChronologically(userTranscriptions);

      logger.info('Per-user transcription completed successfully', {
        totalSegments: mergedTranscript.segments.length,
        userCount: userTranscriptions.length,
        duration: mergedTranscript.duration?.toFixed(2),
      });

      return mergedTranscript;
    } catch (error) {
      logger.error('Error in per-user transcription', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Merge per-user transcripts chronologically using Discord segment timestamps
   * Includes deduplication to handle Whisper repetition issues
   * @private
   * @param {Array} userTranscriptions - Array of per-user transcription objects
   * @returns {Object} Merged transcription data
   */
  mergeTranscriptsChronologically(userTranscriptions) {
    // Flatten all segments from all users
    const allSegments = [];

    for (const userTranscript of userTranscriptions) {
      const { username, userId, segments } = userTranscript;

      for (const segment of segments) {
        allSegments.push({
          ...segment,
          speaker: username,
          speakerId: userId,
        });
      }
    }

    // Sort by absolute start time (chronological order)
    allSegments.sort((a, b) => a.absoluteStartTime - b.absoluteStartTime);

    logger.debug(`Pre-deduplication segment count: ${allSegments.length}`);

    // Apply deduplication BEFORE calculating relative timestamps
    const deduplicatedSegments = this.deduplicateSegments(allSegments);

    logger.debug(`Post-deduplication segment count: ${deduplicatedSegments.length}`);

    if (deduplicatedSegments.length === 0) {
      logger.warn('All segments were deduplicated - returning empty transcript');
      return {
        fullText: '',
        formattedTranscript: '[No speech detected]',
        segments: [],
        speakingTime: {},
        language: 'en',
        duration: 0,
        userCount: userTranscriptions.length,
      };
    }

    // Get the earliest timestamp as meeting start reference
    const meetingStartTime = deduplicatedSegments[0].absoluteStartTime;

    // Calculate relative timestamps and format
    const speakingTimeMap = new Map();

    const finalSegments = deduplicatedSegments.map((seg) => {
      const relativeStartSec = (seg.absoluteStartTime - meetingStartTime) / 1000;
      const relativeEndSec = (seg.absoluteEndTime - meetingStartTime) / 1000;
      const duration = relativeEndSec - relativeStartSec;

      // Track speaking time per user
      const currentTime = speakingTimeMap.get(seg.speakerId) || 0;
      speakingTimeMap.set(seg.speakerId, currentTime + duration);

      return {
        ...seg,
        start: relativeStartSec,
        end: relativeEndSec,
        timestamp: this.formatTimestamp(relativeStartSec),
      };
    });

    // Format transcript with speaker labels and timestamps
    const formattedTranscript = finalSegments
      .map((seg) => `[${seg.timestamp}] ${seg.speaker}:  ${seg.text}`)
      .join('\n');

    // Get full text (concatenated)
    const fullText = finalSegments.map((seg) => seg.text).join(' ');

    // Calculate total duration
    const totalDuration = finalSegments.length > 0
      ? finalSegments[finalSegments.length - 1].end
      : 0;

    return {
      fullText,
      formattedTranscript,
      segments: finalSegments,
      speakingTime: Object.fromEntries(speakingTimeMap),
      language: userTranscriptions[0]?.language || 'en',
      duration: totalDuration,
      userCount: userTranscriptions.length,
    };
  }

  /**
   * Transcribe audio file using local Whisper model
   * @param {string} audioFilePath - Path to audio file
   * @param {Array} participants - List of meeting participants
   * @returns {Promise<Object>} Transcription data
   */
  async transcribeAudio(audioFilePath, participants = []) {
    try {
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const stats = fs.statSync(audioFilePath);
      logger.info(`Starting transcription of ${audioFilePath} (${stats.size} bytes)`);

      const transcript = await this.performTranscription(audioFilePath);

      // Add speaker labels and timestamps
      const enrichedTranscript = this.enrichTranscriptWithSpeakerData(
        transcript,
        participants
      );

      // Apply deduplication
      enrichedTranscript.segments = this.deduplicateSegments(enrichedTranscript.segments);

      // Regenerate formatted transcript after deduplication
      enrichedTranscript.formattedTranscript = enrichedTranscript.segments
        .map((seg) => `[${seg.timestamp}] ${seg.speaker}:  ${seg.text}`)
        .join('\n');

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
      const isHealthy = await this.checkWhisperHealth();
      if (!isHealthy) {
        logger.warn('Whisper service not healthy, using placeholder');
        return this.getPlaceholderTranscription();
      }

      // Create form data with audio file
      const form = new FormData();
      form.append('file', fs.createReadStream(audioFilePath));
      form.append('language', this.whisperLanguage);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities', 'segment');

      // Add additional parameters to improve transcription quality
      // These help reduce repetition in Whisper output
      form.append('temperature', '0.0'); // Deterministic output
      form.append('compression_ratio_threshold', '2.4'); // Filter out low-quality segments
      form.append('no_speech_threshold', '0.6'); // Be stricter about speech detection

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
      const response = await axios.get(`${this.whisperApiUrl}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.debug('Whisper health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get placeholder transcription when Whisper is unavailable
   * @private
   * @returns {Object} Placeholder transcription data
   */
  getPlaceholderTranscription() {
    logger.info('Using placeholder transcription - Whisper service not available');

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
   * @private
   * @param {Object} transcript - Raw Whisper transcription
   * @param {Array} participants - Participant information
   * @returns {Object} Enhanced transcript with speaker data
   */
  enrichTranscriptWithSpeakerData(transcript, participants = []) {
    const speakingTimeMap = new Map();
    participants.forEach((p) => {
      speakingTimeMap.set(p.userId, 0);
    });

    const enhancedSegments = transcript.segments.map((segment, index) => {
      const speakerIndex = index % Math.max(participants.length, 1);
      const speaker = participants[speakerIndex] || { userId: 'unknown', username: 'Unknown' };

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

    const formattedTranscript = enhancedSegments
      .map((seg) => `[${seg.timestamp}] ${seg.speaker}:  ${seg.text}`)
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
    const validSeconds = Math.max(0, seconds || 0);
    const hours = Math.floor(validSeconds / 3600);
    const minutes = Math.floor((validSeconds % 3600) / 60);
    const secs = Math.floor(validSeconds % 60);

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

      const filePath = path.join(transcriptsPath, `${meetingId}-transcript.txt`);
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
   * @param {Object} transcription - Transcription object
   * @returns {Object} Quality assessment
   */
  assessQuality(transcription) {
    const duration = transcription.duration || 0;
    const textLength = transcription.fullText?.length || 0;
    const segmentCount = transcription.segments?.length || 0;

    let quality = 'excellent';

    if (duration < 60) quality = 'fair';
    if (textLength < 100) quality = 'poor';
    if (segmentCount < 5) quality = 'fair';

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
