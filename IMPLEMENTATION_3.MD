# IMPLEMENTATION_3.MD - MCP Server Integration

## Overview
This document covers the implementation of MCP (Model Context Protocol) server endpoints for integration with AI tools like Claude Desktop.

---

## Part 1: Understanding MCP

### 1.1 What is MCP?

The Model Context Protocol (MCP) is a standard for exposing contextual data to AI assistants. It allows AI tools to:
- Access structured data as "resources"
- Query data with specific formats
- Integrate seamlessly with Claude Desktop and other AI clients

### 1.2 MCP Resources for TeamTape

We'll implement two main resources:

1. **`meetings://list`** - List all meetings with summaries, keypoints, and participants
2. **`meetings://meeting/{id}`** - Get full transcript and metadata for a specific meeting

---

## Part 2: Install MCP SDK

The MCP SDK is already installed from IMPLEMENTATION_1.MD. If not:

```bash
npm install @modelcontextprotocol/sdk
```

---

## Part 3: Create MCP Controller

### 3.1 Create src/api/controllers/mcpController.js

```javascript
import Meeting from '../../models/Meeting.js';
import logger from '../../utils/logger.js';
import { asyncHandler, ApiError } from '../utils/errorHandler.js';

/**
 * MCP Resource: meetings://list
 * Returns list of all meetings with summaries, key points, and participants
 * GET /mcp/resources/meetings/list
 */
export const listMeetingsResource = asyncHandler(async (req, res) => {
  const { limit, status } = req.query;

  // Build filter
  const filter = {};
  if (status) {
    filter.recordingStatus = status;
  }

  // Get meetings, default to completed ones
  const meetings = await Meeting.find(filter)
    .sort({ startTimestamp: -1 })
    .limit(parseInt(limit) || 50);

  // Format for MCP
  const resources = meetings.map((meeting) => ({
    uri: `meetings://meeting/${meeting.meetingId}`,
    name: generateMeetingTitle(meeting),
    description: meeting.summary?.executiveSummary || 'No summary available',
    mimeType: 'application/json',
    metadata: {
      id: meeting.meetingId,
      startTime: meeting.startTimestamp,
      endTime: meeting.endTimestamp,
      duration: meeting.duration,
      status: meeting.recordingStatus,
      participants: meeting.participants.map((p) => ({
        userId: p.userId,
        username: p.username,
        speakingTime: p.speakingTime,
      })),
      keyPoints: meeting.summary?.keyPoints || [],
      actionItems: meeting.summary?.actionItems || [],
      participantCount: meeting.totalParticipants || meeting.participants.length,
    },
  }));

  res.json({
    resources,
    totalCount: resources.length,
  });
});

/**
 * MCP Resource: meetings://meeting/{id}
 * Returns full transcript and metadata for a specific meeting
 * GET /mcp/resources/meetings/:id
 */
export const getMeetingResource = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const meeting = await Meeting.findByMeetingId(id);

  if (!meeting) {
    throw new ApiError(404, 'Meeting not found', { meetingId: id });
  }

  // Format for MCP
  const resource = {
    uri: `meetings://meeting/${meeting.meetingId}`,
    name: generateMeetingTitle(meeting),
    description: meeting.summary?.executiveSummary || 'No summary available',
    mimeType: 'text/markdown',
    content: formatMeetingAsMarkdown(meeting),
    metadata: {
      id: meeting.meetingId,
      startTime: meeting.startTimestamp,
      endTime: meeting.endTimestamp,
      duration: meeting.duration,
      channel: meeting.channelName,
      guild: meeting.guildName,
      participantCount: meeting.totalParticipants || meeting.participants.length,
      status: meeting.recordingStatus,
    },
  };

  res.json(resource);
});

/**
 * MCP Endpoint: List all available resources
 * GET /mcp/resources
 */
export const listResources = asyncHandler(async (req, res) => {
  res.json({
    resources: [
      {
        uri: 'meetings://list',
        name: 'Meeting List',
        description: 'List all recorded meetings with summaries and key points',
        mimeType: 'application/json',
      },
      {
        uri: 'meetings://meeting/{id}',
        name: 'Meeting Detail',
        description: 'Get full transcript and metadata for a specific meeting',
        mimeType: 'text/markdown',
      },
    ],
  });
});

/**
 * Helper: Generate meeting title
 * @param {Object} meeting - Meeting document
 * @returns {string} Meeting title
 */
function generateMeetingTitle(meeting) {
  const date = new Date(meeting.startTimestamp);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${meeting.channelName || 'Meeting'} - ${dateStr} ${timeStr}`;
}

/**
 * Helper: Format meeting as Markdown for MCP
 * @param {Object} meeting - Meeting document
 * @returns {string} Markdown formatted meeting content
 */
function formatMeetingAsMarkdown(meeting) {
  const parts = [];

  // Title
  parts.push(`# ${generateMeetingTitle(meeting)}\n`);

  // Metadata
  parts.push('## Meeting Information\n');
  parts.push(`- **Date**: ${new Date(meeting.startTimestamp).toLocaleString()}`);
  parts.push(`- **Duration**: ${formatDuration(meeting.duration)}`);
  parts.push(`- **Channel**: ${meeting.channelName || 'Unknown'}`);
  parts.push(`- **Server**: ${meeting.guildName || 'Unknown'}`);
  parts.push(`- **Status**: ${meeting.recordingStatus}\n`);

  // Participants
  parts.push('## Participants\n');
  if (meeting.participants && meeting.participants.length > 0) {
    meeting.participants.forEach((p) => {
      const speakingTime = formatDuration(p.speakingTime);
      const duration = formatDuration(p.duration);
      parts.push(`- **${p.username}** - Speaking: ${speakingTime} / Total: ${duration}`);
    });
    parts.push('');
  } else {
    parts.push('_No participants recorded_\n');
  }

  // Summary
  if (meeting.summary) {
    parts.push('## Summary\n');
    
    if (meeting.summary.executiveSummary) {
      parts.push(meeting.summary.executiveSummary);
      parts.push('');
    }

    if (meeting.summary.keyPoints && meeting.summary.keyPoints.length > 0) {
      parts.push('### Key Points\n');
      meeting.summary.keyPoints.forEach((point) => {
        parts.push(`- ${point}`);
      });
      parts.push('');
    }

    if (meeting.summary.actionItems && meeting.summary.actionItems.length > 0) {
      parts.push('### Action Items\n');
      meeting.summary.actionItems.forEach((item) => {
        const assignee = item.assignee ? ` (${item.assignee})` : '';
        const dueDate = item.dueDate
          ? ` - Due: ${new Date(item.dueDate).toLocaleDateString()}`
          : '';
        parts.push(`- ${item.task}${assignee}${dueDate}`);
      });
      parts.push('');
    }

    if (meeting.summary.innovations && meeting.summary.innovations.length > 0) {
      parts.push('### Innovations Discussed\n');
      meeting.summary.innovations.forEach((innovation) => {
        parts.push(`- ${innovation}`);
      });
      parts.push('');
    }
  }

  // Transcript
  if (meeting.transcript) {
    parts.push('## Transcript\n');
    parts.push('```');
    parts.push(meeting.transcript);
    parts.push('```\n');
  } else {
    parts.push('## Transcript\n');
    parts.push('_Transcript not available_\n');
  }

  return parts.join('\n');
}

/**
 * Helper: Format duration in seconds to human-readable
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
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
```

---

## Part 4: Create MCP Routes

### 4.1 Create src/api/routes/mcp.js

```javascript
import express from 'express';
import {
  listResources,
  listMeetingsResource,
  getMeetingResource,
} from '../controllers/mcpController.js';

const router = express.Router();

/**
 * MCP routes
 * All routes are protected by authentication middleware from parent router
 */

// List all available MCP resources
router.get('/resources', listResources);

// meetings://list resource
router.get('/resources/meetings/list', listMeetingsResource);

// meetings://meeting/{id} resource
router.get('/resources/meetings/:id', getMeetingResource);

export default router;
```

---

## Part 5: Mount MCP Routes

### 5.1 Update src/index.js

Add MCP router to the Express setup section (after the API routes):

**Location:** In the Express setup section, after `app.use('/api/v1', apiRouter);`

**Add:**

```javascript
import mcpRouter from './api/routes/mcp.js';

// Mount MCP routes
if (process.env.ENABLE_MCP !== 'false') {
  app.use('/mcp', authenticateApiKey, mcpRouter);
  console.log('✅ MCP endpoints enabled at /mcp');
}
```

Make sure to import `authenticateApiKey`:

```javascript
import { authenticateApiKey } from './api/middleware/auth.js';
```

---

## Part 6: Testing MCP Endpoints

### 6.1 Test List Resources

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources
```

Expected response:

```json
{
  "resources": [
    {
      "uri": "meetings://list",
      "name": "Meeting List",
      "description": "List all recorded meetings with summaries and key points",
      "mimeType": "application/json"
    },
    {
      "uri": "meetings://meeting/{id}",
      "name": "Meeting Detail",
      "description": "Get full transcript and metadata for a specific meeting",
      "mimeType": "text/markdown"
    }
  ]
}
```

### 6.2 Test meetings://list Resource

```bash
# Get all meetings
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources/meetings/list

# Get only completed meetings
curl -H "Authorization: Bearer your_api_key" \
  "http://localhost:3000/mcp/resources/meetings/list?status=completed"

# Limit results
curl -H "Authorization: Bearer your_api_key" \
  "http://localhost:3000/mcp/resources/meetings/list?limit=10"
```

Expected response:

```json
{
  "resources": [
    {
      "uri": "meetings://meeting/abc123-uuid",
      "name": "General Voice - Dec 27, 2024 10:30 AM",
      "description": "Team discussed Q4 roadmap and priorities",
      "mimeType": "application/json",
      "metadata": {
        "id": "abc123-uuid",
        "startTime": "2024-12-27T10:30:00.000Z",
        "endTime": "2024-12-27T11:15:00.000Z",
        "duration": 2700,
        "status": "completed",
        "participants": [
          {
            "userId": "user_123",
            "username": "John Doe",
            "speakingTime": 450
          }
        ],
        "keyPoints": [
          "New feature prioritization for Q4",
          "Budget allocation for hiring"
        ],
        "actionItems": [
          {
            "task": "Create hiring plan",
            "assignee": "John",
            "dueDate": "2024-12-30T00:00:00.000Z"
          }
        ],
        "participantCount": 5
      }
    }
  ],
  "totalCount": 1
}
```

### 6.3 Test meetings://meeting/{id} Resource

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources/meetings/abc123-uuid
```

Expected response:

```json
{
  "uri": "meetings://meeting/abc123-uuid",
  "name": "General Voice - Dec 27, 2024 10:30 AM",
  "description": "Team discussed Q4 roadmap and priorities",
  "mimeType": "text/markdown",
  "content": "# General Voice - Dec 27, 2024 10:30 AM\n\n## Meeting Information\n\n- **Date**: 12/27/2024, 10:30:00 AM\n- **Duration**: 45m 0s\n- **Channel**: General Voice\n- **Server**: My Server\n- **Status**: completed\n\n## Participants\n\n- **John Doe** - Speaking: 7m 30s / Total: 45m 0s\n- **Jane Smith** - Speaking: 5m 0s / Total: 45m 0s\n\n## Summary\n\nTeam discussed Q4 roadmap and priorities...\n\n### Key Points\n\n- New feature prioritization for Q4\n- Budget allocation for hiring\n\n### Action Items\n\n- Create hiring plan (John) - Due: 12/30/2024\n\n## Transcript\n\n```\n[10:30:15] John Doe: Good morning everyone...\n[10:31:20] Jane Smith: Thanks for joining...\n```\n",
  "metadata": {
    "id": "abc123-uuid",
    "startTime": "2024-12-27T10:30:00.000Z",
    "endTime": "2024-12-27T11:15:00.000Z",
    "duration": 2700,
    "channel": "General Voice",
    "guild": "My Server",
    "participantCount": 5,
    "status": "completed"
  }
}
```

---

## Part 7: Claude Desktop Integration

### 7.1 Create MCP Configuration File

Create a configuration file for Claude Desktop to connect to your MCP server:

**File:** `claude_desktop_config.json` (in project root for documentation)

```json
{
  "mcpServers": {
    "teamtape": {
      "command": "node",
      "args": ["/path/to/team-tape/src/index.js"],
      "env": {
        "NODE_ENV": "production",
        "API_KEY": "your_api_key_here"
      }
    }
  }
}
```

**Alternative: HTTP-based MCP configuration**

For remote MCP access via HTTP:

```json
{
  "mcpServers": {
    "teamtape": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your_api_key_here"
      }
    }
  }
}
```

### 7.2 Add Configuration Instructions to README

Add section to README.md explaining MCP setup:

```markdown
## MCP Integration

TeamTape supports the Model Context Protocol (MCP) for integration with AI assistants like Claude Desktop.

### Available Resources

- `meetings://list` - List all meetings with summaries and key points
- `meetings://meeting/{id}` - Get full transcript and metadata for a specific meeting

### Claude Desktop Setup

1. Open Claude Desktop configuration:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%/Claude/claude_desktop_config.json`

2. Add TeamTape MCP server:

```json
{
  "mcpServers": {
    "teamtape": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

3. Restart Claude Desktop

4. You can now ask Claude to access meeting data:
   - "Show me the list of recent meetings"
   - "Get the transcript for meeting abc123-uuid"
   - "What were the action items from the last meeting?"
```

---

## Part 8: MCP Client Testing with curl

### 8.1 Simulate MCP Client Request

MCP clients will make requests to your endpoints. Test the full flow:

```bash
# Step 1: Discover available resources
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources

# Step 2: List meetings
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources/meetings/list

# Step 3: Get specific meeting
# (Use ID from step 2 response)
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources/meetings/MEETING_ID_HERE
```

### 8.2 Test Markdown Rendering

Save the markdown content and view it:

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources/meetings/abc123-uuid \
  | jq -r '.content' > meeting.md

# View in your markdown viewer
cat meeting.md
```

---

## Part 9: Error Handling

### 9.1 Invalid Meeting ID

```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/mcp/resources/meetings/invalid-id
```

Response:

```json
{
  "error": "ApiError",
  "message": "Meeting not found",
  "details": {
    "meetingId": "invalid-id"
  }
}
```

### 9.2 Missing Authorization

```bash
curl http://localhost:3000/mcp/resources
```

Response:

```json
{
  "error": "Unauthorized",
  "message": "Missing Authorization header"
}
```

---

## Part 10: Validation Checklist

Before proceeding to IMPLEMENTATION_4.MD, verify:

- [x] MCP controller created with list and detail endpoints
- [x] MCP routes created and mounted
- [x] Authentication works on MCP endpoints
- [x] meetings://list returns formatted meeting list
- [x] meetings://meeting/{id} returns markdown-formatted transcript
- [x] Markdown formatting includes all sections (metadata, participants, summary, transcript)
- [x] Error handling works for missing meetings
- [x] Claude Desktop configuration documented
- [x] All endpoints tested with curl

---

## Summary

This implementation guide covered:

1. Understanding MCP and its purpose
2. Creating MCP controller with resource endpoints
3. Implementing `meetings://list` resource
4. Implementing `meetings://meeting/{id}` resource with Markdown formatting
5. Creating MCP routes and mounting them
6. Testing MCP endpoints
7. Configuring Claude Desktop integration
8. Documenting MCP setup for users

**MCP server is now fully functional and ready for AI assistant integration.**

**Next Steps:** Proceed to `IMPLEMENTATION_4.MD` for React dashboard implementation.
