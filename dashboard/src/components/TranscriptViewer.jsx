import { useState } from 'react';

export default function TranscriptViewer({ transcript }) {
    const [searchTerm, setSearchTerm] = useState('');

    if (!transcript) {
        return (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400">Transcript not available</p>
            </div>
        );
    }

    const highlightText = (text) => {
        if (!searchTerm) return text;

        const regex = new RegExp(`(${searchTerm})`, 'gi');
        return text.split(regex).map((part, i) =>
            regex.test(part) ? (
                <mark key={i} className="bg-yellow-500 text-black">
                    {part}
                </mark>
            ) : (
                part
            )
        );
    };

    return (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700">
                <input
                    type="text"
                    placeholder="Search transcript..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <div className="p-6 max-h-[600px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-gray-300 text-sm font-mono">
                    {highlightText(transcript)}
                </pre>
            </div>
        </div>
    );
}
