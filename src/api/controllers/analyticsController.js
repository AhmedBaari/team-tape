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
