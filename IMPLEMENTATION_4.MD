# IMPLEMENTATION_4.MD - React Dashboard

## Overview
This document covers the implementation of a React-based dashboard for viewing meeting recordings, transcripts, summaries, and analytics.

---

## Part 1: Dashboard Setup

### 1.1 Create Dashboard Directory

From the project root:

```bash
mkdir dashboard
cd dashboard
```

### 1.2 Initialize Vite React Project

```bash
npm create vite@latest . -- --template react
```

When prompted:
- Current directory is not empty. Continue? **Yes**
- Select a framework: **React**
- Select a variant: **JavaScript**

### 1.3 Install Dependencies

```bash
npm install
npm install -D tailwindcss postcss autoprefixer
npm install axios react-router-dom
```

**Dependencies:**
- `tailwindcss` - CSS framework
- `axios` - HTTP client for API calls
- `react-router-dom` - Routing for multi-page app

### 1.4 Initialize Tailwind CSS

```bash
npx tailwindcss init -p
```

This creates `tailwind.config.js` and `postcss.config.js`.

### 1.5 Configure Tailwind

**Edit `tailwind.config.js`:**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Edit `src/index.css`:**

Replace entire content with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #1f2937;
}

::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}
```

---

## Part 2: Project Structure

Create the following structure in `dashboard/src/`:

```
src/
├── api/
│   └── client.js          # API client with auth
├── components/
│   ├── Layout.jsx         # Main layout wrapper
│   ├── MeetingCard.jsx    # Meeting list card
│   ├── MeetingList.jsx    # Meeting list component
│   ├── TranscriptViewer.jsx  # Transcript display
│   ├── SummaryPanel.jsx   # Summary display
│   ├── AudioPlayer.jsx    # Audio player
│   └── Navbar.jsx         # Navigation bar
├── pages/
│   ├── Home.jsx           # Meeting list page
│   ├── MeetingDetail.jsx  # Meeting detail page
│   └── Analytics.jsx      # Analytics page
├── utils/
│   └── formatters.js      # Date/duration formatters
├── App.jsx                # Main app component
├── main.jsx               # Entry point
└── index.css              # Tailwind imports
```

Create directories:

```bash
cd src
mkdir api components pages utils
```

---

## Part 3: API Client

### 3.1 Create src/api/client.js

```javascript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) {
      config.headers.Authorization = `Bearer ${apiKey}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// API methods
export const api = {
  // Meetings
  getMeetings: (params) => apiClient.get('/meetings', { params }),
  getMeeting: (id) => apiClient.get(`/meetings/${id}`),
  getTranscript: (id) => apiClient.get(`/meetings/${id}/transcript`),
  getSummary: (id) => apiClient.get(`/meetings/${id}/summary`),
  getAudio: (id) => `${API_BASE_URL}/meetings/${id}/audio`,
  getParticipants: (id) => apiClient.get(`/meetings/${id}/participants`),

  // Analytics
  getUserSpeakingTime: (params) => apiClient.get('/analytics/user-speaking-time', { params }),
  getAnalyticsSummary: (params) => apiClient.get('/analytics/summary', { params }),
};

export default apiClient;
```

### 3.2 Create .env.local

In `dashboard/` directory, create `.env.local`:

```bash
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

---

## Part 4: Utility Functions

### 4.1 Create src/utils/formatters.js

```javascript
/**
 * Format date to readable string
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
export function formatDate(date) {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time to readable string
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted time
 */
export function formatTime(date) {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date and time
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date and time
 */
export function formatDateTime(date) {
  if (!date) return 'N/A';
  
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Format duration in seconds to human-readable
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export function formatDuration(seconds) {
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
 * Format relative time (e.g., "2 hours ago")
 * @param {string|Date} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return formatDate(date);
}
```

---

## Part 5: Components

### 5.1 Create src/components/Navbar.jsx

```javascript
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path
      ? 'bg-gray-700 text-white'
      : 'text-gray-300 hover:bg-gray-700 hover:text-white';
  };

  return (
    <nav className="bg-gray-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <span className="text-2xl mr-2">🎙️</span>
              <span className="text-white text-xl font-bold">TeamTape</span>
            </Link>
            
            <div className="ml-10 flex items-baseline space-x-4">
              <Link
                to="/"
                className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('/')}`}
              >
                Meetings
              </Link>
              <Link
                to="/analytics"
                className={`px-3 py-2 rounded-md text-sm font-medium ${isActive('/analytics')}`}
              >
                Analytics
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
```

### 5.2 Create src/components/Layout.jsx

```javascript
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-900">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
```

### 5.3 Create src/components/MeetingCard.jsx

```javascript
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
          className={`px-2 py-1 text-xs font-medium text-white rounded ${
            statusColors[meeting.status] || 'bg-gray-500'
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
```

### 5.4 Create src/components/TranscriptViewer.jsx

```javascript
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
```

### 5.5 Create src/components/SummaryPanel.jsx

```javascript
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
```

### 5.6 Create src/components/AudioPlayer.jsx

```javascript
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
```

---

## Part 6: Pages

### 6.1 Create src/pages/Home.jsx

```javascript
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import MeetingCard from '../components/MeetingCard';

export default function Home() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadMeetings();
  }, [page, statusFilter]);

  const loadMeetings = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;

      const response = await api.getMeetings(params);
      setMeetings(response.data.data);
      setTotalPages(response.data.meta.totalPages);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadMeetings();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Meetings</h1>
      </div>

      {/* Search and filters */}
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <form onSubmit={handleSearch} className="flex gap-4">
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="recording">Recording</option>
            <option value="failed">Failed</option>
          </select>
          
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-400">Loading meetings...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Meetings grid */}
      {!loading && !error && (
        <>
          {meetings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No meetings found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {meetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
              >
                Previous
              </button>
              
              <span className="text-gray-400">
                Page {page} of {totalPages}
              </span>
              
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

---

*Due to length constraints, I'll continue IMPLEMENTATION_4.MD in the next part...*

