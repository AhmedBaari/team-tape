import Meeting from '../../models/Meeting.js';
import logger from '../../utils/logger.js';
import { asyncHandler, ApiError } from '../utils/errorHandler.js';

/**
 * MCP Resource: meetings://list
 * Returns list of all meetings with summaries, key points, and participants
 * GET /mcp/resources/meetings/list
 */
export const listMeetingsResource = asyncHandler(async (req, res) => {
    const { limit, status } = req.query;

    // Build filter
    const filter = {};
    if (status) {
        filter.recordingStatus = status;
    }

    // Get meetings, default to completed ones
    const meetings = await Meeting.find(filter)
        .sort({ startTimestamp: -1 })
        .limit(parseInt(limit) || 50);

    // Format for MCP
    const resources = meetings.map((meeting) => ({
        uri: `meetings://meeting/${meeting.meetingId}`,
        name: generateMeetingTitle(meeting),
        description: meeting.summary?.executiveSummary || 'No summary available',
        mimeType: 'application/json',
        metadata: {
            id: meeting.meetingId,
            startTime: meeting.startTimestamp,
            endTime: meeting.endTimestamp,
            duration: meeting.duration,
            status: meeting.recordingStatus,
            participants: meeting.participants.map((p) => ({
                userId: p.userId,
                username: p.username,
                speakingTime: p.speakingTime,
            })),
            keyPoints: meeting.summary?.keyPoints || [],
            actionItems: meeting.summary?.actionItems || [],
            participantCount: meeting.totalParticipants || meeting.participants.length,
        },
    }));

    res.json({
        resources,
        totalCount: resources.length,
    });
});

/**
 * MCP Resource: meetings://meeting/{id}
 * Returns full transcript and metadata for a specific meeting
 * GET /mcp/resources/meetings/:id
 */
export const getMeetingResource = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const meeting = await Meeting.findByMeetingId(id);

    if (!meeting) {
        throw new ApiError(404, 'Meeting not found', { meetingId: id });
    }

    // Format for MCP
    const resource = {
        uri: `meetings://meeting/${meeting.meetingId}`,
        name: generateMeetingTitle(meeting),
        description: meeting.summary?.executiveSummary || 'No summary available',
        mimeType: 'text/markdown',
        content: formatMeetingAsMarkdown(meeting),
        metadata: {
            id: meeting.meetingId,
            startTime: meeting.startTimestamp,
            endTime: meeting.endTimestamp,
            duration: meeting.duration,
            channel: meeting.channelName,
            guild: meeting.guildName,
            participantCount: meeting.totalParticipants || meeting.participants.length,
            status: meeting.recordingStatus,
        },
    };

    res.json(resource);
});

/**
 * MCP Endpoint: List all available resources
 * GET /mcp/resources
 */
export const listResources = asyncHandler(async (req, res) => {
    res.json({
        resources: [
            {
                uri: 'meetings://list',
                name: 'Meeting List',
                description: 'List all recorded meetings with summaries and key points',
                mimeType: 'application/json',
            },
            {
                uri: 'meetings://meeting/{id}',
                name: 'Meeting Detail',
                description: 'Get full transcript and metadata for a specific meeting',
                mimeType: 'text/markdown',
            },
        ],
    });
});

/**
 * Helper: Generate meeting title
 * @param {Object} meeting - Meeting document
 * @returns {string} Meeting title
 */
function generateMeetingTitle(meeting) {
    const date = new Date(meeting.startTimestamp);
    const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
    const timeStr = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
    });

    return `${meeting.channelName || 'Meeting'} - ${dateStr} ${timeStr}`;
}

/**
 * Helper: Format meeting as Markdown for MCP
 * @param {Object} meeting - Meeting document
 * @returns {string} Markdown formatted meeting content
 */
function formatMeetingAsMarkdown(meeting) {
    const parts = [];

    // Title
    parts.push(`# ${generateMeetingTitle(meeting)}\n`);

    // Metadata
    parts.push('## Meeting Information\n');
    parts.push(`- **Date**: ${new Date(meeting.startTimestamp).toLocaleString()}`);
    parts.push(`- **Duration**: ${formatDuration(meeting.duration)}`);
    parts.push(`- **Channel**: ${meeting.channelName || 'Unknown'}`);
    parts.push(`- **Server**: ${meeting.guildName || 'Unknown'}`);
    parts.push(`- **Status**: ${meeting.recordingStatus}\n`);

    // Participants
    parts.push('## Participants\n');
    if (meeting.participants && meeting.participants.length > 0) {
        meeting.participants.forEach((p) => {
            const speakingTime = formatDuration(p.speakingTime);
            const duration = formatDuration(p.duration);
            parts.push(`- **${p.username}** - Speaking: ${speakingTime} / Total: ${duration}`);
        });
        parts.push('');
    } else {
        parts.push('_No participants recorded_\n');
    }

    // Summary
    if (meeting.summary) {
        parts.push('## Summary\n');

        if (meeting.summary.executiveSummary) {
            parts.push(meeting.summary.executiveSummary);
            parts.push('');
        }

        if (meeting.summary.keyPoints && meeting.summary.keyPoints.length > 0) {
            parts.push('### Key Points\n');
            meeting.summary.keyPoints.forEach((point) => {
                parts.push(`- ${point}`);
            });
            parts.push('');
        }

        if (meeting.summary.actionItems && meeting.summary.actionItems.length > 0) {
            parts.push('### Action Items\n');
            meeting.summary.actionItems.forEach((item) => {
                const assignee = item.assignee ? ` (${item.assignee})` : '';
                const dueDate = item.dueDate
                    ? ` - Due: ${new Date(item.dueDate).toLocaleDateString()}`
                    : '';
                parts.push(`- ${item.task}${assignee}${dueDate}`);
            });
            parts.push('');
        }

        if (meeting.summary.innovations && meeting.summary.innovations.length > 0) {
            parts.push('### Innovations Discussed\n');
            meeting.summary.innovations.forEach((innovation) => {
                parts.push(`- ${innovation}`);
            });
            parts.push('');
        }
    }

    // Transcript
    if (meeting.transcript) {
        parts.push('## Transcript\n');
        parts.push('```');
        parts.push(meeting.transcript);
        parts.push('```\n');
    } else {
        parts.push('## Transcript\n');
        parts.push('_Transcript not available_\n');
    }

    return parts.join('\n');
}

/**
 * Helper: Format duration in seconds to human-readable
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
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
