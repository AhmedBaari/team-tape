export default function SummaryPanel({ summary }) {
    if (!summary) {
        return (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400">Summary not available</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {summary.executiveSummary && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-3">
                        📋 Executive Summary
                    </h3>
                    <p className="text-gray-300">{summary.executiveSummary}</p>
                </div>
            )}

            {summary.keyPoints && summary.keyPoints.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-3">💡 Key Points</h3>
                    <ul className="space-y-2">
                        {summary.keyPoints.map((point, index) => (
                            <li key={index} className="flex items-start text-gray-300">
                                <span className="text-blue-400 mr-2">•</span>
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {summary.actionItems && summary.actionItems.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-3">✅ Action Items</h3>
                    <ul className="space-y-3">
                        {summary.actionItems.map((item, index) => (
                            <li key={index} className="text-gray-300">
                                <div className="flex items-start">
                                    <span className="text-green-400 mr-2">→</span>
                                    <div>
                                        <p className="font-medium">{item.task}</p>
                                        {item.assignee && (
                                            <p className="text-sm text-gray-400 mt-1">
                                                Assignee: {item.assignee}
                                            </p>
                                        )}
                                        {item.dueDate && (
                                            <p className="text-sm text-gray-400">
                                                Due: {new Date(item.dueDate).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {summary.innovations && summary.innovations.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-3">💡 Innovations</h3>
                    <ul className="space-y-2">
                        {summary.innovations.map((innovation, index) => (
                            <li key={index} className="flex items-start text-gray-300">
                                <span className="text-purple-400 mr-2">✨</span>
                                <span>{innovation}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
