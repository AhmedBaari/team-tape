import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import TranscriptViewer from '../components/TranscriptViewer';
import SummaryPanel from '../components/SummaryPanel';
import AudioPlayer from '../components/AudioPlayer';
import { formatDateTime, formatDuration } from '../utils/formatters';

export default function MeetingDetail() {
    const { id } = useParams();
    const [meeting, setMeeting] = useState(null);
    const [transcript, setTranscript] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('summary');

    useEffect(() => {
        loadMeetingData();
    }, [id]);

    const loadMeetingData = async () => {
        setLoading(true);
        setError(null);

        try {
            const meetingResponse = await api.getMeeting(id);
            setMeeting(meetingResponse.data.data);

            if (meetingResponse.data.data.hasTranscript) {
                try {
                    const transcriptResponse = await api.getTranscript(id);
                    setTranscript(transcriptResponse.data.data.transcript);
                } catch (err) {
                    console.error('Failed to load transcript:', err);
                }
            }

            // Load participants
            try {
                const participantsResponse = await api.getParticipants(id);
                setParticipants(participantsResponse.data.data.participants);
            } catch (err) {
                console.error('Failed to load participants:', err);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load meeting');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-gray-400">Loading meeting...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-4">
                <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                    <p className="text-red-400">{error}</p>
                </div>
                <Link
                    to="/"
                    className="inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
                >
                    ← Back to Meetings
                </Link>
            </div>
        );
    }

    if (!meeting) return null;

    const tabs = [
        { id: 'summary', label: '📋 Summary', show: meeting.hasSummary },
        { id: 'transcript', label: '📝 Transcript', show: meeting.hasTranscript },
        { id: 'participants', label: '👥 Participants', show: participants.length > 0 },
        { id: 'audio', label: '🎧 Audio', show: meeting.hasAudio },
    ].filter((tab) => tab.show);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Link
                    to="/"
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                    ← Back to Meetings
                </Link>
            </div>

            {/* Meeting info card */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start justify-between mb-4">
                    <h1 className="text-2xl font-bold text-white">{meeting.title}</h1>
                    <span
                        className={`px-3 py-1 text-sm font-medium text-white rounded ${meeting.status === 'completed'
                                ? 'bg-green-500'
                                : meeting.status === 'processing'
                                    ? 'bg-yellow-500'
                                    : 'bg-gray-500'
                            }`}
                    >
                        {meeting.status}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p className="text-gray-400">Start Time</p>
                        <p className="text-white font-medium">{formatDateTime(meeting.startTime)}</p>
                    </div>
                    <div>
                        <p className="text-gray-400">Duration</p>
                        <p className="text-white font-medium">{formatDuration(meeting.duration)}</p>
                    </div>
                    <div>
                        <p className="text-gray-400">Participants</p>
                        <p className="text-white font-medium">{meeting.participantCount}</p>
                    </div>
                    <div>
                        <p className="text-gray-400">Channel</p>
                        <p className="text-white font-medium">{meeting.channel.name}</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-700">
                <div className="flex gap-4">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 font-medium transition-colors ${activeTab === tab.id
                                    ? 'text-blue-400 border-b-2 border-blue-400'
                                    : 'text-gray-400 hover:text-gray-300'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab content */}
            <div className="mt-6">
                {activeTab === 'summary' && <SummaryPanel summary={meeting.summary} />}

                {activeTab === 'transcript' && <TranscriptViewer transcript={transcript} />}

                {activeTab === 'participants' && (
                    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                            Username
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                            Speaking Time
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                            Total Duration
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                            Speaking %
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {participants.map((participant) => (
                                        <tr key={participant.userId} className="hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                                                {participant.username}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                                {formatDuration(participant.speakingTime)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                                {formatDuration(participant.duration)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 bg-gray-700 rounded-full h-2 max-w-[100px]">
                                                        <div
                                                            className="bg-blue-500 h-2 rounded-full"
                                                            style={{ width: `${participant.speakingPercentage}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-gray-300 text-xs">
                                                        {participant.speakingPercentage}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'audio' && meeting.hasAudio && (
                    <AudioPlayer audioUrl={api.getAudio(id)} />
                )}
            </div>
        </div>
    );
}
