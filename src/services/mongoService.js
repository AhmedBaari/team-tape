import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import Meeting from '../models/Meeting.js';

/**
 * MongoDB Service for meeting data persistence
 * Handles connection, CRUD operations, and data retrieval
 */
class MongoService {
  constructor() {
    this.connected = false;
  }

  /**
   * Connect to MongoDB database
   * Implements exponential backoff retry logic for connection failures
   * @param {string} uri - MongoDB connection URI
   * @param {number} maxRetries - Maximum connection attempts
   * @returns {Promise<void>}
   */
  async connect(uri, maxRetries = 5) {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Note: useNewUrlParser and useUnifiedTopology are deprecated in MongoDB driver v4+
        // They have no effect and are included only for backwards compatibility
        await mongoose.connect(uri, {
          socketTimeoutMS: 45000,
          serverSelectionTimeoutMS: 5000,
        });

        this.connected = true;
        logger.info('✅ MongoDB connection established');
        return;
      } catch (error) {
        retries++;
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        logger.warn(
          `MongoDB connection failed (attempt ${retries}/${maxRetries}). Retrying in ${delay}ms...`,
          { error: error.message }
        );

        if (retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          logger.error('❌ MongoDB connection failed after max retries', {
            error: error.message,
          });
          throw new Error(`MongoDB connection failed: ${error.message}`);
        }
      }
    }
  }

  /**
   * Disconnect from MongoDB
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.connected) {
      await mongoose.disconnect();
      this.connected = false;
      logger.info('MongoDB disconnected');
    }
  }

  /**
   * Check if database connection is active
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && mongoose.connection.readyState === 1;
  }

  /**
   * Create a new meeting record
   * @param {Object} meetingData - Meeting data
   * @returns {Promise<Object>} Created meeting document
   */
  async createMeeting(meetingData) {
    try {
      const meeting = new Meeting(meetingData);
      await meeting.save();
      logger.info(`Created meeting record: ${meetingData.meetingId}`);
      return meeting;
    } catch (error) {
      logger.error('Error creating meeting record', {
        error: error.message,
        meetingData,
      });
      throw error;
    }
  }

  /**
   * Find meeting by ID
   * @param {string} meetingId - Meeting UUID
   * @returns {Promise<Object|null>}
   */
  async findMeeting(meetingId) {
    try {
      return await Meeting.findByMeetingId(meetingId);
    } catch (error) {
      logger.error('Error finding meeting', {
        error: error.message,
        meetingId,
      });
      throw error;
    }
  }

  /**
   * Update meeting record
   * @param {string} meetingId - Meeting UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated meeting document
   */
  async updateMeeting(meetingId, updates) {
    try {
      const meeting = await Meeting.findOneAndUpdate(
        { meetingId },
        updates,
        { new: true, runValidators: true }
      );

      if (!meeting) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      logger.debug(`Updated meeting: ${meetingId}`);
      return meeting;
    } catch (error) {
      logger.error('Error updating meeting', {
        error: error.message,
        meetingId,
      });
      throw error;
    }
  }

  /**
   * Add participant to meeting
   * @param {string} meetingId - Meeting UUID
   * @param {Object} participantData - Participant info
   * @returns {Promise<Object>}
   */
  async addParticipant(meetingId, participantData) {
    try {
      const meeting = await Meeting.findOne({ meetingId });
      if (!meeting) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      return await meeting.addParticipant(participantData);
    } catch (error) {
      logger.error('Error adding participant', {
        error: error.message,
        meetingId,
        userId: participantData.userId,
      });
      throw error;
    }
  }

  /**
   * Update participant metrics
   * @param {string} meetingId - Meeting UUID
   * @param {string} userId - Discord user ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>}
   */
  async updateParticipant(meetingId, userId, updates) {
    try {
      const meeting = await Meeting.findOne({ meetingId });
      if (!meeting) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      return await meeting.updateParticipant(userId, updates);
    } catch (error) {
      logger.error('Error updating participant', {
        error: error.message,
        meetingId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Complete a meeting and save final metadata
   * @param {string} meetingId - Meeting UUID
   * @param {number} duration - Total duration in seconds
   * @returns {Promise<Object>}
   */
  async completeMeeting(meetingId, duration) {
    try {
      const meeting = await Meeting.findOne({ meetingId });
      if (!meeting) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      return await meeting.complete(duration);
    } catch (error) {
      logger.error('Error completing meeting', {
        error: error.message,
        meetingId,
      });
      throw error;
    }
  }

  /**
   * Save meeting summary from Perplexity API
   * @param {string} meetingId - Meeting UUID
   * @param {Object} summary - Summary object from Perplexity
   * @returns {Promise<Object>}
   */
  async saveSummary(meetingId, summary) {
    try {
      return await this.updateMeeting(meetingId, {
        summary: {
          ...summary,
          generatedAt: new Date(),
        },
        recordingStatus: 'completed',
      });
    } catch (error) {
      logger.error('Error saving summary', {
        error: error.message,
        meetingId,
      });
      throw error;
    }
  }

  /**
   * Save transcript to meeting record
   * @param {string} meetingId - Meeting UUID
   * @param {string} transcript - Transcribed text
   * @param {string} transcriptPath - File path to transcript
   * @returns {Promise<Object>}
   */
  async saveTranscript(meetingId, transcript, transcriptPath) {
    try {
      return await this.updateMeeting(meetingId, {
        transcript,
        transcriptFilePath: transcriptPath,
      });
    } catch (error) {
      logger.error('Error saving transcript', {
        error: error.message,
        meetingId,
      });
      throw error;
    }
  }

  /**
   * Record processing error
   * @param {string} meetingId - Meeting UUID
   * @param {string} stage - Processing stage
   * @param {string} errorMessage - Error message
   * @returns {Promise<Object>}
   */
  async recordError(meetingId, stage, errorMessage) {
    try {
      const meeting = await Meeting.findOne({ meetingId });
      if (!meeting) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      return await meeting.addError(stage, errorMessage);
    } catch (error) {
      logger.error('Error recording processing error', {
        error: error.message,
        meetingId,
        stage,
      });
      throw error;
    }
  }

  /**
   * Get recent meetings for a guild
   * @param {string} guildId - Discord guild ID
   * @param {number} limit - Number of meetings to retrieve
   * @returns {Promise<Array>}
   */
  async getRecentMeetings(guildId, limit = 10) {
    try {
      return await Meeting.findRecentByGuild(guildId, limit);
    } catch (error) {
      logger.error('Error fetching recent meetings', {
        error: error.message,
        guildId,
      });
      throw error;
    }
  }

  /**
   * Get meetings from date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>}
   */
  async getMeetingsByDateRange(startDate, endDate) {
    try {
      return await Meeting.findByDateRange(startDate, endDate);
    } catch (error) {
      logger.error('Error fetching meetings by date range', {
        error: error.message,
        startDate,
        endDate,
      });
      throw error;
    }
  }

  /**
   * Get statistics for a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<Object>}
   */
  async getGuildStats(guildId) {
    try {
      const meetings = await Meeting.find({ guildId });
      const totalDuration = meetings.reduce((sum, m) => sum + (m.duration || 0), 0);
      const totalParticipants = new Set(
        meetings.flatMap((m) => m.participants.map((p) => p.userId))
      ).size;
      const completedMeetings = meetings.filter(
        (m) => m.recordingStatus === 'completed'
      ).length;

      return {
        totalMeetings: meetings.length,
        completedMeetings,
        totalDuration,
        totalParticipants,
        averageDuration: totalDuration / (completedMeetings || 1),
      };
    } catch (error) {
      logger.error('Error fetching guild statistics', {
        error: error.message,
        guildId,
      });
      throw error;
    }
  }
}

const mongoService = new MongoService();
export default mongoService;
