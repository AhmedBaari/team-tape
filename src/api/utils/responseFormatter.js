/**
 * Response formatting utilities for consistent API responses
 */

/**
 * Format successful response with data and optional metadata
 * @param {Object} data - Response data
 * @param {Object} meta - Optional metadata (pagination, etc.)
 * @returns {Object} Formatted response
 */
export function successResponse(data, meta = null) {
    const response = {
        success: true,
        data,
    };

    if (meta) {
        response.meta = meta;
    }

    return response;
}

/**
 * Format meeting data for API response
 * @param {Object} meeting - MongoDB meeting document
 * @returns {Object} Formatted meeting data
 */
export function formatMeeting(meeting) {
    return {
        id: meeting.meetingId,
        title: generateMeetingTitle(meeting),
        startTime: meeting.startTimestamp,
        endTime: meeting.endTimestamp,
        duration: meeting.duration,
        status: meeting.recordingStatus,
        channel: {
            id: meeting.channelId,
            name: meeting.channelName,
        },
        guild: {
            id: meeting.guildId,
            name: meeting.guildName,
        },
        participantCount: meeting.totalParticipants || meeting.participants.length,
        hasTranscript: !!meeting.transcript,
        hasSummary: !!meeting.summary,
        hasAudio: !!meeting.audioFilePath,
    };
}

/**
 * Format meeting list for API response
 * @param {Array} meetings - Array of meeting documents
 * @returns {Array} Formatted meeting list
 */
export function formatMeetingList(meetings) {
    return meetings.map(formatMeeting);
}

/**
 * Format meeting details including full data
 * @param {Object} meeting - MongoDB meeting document
 * @returns {Object} Detailed meeting data
 */
export function formatMeetingDetails(meeting) {
    return {
        ...formatMeeting(meeting),
        participants: meeting.participants.map((p) => ({
            userId: p.userId,
            username: p.username,
            joinedAt: p.joinedAt,
            leftAt: p.leftAt,
            duration: p.duration,
            speakingTime: p.speakingTime,
            wasDeafened: p.wasDeafened,
        })),
        summary: meeting.summary
            ? {
                executiveSummary: meeting.summary.executiveSummary,
                keyPoints: meeting.summary.keyPoints,
                actionItems: meeting.summary.actionItems,
                innovations: meeting.summary.innovations,
                sentiment: meeting.summary.sentiment,
                generatedAt: meeting.summary.generatedAt,
                model: meeting.summary.model,
            }
            : null,
        errors: meeting.processingErrors || [],
        metadata: meeting.metadata || {},
    };
}

/**
 * Generate a human-readable meeting title
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
