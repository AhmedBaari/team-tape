# TeamTape API & Dashboard - Implementation Guide

## 📋 Overview

This guide provides a complete roadmap for implementing REST API endpoints, MCP server integration, and a React dashboard for the TeamTape Discord bot. The implementation is divided into 5 detailed documents, each focusing on a specific component.

---

## 🎯 Goals

1. **REST API**: Expose meeting data via HTTP endpoints for programmatic access
2. **MCP Server**: Enable AI assistant integration (Claude Desktop, etc.)
3. **React Dashboard**: Provide a web interface for viewing meetings, transcripts, and analytics

---

## 📚 Implementation Documents

### IMPLEMENTATION_1.MD - Project Setup & Express Integration
**Focus**: Foundation setup for API server

**Key Topics**:
- Install dependencies (Express, CORS, MCP SDK)
- Create directory structure (`src/api/routes`, `src/api/middleware`, `src/api/controllers`)
- Environment configuration for API and MCP
- Authentication middleware with API key validation
- Utility functions (pagination, error handling, response formatting)
- Integrate Express server into existing Discord bot
- Health check endpoint

**Outcome**: Express server running alongside Discord bot with authentication

---

### IMPLEMENTATION_2.MD - REST API Endpoints
**Focus**: Complete REST API for meetings and analytics

**Endpoints Implemented**:
- `GET /api/v1/meetings` - List meetings with pagination, search, filtering
- `GET /api/v1/meetings/:id` - Get meeting details
- `GET /api/v1/meetings/:id/transcript` - Get transcript (JSON or plain text)
- `GET /api/v1/meetings/:id/summary` - Get AI-generated summary
- `GET /api/v1/meetings/:id/audio` - Stream/download audio file
- `GET /api/v1/meetings/:id/participants` - Get participant details
- `GET /api/v1/analytics/user-speaking-time` - Total speaking time per user
- `GET /api/v1/analytics/summary` - Overall analytics (meetings, duration, participants)

**Features**:
- Pagination with customizable page size
- Search by channel name or summary
- Filter by status (completed, processing, recording, failed)
- Audio streaming with range support
- Individual user audio tracks
- Human-readable duration formatting

**Outcome**: Full REST API with 8 endpoints for meeting data access

---

### IMPLEMENTATION_3.MD - MCP Server Integration
**Focus**: MCP server for AI assistant integration

**MCP Resources**:
- `meetings://list` - List all meetings with summaries, keypoints, participants
- `meetings://meeting/{id}` - Full transcript with metadata in Markdown format

**Features**:
- HTTP-based MCP server on `/mcp` path
- Markdown-formatted meeting content for AI consumption
- Claude Desktop integration configuration
- Resource discovery endpoint

**Use Cases**:
- Ask AI assistant about recent meetings
- Query specific meeting transcripts
- Extract action items across meetings
- Search meeting content with natural language

**Outcome**: MCP server ready for Claude Desktop and other AI tools

---

### IMPLEMENTATION_4.MD - React Dashboard (Part 1)
**Focus**: Dashboard foundation and components

**Setup**:
- Vite + React + TailwindCSS
- Axios for API calls
- React Router for navigation
- Responsive design with dark theme

**Components**:
- `Navbar` - Navigation with active states
- `Layout` - Page wrapper with header
- `MeetingCard` - Meeting list card with status badge
- `TranscriptViewer` - Searchable transcript display
- `SummaryPanel` - AI summary with key points and action items
- `AudioPlayer` - Custom audio player with controls

**Utilities**:
- Date/time formatters
- Duration formatters
- Relative time (e.g., "2 hours ago")

**Outcome**: Reusable components and utilities for dashboard

---

### IMPLEMENTATION_5.MD - React Dashboard (Part 2)
**Focus**: Dashboard pages and deployment

**Pages**:
1. **Home** - Meeting list with search, filters, pagination
2. **MeetingDetail** - Full meeting view with tabs:
   - Summary (executive summary, key points, action items)
   - Transcript (searchable, syntax-highlighted)
   - Participants (table with speaking time percentage)
   - Audio (player with download)
3. **Analytics** - Statistics dashboard:
   - Total meetings, duration, participants
   - User speaking time rankings (with medals 🥇🥈🥉)
   - Average meeting metrics

**Features**:
- Login page with API key authentication
- Responsive grid layouts (1/2/3 columns)
- Tab navigation for meeting details
- Progress bars for speaking percentage
- Loading states and error handling
- Audio streaming with seek controls

**Deployment**:
- Production build configuration
- Optional: Serve dashboard from Express server
- PM2 deployment script

**Outcome**: Complete, production-ready React dashboard

---

## 🚀 Quick Start Guide

### Prerequisites

- Node.js 22.x or higher
- MongoDB 5.0+ (running)
- Discord bot already configured (from main repo)
- NPM or Yarn package manager

### Installation Steps

#### 1. Install Dependencies

```bash
# In project root
npm install express cors @modelcontextprotocol/sdk
```

#### 2. Configure Environment

Add to `.env`:

```bash
# API Configuration
API_PORT=3000
API_KEY=your_secure_api_key_here
CORS_ORIGIN=http://localhost:5173
API_BASE_PATH=/api/v1

# MCP Configuration
MCP_BASE_PATH=/mcp
ENABLE_MCP=true
```

Generate secure API key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 3. Create Directory Structure

```bash
mkdir -p src/api/routes src/api/middleware src/api/controllers src/api/utils
```

#### 4. Follow Implementation Docs

1. **IMPLEMENTATION_1.MD**: Set up Express server and authentication
2. **IMPLEMENTATION_2.MD**: Create REST API endpoints
3. **IMPLEMENTATION_3.MD**: Add MCP server
4. **IMPLEMENTATION_4.MD**: Build React dashboard components
5. **IMPLEMENTATION_5.MD**: Create dashboard pages

#### 5. Test the Setup

```bash
# Start Discord bot + API server
npm run dev

# In another terminal, start dashboard
cd dashboard
npm install
npm run dev
```

Access:
- **API**: http://localhost:3000/api/v1
- **MCP**: http://localhost:3000/mcp
- **Dashboard**: http://localhost:5173

---

## 📖 API Documentation

### Authentication

All API and MCP endpoints require authentication via API key:

```bash
Authorization: Bearer YOUR_API_KEY
```

### REST API Endpoints

#### List Meetings
```http
GET /api/v1/meetings?page=1&limit=20&status=completed&search=general
```

#### Get Meeting Details
```http
GET /api/v1/meetings/{meetingId}
```

#### Get Transcript
```http
GET /api/v1/meetings/{meetingId}/transcript?format=text
```

#### Get Summary
```http
GET /api/v1/meetings/{meetingId}/summary
```

#### Download Audio
```http
GET /api/v1/meetings/{meetingId}/audio?userId=optional
```

#### Get Participants
```http
GET /api/v1/meetings/{meetingId}/participants
```

#### Analytics - User Speaking Time
```http
GET /api/v1/analytics/user-speaking-time?limit=10
```

#### Analytics - Summary
```http
GET /api/v1/analytics/summary
```

### MCP Resources

#### List Resources
```http
GET /mcp/resources
```

#### meetings://list
```http
GET /mcp/resources/meetings/list?status=completed&limit=50
```

#### meetings://meeting/{id}
```http
GET /mcp/resources/meetings/{meetingId}
```

---

## 🏗️ Architecture

```
TeamTape System
│
├── Discord Bot (Existing)
│   ├── Voice Recording
│   ├── Transcription (Whisper)
│   ├── AI Summaries (Perplexity)
│   └── MongoDB Storage
│
├── Express API Server (New)
│   ├── Authentication Middleware
│   ├── REST API Routes (/api/v1)
│   │   ├── Meetings CRUD
│   │   └── Analytics
│   ├── MCP Server Routes (/mcp)
│   │   ├── Resource Discovery
│   │   └── Meeting Resources
│   └── Error Handling
│
└── React Dashboard (New)
    ├── Authentication (API Key)
    ├── Meeting List (Search, Filter, Paginate)
    ├── Meeting Detail (Tabs for Summary, Transcript, Audio)
    └── Analytics (User Speaking Time, Statistics)
```

---

## 🧪 Testing Guide

### 1. Test API Endpoints

```bash
# Health check (no auth)
curl http://localhost:3000/health

# List meetings
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/v1/meetings

# Get meeting details
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/v1/meetings/MEETING_ID
```

### 2. Test MCP Resources

```bash
# List resources
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/mcp/resources

# Get meetings list
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/mcp/resources/meetings/list
```

### 3. Test Dashboard

1. Open http://localhost:5173
2. Enter API key
3. Navigate through pages:
   - Meetings list
   - Meeting details
   - Analytics

### 4. Test Audio Streaming

```bash
# Download audio
curl -H "Authorization: Bearer YOUR_API_KEY" \
  -o meeting.mp3 \
  http://localhost:3000/api/v1/meetings/MEETING_ID/audio
```

---

## 🔧 Troubleshooting

### API Server Won't Start

**Issue**: Port already in use

**Solution**: Change `API_PORT` in `.env` or kill process:

```bash
lsof -ti:3000 | xargs kill -9
```

### Authentication Fails

**Issue**: Invalid API key

**Solution**: Verify API key in `.env` matches the one used in requests

### Dashboard Shows "Failed to Load"

**Issue**: CORS or API connection issue

**Solution**: Check `CORS_ORIGIN` in `.env` and ensure API server is running

### No Meetings Displayed

**Issue**: No data in MongoDB

**Solution**: Record a test meeting using Discord bot first

### Audio Player Doesn't Work

**Issue**: Audio file not found

**Solution**: Ensure `RECORDINGS_PATH` exists and contains audio files

---

## 📦 Deployment

### Production Build

```bash
# Build dashboard
cd dashboard
npm run build

# This creates dashboard/dist with optimized files
```

### Deploy with PM2

```bash
# Build dashboard first
npm run build

# Start with PM2
pm2 start src/index.js --name team-tape

# View logs
pm2 logs team-tape
```

### Serve Dashboard from Express

Add to `src/index.js`:

```javascript
import path from 'path';

const dashboardPath = path.join(__dirname, '../dashboard/dist');
app.use(express.static(dashboardPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) {
    return next();
  }
  res.sendFile(path.join(dashboardPath, 'index.html'));
});
```

### Environment Variables for Production

```bash
# Production .env
NODE_ENV=production
API_PORT=3000
API_KEY=<strong-random-key>
CORS_ORIGIN=https://your-domain.com
MONGODB_URI=mongodb://prod-server/teamtape
```

---

## 🎨 Customization

### Change Theme Colors

Edit `dashboard/tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: '#3b82f6',  // Blue
      secondary: '#8b5cf6', // Purple
    },
  },
},
```

### Add Custom Analytics

Add new endpoint in `src/api/controllers/analyticsController.js`:

```javascript
export const getCustomMetric = asyncHandler(async (req, res) => {
  // Your custom analytics logic
  res.json(successResponse(data));
});
```

### Modify Dashboard Layout

Edit `dashboard/src/components/Layout.jsx` to change header, footer, or navigation.

---

## 📊 Feature Matrix

| Feature | Status | Implementation |
|---------|--------|----------------|
| REST API - Meetings List | ✅ | IMPLEMENTATION_2.MD |
| REST API - Meeting Details | ✅ | IMPLEMENTATION_2.MD |
| REST API - Transcripts | ✅ | IMPLEMENTATION_2.MD |
| REST API - Summaries | ✅ | IMPLEMENTATION_2.MD |
| REST API - Audio Streaming | ✅ | IMPLEMENTATION_2.MD |
| REST API - Analytics | ✅ | IMPLEMENTATION_2.MD |
| MCP - Resource Discovery | ✅ | IMPLEMENTATION_3.MD |
| MCP - Meetings List | ✅ | IMPLEMENTATION_3.MD |
| MCP - Meeting Detail | ✅ | IMPLEMENTATION_3.MD |
| Dashboard - Login | ✅ | IMPLEMENTATION_5.MD |
| Dashboard - Meeting List | ✅ | IMPLEMENTATION_4-5.MD |
| Dashboard - Meeting Detail | ✅ | IMPLEMENTATION_4-5.MD |
| Dashboard - Analytics | ✅ | IMPLEMENTATION_5.MD |
| Dashboard - Audio Player | ✅ | IMPLEMENTATION_4.MD |
| Dashboard - Search | ✅ | IMPLEMENTATION_5.MD |
| Dashboard - Filters | ✅ | IMPLEMENTATION_5.MD |
| Dashboard - Pagination | ✅ | IMPLEMENTATION_5.MD |

---

## 🔐 Security Considerations

1. **API Key**: Use strong, random API keys (32+ characters)
2. **HTTPS**: Enable HTTPS in production with reverse proxy (Nginx)
3. **CORS**: Restrict `CORS_ORIGIN` to your dashboard domain
4. **Input Validation**: All endpoints validate input (already implemented)
5. **Rate Limiting**: Consider adding rate limiting for production
6. **File Access**: Audio streaming validates file paths to prevent directory traversal

---

## 🚀 Performance Tips

1. **Pagination**: Use small page sizes (20-50 items) for faster load times
2. **Caching**: Add Redis cache for frequently accessed meetings
3. **Compression**: Enable gzip compression in Express
4. **Database Indexes**: Already created in `Meeting` model
5. **Audio Streaming**: Uses Node.js streams for efficient file delivery

---

## 📝 Next Steps

After implementing the basic features:

1. **Add WebSocket support** for real-time meeting updates
2. **Export functionality** for transcripts and summaries (PDF, CSV)
3. **User management** with Discord OAuth2
4. **Search improvements** with full-text search (MongoDB Atlas Search)
5. **Meeting comparison** view
6. **Custom report generation**
7. **Calendar integration** for scheduling

---

## 🤝 Contributing

When adding new features:

1. Follow existing code structure in `src/api/`
2. Add documentation to appropriate IMPLEMENTATION_*.MD file
3. Include tests for new endpoints
4. Update this README with new features

---

## 📞 Support

- **Issues**: https://github.com/AhmedBaari/team-tape/issues
- **Documentation**: See IMPLEMENTATION_1-5.MD files
- **Discord**: (Add your Discord server link)

---

## 📄 License

MIT License - See LICENSE file for details

---

## ✅ Checklist for Implementation

### Backend (API Server)
- [ ] Follow IMPLEMENTATION_1.MD for Express setup
- [ ] Follow IMPLEMENTATION_2.MD for REST API
- [ ] Follow IMPLEMENTATION_3.MD for MCP server
- [ ] Test all endpoints with curl/Postman
- [ ] Verify authentication works
- [ ] Check error handling

### Frontend (Dashboard)
- [ ] Follow IMPLEMENTATION_4.MD for setup and components
- [ ] Follow IMPLEMENTATION_5.MD for pages
- [ ] Test login flow
- [ ] Test all pages (Home, MeetingDetail, Analytics)
- [ ] Verify responsive design
- [ ] Check audio player functionality

### Deployment
- [ ] Build dashboard (`npm run build`)
- [ ] Configure production `.env`
- [ ] Test in production-like environment
- [ ] Set up PM2 or similar process manager
- [ ] Configure Nginx reverse proxy (optional)
- [ ] Enable HTTPS with Let's Encrypt

---

**Total Implementation Time Estimate**: 8-12 hours for experienced developer

**Difficulty**: Intermediate to Advanced

**Prerequisites**: Familiarity with Node.js, Express, React, MongoDB

---

## 🎉 Conclusion

This implementation adds powerful API capabilities to TeamTape while maintaining the existing Discord bot functionality. The modular structure allows for easy maintenance and future enhancements.

**Key Achievements**:
- ✅ Complete REST API for meeting data access
- ✅ MCP server for AI assistant integration
- ✅ Professional React dashboard
- ✅ Comprehensive documentation in 5 guides
- ✅ Production-ready deployment strategy

Happy coding! 🚀
