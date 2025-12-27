import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { formatDuration } from '../utils/formatters';

export default function Analytics() {
    const [summary, setSummary] = useState(null);
    const [userStats, setUserStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadAnalytics();
    }, []);

    const loadAnalytics = async () => {
        setLoading(true);
        setError(null);

        try {
            // Load analytics summary
            const summaryResponse = await api.getAnalyticsSummary();
            setSummary(summaryResponse.data.data);

            // Load user speaking time
            const userStatsResponse = await api.getUserSpeakingTime();
            setUserStats(userStatsResponse.data.data.users);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-400">Loading analytics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                <p className="text-red-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Analytics</h1>

            {/* Summary cards */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm">Total Meetings</p>
                                <p className="text-3xl font-bold text-white mt-2">
                                    {summary.totalMeetings}
                                </p>
                            </div>
                            <div className="text-4xl">📊</div>
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm">Completed</p>
                                <p className="text-3xl font-bold text-green-400 mt-2">
                                    {summary.completedMeetings}
                                </p>
                            </div>
                            <div className="text-4xl">✅</div>
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm">Total Duration</p>
                                <p className="text-2xl font-bold text-white mt-2">
                                    {summary.totalDurationFormatted}
                                </p>
                            </div>
                            <div className="text-4xl">⏱️</div>
                        </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-400 text-sm">Unique Participants</p>
                                <p className="text-3xl font-bold text-blue-400 mt-2">
                                    {summary.uniqueParticipants}
                                </p>
                            </div>
                            <div className="text-4xl">👥</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Additional stats */}
            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <p className="text-gray-400 text-sm">Average Meeting Duration</p>
                        <p className="text-2xl font-bold text-white mt-2">
                            {summary.averageDurationFormatted}
                        </p>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <p className="text-gray-400 text-sm">Meetings (Last 30 Days)</p>
                        <p className="text-2xl font-bold text-white mt-2">
                            {summary.meetingsLast30Days}
                        </p>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <p className="text-gray-400 text-sm">Avg Meetings/Day</p>
                        <p className="text-2xl font-bold text-white mt-2">
                            {summary.averageMeetingsPerDay}
                        </p>
                    </div>
                </div>
            )}

            {/* User speaking time table */}
            <div className="bg-gray-800 rounded-lg border border-gray-700">
                <div className="px-6 py-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">
                        User Speaking Time (All Meetings)
                    </h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Rank
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Username
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Total Speaking Time
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Total Attendance
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Meetings
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Avg Speaking Time
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Speaking %
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {userStats.map((user, index) => (
                                <tr key={user.userId} className="hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        <div className="flex items-center gap-2">
                                            {index === 0 && <span className="text-xl">🥇</span>}
                                            {index === 1 && <span className="text-xl">🥈</span>}
                                            {index === 2 && <span className="text-xl">🥉</span>}
                                            <span>{index + 1}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                        {user.username}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        {user.totalSpeakingTimeFormatted}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        {user.totalDurationFormatted}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        {user.meetingCount}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                        {user.averageSpeakingTimeFormatted}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-700 rounded-full h-2 max-w-[120px]">
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full"
                                                    style={{ width: `${Math.min(user.speakingPercentage, 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-gray-300 text-xs min-w-[45px]">
                                                {user.speakingPercentage}%
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {userStats.length === 0 && (
                    <div className="px-6 py-8 text-center text-gray-400">
                        No user statistics available
                    </div>
                )}
            </div>
        </div>
    );
}
