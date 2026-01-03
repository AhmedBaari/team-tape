/**
 * MCP (Model Context Protocol) Service
 * Implements JSON-RPC 2.0 over HTTP for MCP clients
 * 
 * This service wraps the existing REST API endpoints and exposes them
 * via the standard MCP protocol format.
 */

import Meeting from '../models/Meeting.js';
import logger from '../utils/logger.js';

/**
 * MCP Protocol Version
 */
const MCP_VERSION = '2024-11-05';

/**
 * Server Information
 */
const SERVER_INFO = {
    name: 'sastranet-teamtape-server',
    version: '1.0.0',
    protocolVersion: MCP_VERSION,
    description: 'Sastranet team meeting recordings, transcripts, and AI summaries',
};

/**
 * Available MCP capabilities
 */
const CAPABILITIES = {
    resources: {
        list: true,
        read: true,
    },
    tools: {},
    prompts: {},
};

/**
 * Handle MCP JSON-RPC Request
 * @param {Object} request - JSON-RPC request object
 * @returns {Promise<Object>} JSON-RPC response
 */
export async function handleMcpRequest(request) {
    const { jsonrpc, method, params, id } = request;

    // Validate JSON-RPC version
    if (jsonrpc !== '2.0') {
        return createErrorResponse(id, -32600, 'Invalid JSON-RPC version');
    }

    // Validate method exists
    if (!method) {
        return createErrorResponse(id, -32600, 'Missing method');
    }

    logger.debug('MCP request received', { method, params });

    try {
        // Route to appropriate handler
        switch (method) {
            case 'initialize':
                return createSuccessResponse(id, await handleInitialize(params));

            case 'resources/list':
                return createSuccessResponse(id, await handleResourcesList(params));

            case 'resources/read':
                return createSuccessResponse(id, await handleResourceRead(params));

            case 'ping':
                return createSuccessResponse(id, {});

            default:
                return createErrorResponse(id, -32601, `Method not found: ${method}`);
        }
    } catch (error) {
        logger.error('MCP request handler error', {
            method,
            error: error.message,
            stack: error.stack,
        });

        return createErrorResponse(
            id,
            -32603,
            error.message || 'Internal error',
            { details: error.stack }
        );
    }
}

/**
 * Handle initialize request
 * @param {Object} params - Initialize parameters
 * @returns {Promise<Object>} Initialize response
 */
async function handleInitialize(params) {
    logger.info('MCP client initializing', {
        clientInfo: params?.clientInfo,
        protocolVersion: params?.protocolVersion,
    });

    return {
        protocolVersion: MCP_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: CAPABILITIES,
    };
}

/**
 * Handle resources/list request
 * Returns list of Sastranet team meeting recordings including:
 * - Daily standups and sync meetings
 * - Architecture discussions and design decisions
 * - Best practices reviews and coding standards updates
 * - Innovation brainstorming sessions
 * - Team retrospectives and planning meetings
 * 
 * Each resource includes meeting metadata, participants, key points, and action items.
 * Use this to discover available meeting transcripts and summaries.
 * 
 * @param {Object} params - List parameters (cursor for pagination)
 * @returns {Promise<Object>} Resources list response with meeting metadata
 */
async function handleResourcesList(params) {
    const { cursor } = params || {};
    const limit = 50; // MCP standard page size

    // Build filter
    const filter = { recordingStatus: 'completed' };

    // Handle pagination with cursor (meetingId)
    if (cursor) {
        const cursorMeeting = await Meeting.findByMeetingId(cursor);
        if (cursorMeeting) {
            filter.startTimestamp = { $lt: cursorMeeting.startTimestamp };
        }
    }

    // Fetch meetings
    const meetings = await Meeting.find(filter)
        .sort({ startTimestamp: -1 })
        .limit(limit + 1); // Fetch one extra to determine if there are more

    const hasMore = meetings.length > limit;
    const meetingsToReturn = hasMore ? meetings.slice(0, limit) : meetings;

    // Convert to MCP resource format
    const resources = meetingsToReturn.map((meeting) => ({
        uri: `meeting://${meeting.meetingId}`,
        name: generateMeetingTitle(meeting),
        description: meeting.summary?.executiveSummary || 'Sastranet team meeting - recording, transcript, and AI-generated summary with key decisions and action items',
        mimeType: 'text/markdown',
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
    }));

    const response = { resources };

    // Add nextCursor if there are more results
    if (hasMore) {
        response.nextCursor = meetingsToReturn[meetingsToReturn.length - 1].meetingId;
    }

    logger.debug('Resources listed', { count: resources.length, hasMore });

    return response;
}

/**
 * Handle resources/read request
 * Returns complete meeting content for Sastranet team meetings including:
 * - Full verbatim transcript with speaker attribution and timestamps
 * - AI-generated executive summary
 * - Key discussion points and technical decisions
 * - Action items with assignees and due dates
 * - Architecture changes and best practice updates discussed
 * - Innovation ideas and proposals
 * - Participant speaking statistics
 * 
 * Use this to access the complete record of a specific meeting.
 * 
 * @param {Object} params - Read parameters with URI (format: meeting://mtg_xxxxx)
 * @returns {Promise<Object>} Resource content in markdown format
 */
async function handleResourceRead(params) {
    const { uri } = params || {};

    if (!uri) {
        throw new Error('Missing uri parameter');
    }

    // Parse URI: meeting://mtg_xxxxx
    const match = uri.match(/^meeting:\/\/(.+)$/);
    if (!match) {
        throw new Error(`Invalid resource URI format: ${uri}`);
    }

    const meetingId = match[1];

    // Fetch meeting
    const meeting = await Meeting.findByMeetingId(meetingId);

    if (!meeting) {
        throw new Error(`Meeting not found: ${meetingId}`);
    }

    // Format as markdown content
    const content = formatMeetingAsMarkdown(meeting);

    logger.debug('Resource read', { uri, meetingId });

    return {
        contents: [
            {
                uri,
                mimeType: 'text/markdown',
                text: content,
            },
        ],
    };
}

/**
 * Generate human-readable meeting title
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
 * Format meeting as Markdown
 * @param {Object} meeting - Meeting document
 * @returns {string} Markdown content
 */
function formatMeetingAsMarkdown(meeting) {
    const parts = [];

    // Title
    parts.push(`# ${generateMeetingTitle(meeting)}\n`);

    // Meeting ID
    parts.push(`**Meeting ID:** ${meeting.meetingId}\n`);

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
            parts.push(`- **${p.username}** (${p.userId}) - Speaking: ${speakingTime} / Total: ${duration}`);
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

        if (meeting.summary.decisions && meeting.summary.decisions.length > 0) {
            parts.push('### Decisions Made\n');
            meeting.summary.decisions.forEach((decision) => {
                parts.push(`- ${decision}`);
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
 * Format duration in seconds to human-readable
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

/**
 * Create JSON-RPC success response
 * @param {number|string} id - Request ID
 * @param {Object} result - Result data
 * @returns {Object} JSON-RPC response
 */
function createSuccessResponse(id, result) {
    return {
        jsonrpc: '2.0',
        id,
        result,
    };
}

/**
 * Create JSON-RPC error response
 * @param {number|string} id - Request ID
 * @param {number} code - Error code
 * @param {string} message - Error message
 * @param {Object} data - Additional error data
 * @returns {Object} JSON-RPC error response
 */
function createErrorResponse(id, code, message, data = null) {
    const response = {
        jsonrpc: '2.0',
        id,
        error: {
            code,
            message,
        },
    };

    if (data) {
        response.error.data = data;
    }

    return response;
}

export default {
    handleMcpRequest,
};
