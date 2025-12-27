import { Link } from 'react-router-dom';
import { formatDateTime, formatDuration } from '../utils/formatters';

export default function MeetingCard({ meeting }) {
    const statusColors = {
        completed: 'bg-green-500',
        processing: 'bg-yellow-500',
        recording: 'bg-blue-500',
        failed: 'bg-red-500',
    };

    return (
        <Link
            to={`/meeting/${meeting.id}`}
            className="block bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-700 hover:border-gray-600"
        >
            <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">{meeting.title}</h3>
                <span
                    className={`px-2 py-1 text-xs font-medium text-white rounded ${statusColors[meeting.status] || 'bg-gray-500'
                        }`}
                >
                    {meeting.status}
                </span>
            </div>

            <div className="space-y-2 text-sm text-gray-400">
                <p>
                    <span className="font-medium">📅</span> {formatDateTime(meeting.startTime)}
                </p>
                <p>
                    <span className="font-medium">⏱️</span> {formatDuration(meeting.duration)}
                </p>
                <p>
                    <span className="font-medium">👥</span> {meeting.participantCount} participant
                    {meeting.participantCount !== 1 ? 's' : ''}
                </p>
                {meeting.channel && (
                    <p>
                        <span className="font-medium">📢</span> {meeting.channel.name}
                    </p>
                )}
            </div>

            <div className="mt-4 flex gap-2">
                {meeting.hasTranscript && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                        Transcript
                    </span>
                )}
                {meeting.hasSummary && (
                    <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">
                        Summary
                    </span>
                )}
                {meeting.hasAudio && (
                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                        Audio
                    </span>
                )}
            </div>
        </Link>
    );
}
