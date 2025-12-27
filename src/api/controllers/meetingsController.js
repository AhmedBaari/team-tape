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
