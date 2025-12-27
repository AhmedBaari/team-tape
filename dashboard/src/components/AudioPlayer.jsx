import { useState, useRef, useEffect } from 'react';

export default function AudioPlayer({ audioUrl }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => setCurrentTime(audio.currentTime);
        const updateDuration = () => setDuration(audio.duration);
        const handleEnded = () => setIsPlaying(false);

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('ended', handleEnded);
        };
    }, []);

    const togglePlayPause = () => {
        const audio = audioRef.current;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (e) => {
        const audio = audioRef.current;
        const newTime = (e.target.value / 100) * duration;
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // Add API key to audio URL
    const apiKey = localStorage.getItem('apiKey');
    const authenticatedUrl = `${audioUrl}${audioUrl.includes('?') ? '&' : '?'}auth=${apiKey}`;

    return (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">🎧 Audio Recording</h3>

            <audio ref={audioRef} src={authenticatedUrl} preload="metadata" />

            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={togglePlayPause}
                        className="w-12 h-12 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
                    >
                        {isPlaying ? (
                            <span className="text-xl">⏸️</span>
                        ) : (
                            <span className="text-xl">▶️</span>
                        )}
                    </button>

                    <div className="flex-1">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={progress}
                            onChange={handleSeek}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            style={{
                                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progress}%, #374151 ${progress}%, #374151 100%)`,
                            }}
                        />
                    </div>

                    <div className="text-sm text-gray-400 min-w-[100px] text-right">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                </div>

                <a
                    href={authenticatedUrl}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
                >
                    <span>📥</span>
                    Download Audio
                </a>
            </div>
        </div>
    );
}
