import mongoose from 'mongoose';

/**
 * Participant subdocument schema for meeting recordings
 * Tracks individual user metrics during the meeting
 */
const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      description: 'Discord user ID',
    },
    username: {
      type: String,
      required: true,
      description: 'User display name at time of recording',
    },
    joinedAt: {
      type: Date,
      required: true,
      description: 'When user joined the voice channel',
    },
    leftAt: {
      type: Date,
      description: 'When user left the voice channel (null if still present)',
    },
    duration: {
      type: Number,
      required: true,
      description: 'Total time in voice channel (seconds)',
    },
    wasDeafened: {
      type: Boolean,
      default: false,
      description: 'Whether user was deafened during any part of recording',
    },
    speakingTime: {
      type: Number,
      default: 0,
      description: 'Estimated speaking time based on diarization (seconds)',
    },
  },
  { _id: true }
);

/**
 * Summary subdocument schema for AI-generated meeting summaries
 * Stores Perplexity API response data
 */
const summarySchema = new mongoose.Schema(
  {
    executiveSummary: {
      type: String,
      description: '3-5 line executive summary of key points',
    },
    keyPoints: [
      {
        type: String,
        description: 'Bullet point of important discussion item',
      },
    ],
    actionItems: [
      {
        task: String,
        assignee: String,
        dueDate: Date,
      },
    ],
    innovations: [
      {
        type: String,
        description: 'New ideas or innovations discussed',
      },
    ],
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      description: 'Overall tone of the meeting',
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    model: {
      type: String,
      description: 'Perplexity model used for summary generation',
    },
  },
  { _id: false }
);

/**
 * Main Meeting schema for recording metadata and session information
 * Comprehensive tracking of all meeting data for archival and analysis
 */
const meetingSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      unique: true, // This creates an index automatically - no need for explicit index below
      description: 'Unique identifier for this meeting (UUID format)',
    },
    startTimestamp: {
      type: Date,
      required: true,
      default: Date.now,
      description: 'When the recording started',
    },
    endTimestamp: {
      type: Date,
      description: 'When the recording ended',
    },
    duration: {
      type: Number,
      description: 'Total recording duration (seconds)',
    },
    channelId: {
      type: String,
      required: true,
      description: 'Discord voice channel ID where recording occurred',
    },
    channelName: {
      type: String,
      description: 'Name of the voice channel',
    },
    guildId: {
      type: String,
      required: true,
      description: 'Discord guild (server) ID',
    },
    guildName: {
      type: String,
      description: 'Name of the Discord server',
    },
    startedBy: {
      type: String,
      required: false,
      description: 'Discord user ID who started the recording (Feature #5)',
    },
    participants: {
      type: [participantSchema],
      default: [],
      description: 'Array of participants and their metrics',
    },
    totalParticipants: {
      type: Number,
      description: 'Count of unique participants',
    },
    discordMessageId: {
      type: String,
      description: 'Message ID where recording summary was posted',
    },
    audioFilePath: {
      type: String,
      description: 'Local filesystem path to MP3 recording',
    },
    transcriptFilePath: {
      type: String,
      description: 'Local filesystem path to transcript file',
    },
    audioUrl: {
      type: String,
      description: 'Discord CDN URL for uploaded audio file',
    },
    transcript: {
      type: String,
      description: 'Full transcription with speaker labels',
    },
    summary: {
      type: summarySchema,
      description: 'AI-generated meeting summary',
    },
    recordingStatus: {
      type: String,
      enum: ['recording', 'processing', 'completed', 'failed'],
      default: 'recording',
      description: 'Current state of recording and processing pipeline',
    },
    processingErrors: [
      {
        stage: String, // 'transcription', 'summary', 'upload'
        error: String,
        timestamp: Date,
      },
    ],
    metadata: {
      quality: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor'],
        description: 'Assessed audio quality',
      },
      sampleRate: Number,
      channels: Number,
      bitrate: Number,
    },
  },
  {
    timestamps: true,
    collection: 'meetings',
    strict: true,
  }
);

// Compound indexes for efficient queries
// Note: meetingId already has unique index from schema definition above
meetingSchema.index({ startTimestamp: -1 });
meetingSchema.index({ guildId: 1, startTimestamp: -1 });
meetingSchema.index({ channelId: 1, startTimestamp: -1 });

/**
 * Instance methods
 */

/**
 * Add a participant to the meeting
 * @param {Object} participantData - Participant information
 * @returns {Promise<Meeting>}
 */
meetingSchema.methods.addParticipant = async function (participantData) {
  this.participants.push(participantData);
  return this.save();
};

/**
 * Update participant duration and status
 * @param {string} userId - Discord user ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Meeting>}
 */
meetingSchema.methods.updateParticipant = async function (userId, updates) {
  const participant = this.participants.find((p) => p.userId === userId);
  if (participant) {
    Object.assign(participant, updates);
    return this.save();
  }
  return this;
};

/**
 * Mark meeting as completed
 * @param {number} duration - Total duration in seconds
 * @returns {Promise<Meeting>}
 */
meetingSchema.methods.complete = async function (duration) {
  this.endTimestamp = new Date();
  this.duration = duration;
  this.totalParticipants = new Set(this.participants.map((p) => p.userId)).size;
  this.recordingStatus = 'completed';
  return this.save();
};

/**
 * Add processing error
 * @param {string} stage - Processing stage where error occurred
 * @param {string} errorMessage - Error message
 * @returns {Promise<Meeting>}
 */
meetingSchema.methods.addError = async function (stage, errorMessage) {
  this.processingErrors.push({
    stage,
    error: errorMessage,
    timestamp: new Date(),
  });
  return this.save();
};

/**
 * Static methods
 */

/**
 * Find meeting by meeting ID
 * @param {string} meetingId - Meeting UUID
 * @returns {Promise<Meeting|null>}
 */
meetingSchema.statics.findByMeetingId = async function (meetingId) {
  return this.findOne({ meetingId });
};

/**
 * Find recent meetings for a guild
 * @param {string} guildId - Discord guild ID
 * @param {number} limit - Number of recent meetings
 * @returns {Promise<Meeting[]>}
 */
meetingSchema.statics.findRecentByGuild = async function (guildId, limit = 10) {
  return this.find({ guildId })
    .sort({ startTimestamp: -1 })
    .limit(limit);
};

/**
 * Find meetings from date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Meeting[]>}
 */
meetingSchema.statics.findByDateRange = async function (startDate, endDate) {
  return this.find({
    startTimestamp: {
      $gte: startDate,
      $lte: endDate,
    },
  }).sort({ startTimestamp: -1 });
};

const Meeting =
  mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);

export default Meeting;
