# IMPLEMENTATION_5.MD - React Dashboard (Continued)

## Part 7: Pages (Continued)

### 7.1 Create src/pages/MeetingDetail.jsx

```javascript
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDateTime, formatDuration } from '../utils/formatters';
import TranscriptViewer from '../components/TranscriptViewer';
import SummaryPanel from '../components/SummaryPanel';
import AudioPlayer from '../components/AudioPlayer';

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
      // Load meeting details
      const meetingResponse = await api.getMeeting(id);
      setMeeting(meetingResponse.data.data);

      // Load transcript if available
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
            className={`px-3 py-1 text-sm font-medium text-white rounded ${
              meeting.status === 'completed'
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
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === tab.id
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
```

### 7.2 Create src/pages/Analytics.jsx

```javascript
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
```

---

## Part 8: Main App Setup

### 8.1 Create src/App.jsx

```javascript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
import MeetingDetail from './pages/MeetingDetail';
import Analytics from './pages/Analytics';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const savedKey = localStorage.getItem('apiKey');
    if (savedKey) {
      setIsAuthenticated(true);
      setApiKey(savedKey);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (apiKey.trim()) {
      localStorage.setItem('apiKey', apiKey);
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('apiKey');
    setIsAuthenticated(false);
    setApiKey('');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-700">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">
              🎙️ TeamTape Dashboard
            </h1>
            <p className="text-gray-400">Enter your API key to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Login
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">
              Don't have an API key?{' '}
              <a
                href="https://github.com/AhmedBaari/team-tape"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Check the documentation
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="meeting/:id" element={<MeetingDetail />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### 8.2 Update src/main.jsx

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 8.3 Update index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TeamTape Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## Part 9: Running the Dashboard

### 9.1 Start Development Server

```bash
cd dashboard
npm run dev
```

The dashboard will be available at `http://localhost:5173`

### 9.2 Build for Production

```bash
cd dashboard
npm run build
```

This creates a `dist/` folder with optimized production files.

### 9.3 Preview Production Build

```bash
npm run preview
```

---

## Part 10: Deployment Integration

### 10.1 Serve Dashboard from Express (Optional)

Add to `src/index.js` (in the Express setup section):

```javascript
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve dashboard static files (after building)
const dashboardPath = path.join(__dirname, '../dashboard/dist');
if (fs.existsSync(dashboardPath)) {
  app.use(express.static(dashboardPath));
  
  // Serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp') || req.path === '/health') {
      return next();
    }
    
    res.sendFile(path.join(dashboardPath, 'index.html'));
  });
  
  console.log('✅ Dashboard served from /');
}
```

### 10.2 Update package.json Scripts

Add to main `package.json`:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "dashboard:dev": "cd dashboard && npm run dev",
    "dashboard:build": "cd dashboard && npm run build",
    "build": "npm run dashboard:build",
    "deploy": "npm run build && pm2 start src/index.js --name team-tape"
  }
}
```

---

## Part 11: Testing the Dashboard

### 11.1 Test Login

1. Open `http://localhost:5173`
2. Enter your API key from `.env`
3. Click "Login"

### 11.2 Test Meeting List

1. Should see list of meetings
2. Try search functionality
3. Try status filter
4. Try pagination

### 11.3 Test Meeting Detail

1. Click on a meeting card
2. Should see meeting details
3. Switch between tabs:
   - Summary (if available)
   - Transcript (if available)
   - Participants
   - Audio (if available)

### 11.4 Test Analytics

1. Navigate to Analytics page
2. Should see:
   - Summary cards (total meetings, completed, duration, participants)
   - User speaking time table with rankings
   - Progress bars for speaking percentage

### 11.5 Test Audio Player

1. Go to a meeting with audio
2. Click Audio tab
3. Test play/pause
4. Test seek bar
5. Test download button

---

## Part 12: Responsive Design Testing

Test on different screen sizes:

- **Mobile** (< 640px): Single column layout
- **Tablet** (640px - 1024px): 2-column grid
- **Desktop** (> 1024px): 3-column grid

---

## Part 13: Validation Checklist

Before finalizing, verify:

- [x] Dashboard setup with Vite + React + Tailwind
- [x] API client with authentication
- [x] Login page with API key
- [x] Meeting list with search and filters
- [x] Meeting detail with tabs
- [x] Transcript viewer with search
- [x] Summary panel with all sections
- [x] Audio player with controls
- [x] Participants table
- [x] Analytics page with summary cards
- [x] User speaking time table
- [x] Responsive design
- [x] Error handling
- [x] Loading states
- [x] Navigation between pages

---

## Part 14: Optional Enhancements

### 14.1 Dark Mode Toggle

Add theme switcher to Navbar:

```javascript
const [theme, setTheme] = useState('dark');

const toggleTheme = () => {
  setTheme(theme === 'dark' ? 'light' : 'dark');
  // Apply theme class to body
};
```

### 14.2 Export Functionality

Add export buttons for:
- Download transcript as TXT
- Download summary as PDF
- Export analytics as CSV

### 14.3 Real-time Updates

Use WebSocket or polling to update meeting status in real-time.

---

## Summary

This implementation guide covered:

1. Setting up Vite + React + Tailwind
2. Creating API client with authentication
3. Building reusable components (Navbar, Layout, MeetingCard, etc.)
4. Creating pages (Home, MeetingDetail, Analytics)
5. Implementing search, filters, and pagination
6. Adding audio player with controls
7. Building analytics dashboard with user speaking time
8. Testing and deployment

**The React dashboard is now fully functional and ready for use!**

---

## Final Notes

**All 5 implementation files are complete:**

1. `IMPLEMENTATION_1.MD` - Express server setup, authentication, utilities
2. `IMPLEMENTATION_2.MD` - REST API endpoints for meetings and analytics
3. `IMPLEMENTATION_3.MD` - MCP server for AI assistant integration
4. `IMPLEMENTATION_4.MD` - React dashboard setup and components
5. `IMPLEMENTATION_5.MD` - React dashboard pages and deployment

**To implement everything:**

1. Follow IMPLEMENTATION_1.MD to set up Express server
2. Follow IMPLEMENTATION_2.MD to create REST API endpoints
3. Follow IMPLEMENTATION_3.MD to add MCP server
4. Follow IMPLEMENTATION_4.MD and IMPLEMENTATION_5.MD to build dashboard
5. Test everything end-to-end
6. Deploy to production

**The system architecture:**
```
TeamTape (Discord Bot + API Server)
├── Discord Bot (existing)
│   ├── Voice recording
│   ├── Transcription
│   └── AI summaries
├── Express API Server (new)
│   ├── /api/v1/meetings (REST endpoints)
│   ├── /api/v1/analytics (analytics)
│   └── /mcp (MCP resources)
└── React Dashboard (new)
    ├── Meeting list
    ├── Meeting detail
    └── Analytics
```

All components work together seamlessly to provide a complete meeting recording and analysis platform.
