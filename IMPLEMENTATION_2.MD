# IMPLEMENTATION_2.MD - REST API Endpoints

## Overview
This document covers the implementation of REST API endpoints for accessing meeting data, transcripts, summaries, and audio files.

---

## Part 1: Meeting List Endpoint

### 1.1 Create src/api/controllers/meetingsController.js

```javascript
import mongoService from '../../services/mongoService.js';
import Meeting from '../../models/Meeting.js';
import logger from '../../utils/logger.js';
import {
  getPaginationParams,
  buildPaginationMeta,
  applyPagination,
} from '../utils/pagination.js';
import {
  successResponse,
  formatMeetingList,
  formatMeetingDetails,
} from '../utils/responseFormatter.js';
import { ApiError, asyncHandler } from '../utils/errorHandler.js';
import fs from 'fs';
import path from 'path';

/**
 * Get list of all meetings with pagination and filtering
 * GET /api/v1/meetings
 * Query params:
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20, max: 100)
 *   - status: Filter by recording status
 *   - guildId: Filter by guild ID (optional, but bot is single-server)
 *   - search: Search in channel name or summary
 */
export const listMeetings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const { status, guildId, search } = req.query;

  // Build query filter
  const filter = {};

  if (status) {
    filter.recordingStatus = status;
  }

  if (guildId) {
    filter.guildId = guildId;
  }

  if (search) {
    filter.$or = [
      { channelName: { $regex: search, $options: 'i' } },
      { 'summary.executiveSummary': { $regex: search, $options: 'i' } },
    ];
  }

  // Get total count for pagination
  const total = await Meeting.countDocuments(filter);

  // Get meetings with pagination
  const meetings = await Meeting.find(filter)
    .sort({ startTimestamp: -1 })
    .skip(skip)
    .limit(limit);

  // Format response
  const formattedMeetings = formatMeetingList(meetings);
  const meta = buildPaginationMeta(page, limit, total);

  res.json(successResponse(formattedMeetings, meta));
});

/**
 * Get single meeting details
 * GET /api/v1/meetings/:id
 */
export const getMeeting = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const meeting = await Meeting.findByMeetingId(id);

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found', { meetingId: id });
  }

  const formattedMeeting = formatMeetingDetails(meeting);

  res.json(successResponse(formattedMeeting));
});

/**
 * Get meeting transcript
 * GET /api/v1/meetings/:id/transcript
 * Response formats:
 *   - JSON (default): { transcript: "...", participants: [...] }
 *   - Text (format=text): Plain text transcript
 */
export const getTranscript = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { format } = req.query;

  const meeting = await Meeting.findByMeetingId(id);

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found', { meetingId: id });
  }

  if (!meeting.transcript) {
    throw new ApiError(404, 'Transcript not available for this meeting');
  }

  // Return as plain text if requested
  if (format === 'text') {
    res.setHeader('Content-Type', 'text/plain');
    return res.send(meeting.transcript);
  }

  // Return as JSON with metadata
  res.json(
    successResponse({
      meetingId: meeting.meetingId,
      transcript: meeting.transcript,
      participants: meeting.participants.map((p) => ({
        userId: p.userId,
        username: p.username,
        speakingTime: p.speakingTime,
      })),
      duration: meeting.duration,
      startTime: meeting.startTimestamp,
    })
  );
});

/**
 * Get meeting summary
 * GET /api/v1/meetings/:id/summary
 */
export const getSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const meeting = await Meeting.findByMeetingId(id);

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found', { meetingId: id });
  }

  if (!meeting.summary) {
    throw new ApiError(404, 'Summary not available for this meeting');
  }

  res.json(
    successResponse({
      meetingId: meeting.meetingId,
      summary: {
        executiveSummary: meeting.summary.executiveSummary,
        keyPoints: meeting.summary.keyPoints,
        actionItems: meeting.summary.actionItems,
        innovations: meeting.summary.innovations,
        sentiment: meeting.summary.sentiment,
        generatedAt: meeting.summary.generatedAt,
        model: meeting.summary.model,
      },
      metadata: {
        startTime: meeting.startTimestamp,
        duration: meeting.duration,
        participantCount: meeting.totalParticipants,
      },
    })
  );
});

/**
 * Download meeting audio file
 * GET /api/v1/meetings/:id/audio
 * Query params:
 *   - userId: Get specific user's audio track (optional)
 */
export const getAudio = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;

  const meeting = await Meeting.findByMeetingId(id);

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found', { meetingId: id });
  }

  if (!meeting.audioFilePath) {
    throw new ApiError(404, 'Audio file not available for this meeting');
  }

  // Determine which file to serve
  let audioPath;
  let filename;

  if (userId) {
    // Serve individual user track
    const recordingsPath = process.env.RECORDINGS_PATH || './recordings';
    audioPath = path.join(recordingsPath, `${id}-user-${userId}.mp3`);
    filename = `${id}-user-${userId}.mp3`;

    if (!fs.existsSync(audioPath)) {
      throw new ApiError(404, 'Audio file not found for this user', { userId });
    }
  } else {
    // Serve merged audio
    audioPath = meeting.audioFilePath;
    filename = path.basename(audioPath);

    if (!fs.existsSync(audioPath)) {
      throw new ApiError(404, 'Audio file not found on disk');
    }
  }

  // Get file stats for headers
  const stat = fs.statSync(audioPath);

  // Set headers
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Stream file to response
  const stream = fs.createReadStream(audioPath);
  stream.pipe(res);

  stream.on('error', (error) => {
    logger.error('Error streaming audio file', {
      error: error.message,
      audioPath,
      meetingId: id,
    });
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to stream audio file',
      });
    }
  });
});

/**
 * Get meeting participants
 * GET /api/v1/meetings/:id/participants
 */
export const getParticipants = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const meeting = await Meeting.findByMeetingId(id);

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found', { meetingId: id });
  }

  const participants = meeting.participants.map((p) => ({
    userId: p.userId,
    username: p.username,
    joinedAt: p.joinedAt,
    leftAt: p.leftAt,
    duration: p.duration,
    speakingTime: p.speakingTime,
    wasDeafened: p.wasDeafened,
    speakingPercentage:
      p.duration > 0 ? ((p.speakingTime / p.duration) * 100).toFixed(2) : 0,
  }));

  res.json(
    successResponse({
      meetingId: meeting.meetingId,
      participantCount: participants.length,
      participants,
    })
  );
});
```

---

## Part 2: Analytics Endpoint

### 2.1 Create src/api/controllers/analyticsController.js

```javascript
import Meeting from '../../models/Meeting.js';
import logger from '../../utils/logger.js';
import { successResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/errorHandler.js';

/**
 * Get total speaking time per user across all meetings
 * GET /api/v1/analytics/user-speaking-time
 * Query params:
 *   - guildId: Filter by guild (optional)
 *   - limit: Number of top users to return (default: all)
 */
export const getUserSpeakingTime = asyncHandler(async (req, res) => {
  const { guildId, limit } = req.query;

  // Build filter
  const filter = { recordingStatus: 'completed' };
  if (guildId) {
    filter.guildId = guildId;
  }

  // Aggregate speaking time per user
  const userStats = await Meeting.aggregate([
    { $match: filter },
    { $unwind: '$participants' },
    {
      $group: {
        _id: '$participants.userId',
        username: { $first: '$participants.username' },
        totalSpeakingTime: { $sum: '$participants.speakingTime' },
        totalDuration: { $sum: '$participants.duration' },
        meetingCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        username: 1,
        totalSpeakingTime: 1,
        totalDuration: 1,
        meetingCount: 1,
        averageSpeakingTime: {
          $divide: ['$totalSpeakingTime', '$meetingCount'],
        },
        speakingPercentage: {
          $cond: {
            if: { $gt: ['$totalDuration', 0] },
            then: {
              $multiply: [
                { $divide: ['$totalSpeakingTime', '$totalDuration'] },
                100,
              ],
            },
            else: 0,
          },
        },
      },
    },
    { $sort: { totalSpeakingTime: -1 } },
  ]);

  // Apply limit if specified
  const limitedStats = limit
    ? userStats.slice(0, parseInt(limit))
    : userStats;

  // Format speaking time to human-readable
  const formattedStats = limitedStats.map((stat) => ({
    ...stat,
    totalSpeakingTimeFormatted: formatDuration(stat.totalSpeakingTime),
    totalDurationFormatted: formatDuration(stat.totalDuration),
    averageSpeakingTimeFormatted: formatDuration(stat.averageSpeakingTime),
    speakingPercentage: parseFloat(stat.speakingPercentage.toFixed(2)),
  }));

  res.json(
    successResponse({
      userCount: formattedStats.length,
      users: formattedStats,
    })
  );
});

/**
 * Get overall analytics summary
 * GET /api/v1/analytics/summary
 */
export const getAnalyticsSummary = asyncHandler(async (req, res) => {
  const { guildId } = req.query;

  const filter = {};
  if (guildId) {
    filter.guildId = guildId;
  }

  // Get all meetings
  const allMeetings = await Meeting.find(filter);
  const completedMeetings = allMeetings.filter(
    (m) => m.recordingStatus === 'completed'
  );

  // Calculate statistics
  const totalMeetings = allMeetings.length;
  const completedCount = completedMeetings.length;
  const totalDuration = completedMeetings.reduce(
    (sum, m) => sum + (m.duration || 0),
    0
  );
  const averageDuration = completedCount > 0 ? totalDuration / completedCount : 0;

  // Get unique participants
  const allParticipants = new Set();
  completedMeetings.forEach((m) => {
    m.participants.forEach((p) => allParticipants.add(p.userId));
  });

  // Get meeting frequency (meetings per day over last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentMeetings = completedMeetings.filter(
    (m) => new Date(m.startTimestamp) >= thirtyDaysAgo
  );
  const meetingsPerDay = recentMeetings.length / 30;

  res.json(
    successResponse({
      totalMeetings,
      completedMeetings: completedCount,
      processingMeetings: totalMeetings - completedCount,
      totalDuration,
      totalDurationFormatted: formatDuration(totalDuration),
      averageDuration,
      averageDurationFormatted: formatDuration(averageDuration),
      uniqueParticipants: allParticipants.size,
      meetingsLast30Days: recentMeetings.length,
      averageMeetingsPerDay: parseFloat(meetingsPerDay.toFixed(2)),
    })
  );
});

/**
 * Helper: Format duration in seconds to human-readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1h 23m 45s")
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
```

---

## Part 3: Create Route Files

### 3.1 Create src/api/routes/meetings.js

```javascript
import express from 'express';
import {
  listMeetings,
  getMeeting,
  getTranscript,
  getSummary,
  getAudio,
  getParticipants,
} from '../controllers/meetingsController.js';

const router = express.Router();

/**
 * Meeting routes
 * All routes are protected by authentication middleware from parent router
 */

// List all meetings with pagination and filtering
router.get('/', listMeetings);

// Get single meeting details
router.get('/:id', getMeeting);

// Get meeting transcript
router.get('/:id/transcript', getTranscript);

// Get meeting summary
router.get('/:id/summary', getSummary);

// Download meeting audio
router.get('/:id/audio', getAudio);

// Get meeting participants
router.get('/:id/participants', getParticipants);

export default router;
```

### 3.2 Create src/api/routes/analytics.js

```javascript
import express from 'express';
import {
  getUserSpeakingTime,
  getAnalyticsSummary,
} from '../controllers/analyticsController.js';

const router = express.Router();

/**
 * Analytics routes
 * All routes are protected by authentication middleware from parent router
 */

// Get total speaking time per user
router.get('/user-speaking-time', getUserSpeakingTime);

// Get overall analytics summary
router.get('/summary', getAnalyticsSummary);

export default router;
```

### 3.3 Update src/api/routes/index.js

Update the main API router to mount the new routes:

**Replace the entire file with:**

```javascript
import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import meetingsRouter from './meetings.js';
import analyticsRouter from './analytics.js';

const router = express.Router();

// Apply authentication to all API routes
router.use(authenticateApiKey);

// Mount sub-routers
router.use('/meetings', meetingsRouter);
router.use('/analytics', analyticsRouter);

// API root endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TeamTape API v1',
    version: '1.0.0',
    endpoints: {
      meetings: {
        list: 'GET /api/v1/meetings',
        details: 'GET /api/v1/meetings/:id',
        transcript: 'GET /api/v1/meetings/:id/transcript',
        summary: 'GET /api/v1/meetings/:id/summary',
        audio: 'GET /api/v1/meetings/:id/audio',
        participants: 'GET /api/v1/meetings/:id/participants',
      },
      analytics: {
        userSpeakingTime: 'GET /api/v1/analytics/user-speaking-time',
        summary: 'GET /api/v1/analytics/summary',
      },
    },
    documentation: 'https://github.com/AhmedBaari/team-tape',
  });
});

export default router;
```

---

## Part 4: Testing the API Endpoints

### 4.1 Test Meeting List

```bash
# Get all meetings (default pagination)
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings

# Get meetings with pagination
curl -H "Authorization: Bearer your_api_key" \
  "http://localhost:3000/api/v1/meetings?page=1&limit=10"

# Filter by status
curl -H "Authorization: Bearer your_api_key" \
  "http://localhost:3000/api/v1/meetings?status=completed"

# Search in channel names
curl -H "Authorization: Bearer your_api_key" \
  "http://localhost:3000/api/v1/meetings?search=general"
```

Expected response:

```json
{
  "success": true,
  "data": [
    {
      "id": "abc123-uuid",
      "title": "General Voice - Dec 27, 2024 10:30 AM",
      "startTime": "2024-12-27T10:30:00.000Z",
      "endTime": "2024-12-27T11:15:00.000Z",
      "duration": 2700,
      "status": "completed",
      "channel": {
        "id": "channel_id_123",
        "name": "General Voice"
      },
      "guild": {
        "id": "guild_id_456",
        "name": "My Server"
      },
      "participantCount": 5,
      "hasTranscript": true,
      "hasSummary": true,
      "hasAudio": true
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 4.2 Test Meeting Details

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings/abc123-uuid
```

### 4.3 Test Transcript

```bash
# Get transcript as JSON
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings/abc123-uuid/transcript

# Get transcript as plain text
curl -H "Authorization: Bearer your_api_key" \
  "http://localhost:3000/api/v1/meetings/abc123-uuid/transcript?format=text"
```

### 4.4 Test Summary

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings/abc123-uuid/summary
```

Expected response:

```json
{
  "success": true,
  "data": {
    "meetingId": "abc123-uuid",
    "summary": {
      "executiveSummary": "Team discussed Q4 roadmap...",
      "keyPoints": [
        "New feature prioritization for Q4",
        "Budget allocation for hiring",
        "Timeline for product launch"
      ],
      "actionItems": [
        {
          "task": "Create hiring plan",
          "assignee": "John",
          "dueDate": "2024-12-30T00:00:00.000Z"
        }
      ],
      "innovations": ["AI-powered search feature"],
      "sentiment": "positive",
      "generatedAt": "2024-12-27T11:20:00.000Z",
      "model": "llama-3.1-sonar-large-128k-online"
    },
    "metadata": {
      "startTime": "2024-12-27T10:30:00.000Z",
      "duration": 2700,
      "participantCount": 5
    }
  }
}
```

### 4.5 Test Audio Download

```bash
# Download merged audio
curl -H "Authorization: Bearer your_api_key" \
  -o meeting.mp3 \
  http://localhost:3000/api/v1/meetings/abc123-uuid/audio

# Download specific user's audio
curl -H "Authorization: Bearer your_api_key" \
  -o user-audio.mp3 \
  "http://localhost:3000/api/v1/meetings/abc123-uuid/audio?userId=user_id_123"
```

### 4.6 Test Participants

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings/abc123-uuid/participants
```

Expected response:

```json
{
  "success": true,
  "data": {
    "meetingId": "abc123-uuid",
    "participantCount": 5,
    "participants": [
      {
        "userId": "user_123",
        "username": "John Doe",
        "joinedAt": "2024-12-27T10:30:00.000Z",
        "leftAt": "2024-12-27T11:15:00.000Z",
        "duration": 2700,
        "speakingTime": 450,
        "wasDeafened": false,
        "speakingPercentage": "16.67"
      }
    ]
  }
}
```

### 4.7 Test User Speaking Time

```bash
# Get all users' speaking time
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/analytics/user-speaking-time

# Get top 10 speakers
curl -H "Authorization: Bearer your_api_key" \
  "http://localhost:3000/api/v1/analytics/user-speaking-time?limit=10"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "userCount": 5,
    "users": [
      {
        "userId": "user_123",
        "username": "John Doe",
        "totalSpeakingTime": 3600,
        "totalDuration": 10800,
        "meetingCount": 4,
        "averageSpeakingTime": 900,
        "speakingPercentage": 33.33,
        "totalSpeakingTimeFormatted": "1h 0m 0s",
        "totalDurationFormatted": "3h 0m 0s",
        "averageSpeakingTimeFormatted": "15m 0s"
      }
    ]
  }
}
```

### 4.8 Test Analytics Summary

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/analytics/summary
```

Expected response:

```json
{
  "success": true,
  "data": {
    "totalMeetings": 10,
    "completedMeetings": 8,
    "processingMeetings": 2,
    "totalDuration": 21600,
    "totalDurationFormatted": "6h 0m 0s",
    "averageDuration": 2700,
    "averageDurationFormatted": "45m 0s",
    "uniqueParticipants": 12,
    "meetingsLast30Days": 10,
    "averageMeetingsPerDay": 0.33
  }
}
```

---

## Part 5: Error Handling Examples

### 5.1 Meeting Not Found

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings/nonexistent-id
```

Response:

```json
{
  "error": "ApiError",
  "message": "Meeting not found",
  "details": {
    "meetingId": "nonexistent-id"
  }
}
```

### 5.2 Transcript Not Available

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings/abc123-uuid/transcript
```

Response (if no transcript):

```json
{
  "error": "ApiError",
  "message": "Transcript not available for this meeting"
}
```

### 5.3 Audio File Not Found

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/v1/meetings/abc123-uuid/audio
```

Response (if file deleted):

```json
{
  "error": "ApiError",
  "message": "Audio file not found on disk"
}
```

---

## Part 6: Validation Checklist

Before proceeding to IMPLEMENTATION_3.MD, verify:

- [x] Meeting list endpoint returns paginated results
- [x] Meeting details endpoint returns full meeting data
- [x] Transcript endpoint returns transcript in JSON and text formats
- [x] Summary endpoint returns AI-generated summary
- [x] Audio endpoint streams MP3 files correctly
- [x] Participants endpoint returns participant details
- [x] User speaking time analytics work correctly
- [x] Analytics summary returns overall statistics
- [x] All endpoints require authentication
- [x] Error handling works for missing meetings/files
- [x] Pagination works correctly
- [x] Filtering and search work as expected

---

## Summary

This implementation guide covered:

1. Creating meeting controller with all CRUD endpoints
2. Implementing analytics controller for user speaking time
3. Creating route files for meetings and analytics
4. Testing all API endpoints with curl examples
5. Validating error handling for edge cases

**All REST API endpoints are now functional and ready for dashboard integration.**

**Next Steps:** Proceed to `IMPLEMENTATION_3.MD` for MCP server implementation.
