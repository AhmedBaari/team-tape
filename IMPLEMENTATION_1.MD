# IMPLEMENTATION_1.MD - Project Setup & Express Server Integration

## Overview
This document covers the initial setup for adding REST API endpoints and MCP server integration to TeamTape. The API will run alongside the Discord bot in the same Express app.

---

## Part 1: Install Dependencies

### 1.1 Install Required Packages

Add the following dependencies to support Express API and MCP server:

```bash
npm install express cors @modelcontextprotocol/sdk
```

**Package Purposes:**
- `express`: Web server framework for REST API endpoints
- `cors`: Enable Cross-Origin Resource Sharing for dashboard
- `@modelcontextprotocol/sdk`: Official MCP SDK for resource endpoints

### 1.2 Update package.json Scripts

Add new scripts for running the API server:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "deploy": "pm2 start src/index.js --name team-tape",
    "check": "node check-dependencies.js",
    "test": "jest",
    "lint": "eslint src --fix",
    "format": "prettier --write src"
  }
}
```

No changes needed - the existing `start` and `dev` scripts will work with the integrated Express server.

---

## Part 2: Create Directory Structure

Create the following directory structure for API code:

```bash
mkdir -p src/api/routes
mkdir -p src/api/middleware
mkdir -p src/api/controllers
mkdir -p src/api/utils
```

**Directory Purposes:**
- `src/api/routes/`: Route definitions for Express endpoints
- `src/api/middleware/`: Authentication and validation middleware
- `src/api/controllers/`: Business logic for API endpoints
- `src/api/utils/`: Helper functions for API (pagination, formatting, etc.)

---

## Part 3: Environment Configuration

### 3.1 Update .env.example

Add API-specific environment variables to `.env.example`:

```bash
# Existing variables...
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here

# Perplexity API Configuration
PERPLEXITY_API_KEY=your_perplexity_api_key_here
PERPLEXITY_MODEL=llama-3.1-sonar-large-128k-online

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/teamtape

# Application Environment
NODE_ENV=development
LOG_LEVEL=info

# Paths
RECORDINGS_PATH=./recordings
LOGS_PATH=./logs

# NEW: API Configuration
API_PORT=3000
API_KEY=your_secure_api_key_here
CORS_ORIGIN=http://localhost:5173
API_BASE_PATH=/api/v1

# NEW: MCP Configuration
MCP_BASE_PATH=/mcp
ENABLE_MCP=true
```

### 3.2 Create .env File

Copy `.env.example` to `.env` and fill in actual values:

```bash
cp .env.example .env
# Edit .env with your actual credentials
```

**Important:** Generate a strong API key for production:

```bash
# Generate random API key (Node.js)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Part 4: Authentication Middleware

Create authentication middleware to protect API endpoints.

### 4.1 Create src/api/middleware/auth.js

```javascript
import logger from '../../utils/logger.js';

/**
 * API Key Authentication Middleware
 * Validates API key from Authorization header
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function authenticateApiKey(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      logger.warn('API request missing Authorization header', {
        path: req.path,
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      });
    }

    // Support both "Bearer <key>" and plain "<key>" formats
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      logger.error('API_KEY environment variable not configured');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'API authentication not configured',
      });
    }

    if (token !== apiKey) {
      logger.warn('Invalid API key attempt', {
        path: req.path,
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    // API key is valid, proceed to next middleware
    next();
  } catch (error) {
    logger.error('Error in authentication middleware', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication error',
    });
  }
}

/**
 * Optional API key authentication for public-ish endpoints
 * If API key is provided, validates it. Otherwise allows through.
 * (Not used in current implementation - all endpoints require auth)
 */
export function optionalApiKey(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(); // No auth header, allow through
  }

  // If auth header exists, validate it
  return authenticateApiKey(req, res, next);
}
```

---

## Part 5: API Utilities

Create utility functions for pagination, error handling, and response formatting.

### 5.1 Create src/api/utils/pagination.js

```javascript
/**
 * Pagination utility functions
 */

/**
 * Extract pagination parameters from request query
 * @param {Object} query - Express request query object
 * @param {number} defaultLimit - Default items per page
 * @returns {Object} Pagination parameters
 */
export function getPaginationParams(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(query.limit) || defaultLimit)
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

/**
 * Build pagination metadata for response
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total items count
 * @returns {Object} Pagination metadata
 */
export function buildPaginationMeta(page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
  };
}

/**
 * Apply pagination to MongoDB query
 * @param {Query} query - Mongoose query object
 * @param {Object} params - Pagination parameters from getPaginationParams
 * @returns {Query} Query with pagination applied
 */
export function applyPagination(query, params) {
  return query.skip(params.skip).limit(params.limit);
}
```

### 5.2 Create src/api/utils/errorHandler.js

```javascript
import logger from '../../utils/logger.js';

/**
 * Standard API error response format
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * Express error handling middleware
 * Catches all errors and returns standardized JSON response
 */
export function errorHandler(err, req, res, next) {
  // Log the error
  logger.error('API Error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode: err.statusCode || 500,
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.errors,
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: 'The provided ID is not valid',
    });
  }

  // Custom API error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      details: err.details,
    });
  }

  // Default server error
  return res.status(err.statusCode || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
}

/**
 * Async handler wrapper to catch promise rejections
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Not found handler for undefined routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
}
```

### 5.3 Create src/api/utils/responseFormatter.js

```javascript
/**
 * Response formatting utilities for consistent API responses
 */

/**
 * Format successful response with data and optional metadata
 * @param {Object} data - Response data
 * @param {Object} meta - Optional metadata (pagination, etc.)
 * @returns {Object} Formatted response
 */
export function successResponse(data, meta = null) {
  const response = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return response;
}

/**
 * Format meeting data for API response
 * @param {Object} meeting - MongoDB meeting document
 * @returns {Object} Formatted meeting data
 */
export function formatMeeting(meeting) {
  return {
    id: meeting.meetingId,
    title: generateMeetingTitle(meeting),
    startTime: meeting.startTimestamp,
    endTime: meeting.endTimestamp,
    duration: meeting.duration,
    status: meeting.recordingStatus,
    channel: {
      id: meeting.channelId,
      name: meeting.channelName,
    },
    guild: {
      id: meeting.guildId,
      name: meeting.guildName,
    },
    participantCount: meeting.totalParticipants || meeting.participants.length,
    hasTranscript: !!meeting.transcript,
    hasSummary: !!meeting.summary,
    hasAudio: !!meeting.audioFilePath,
  };
}

/**
 * Format meeting list for API response
 * @param {Array} meetings - Array of meeting documents
 * @returns {Array} Formatted meeting list
 */
export function formatMeetingList(meetings) {
  return meetings.map(formatMeeting);
}

/**
 * Format meeting details including full data
 * @param {Object} meeting - MongoDB meeting document
 * @returns {Object} Detailed meeting data
 */
export function formatMeetingDetails(meeting) {
  return {
    ...formatMeeting(meeting),
    participants: meeting.participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      duration: p.duration,
      speakingTime: p.speakingTime,
      wasDeafened: p.wasDeafened,
    })),
    summary: meeting.summary
      ? {
          executiveSummary: meeting.summary.executiveSummary,
          keyPoints: meeting.summary.keyPoints,
          actionItems: meeting.summary.actionItems,
          innovations: meeting.summary.innovations,
          sentiment: meeting.summary.sentiment,
          generatedAt: meeting.summary.generatedAt,
          model: meeting.summary.model,
        }
      : null,
    errors: meeting.processingErrors || [],
    metadata: meeting.metadata || {},
  };
}

/**
 * Generate a human-readable meeting title
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
```

---

## Part 6: Express Server Integration

Integrate Express server into the existing `src/index.js` file.

### 6.1 Modify src/index.js

Add Express server initialization **after** the Discord client setup but **before** the `startBot()` function:

**Location in file:** After line 41 (after Discord client initialization)

**Code to add:**

```javascript
// ============================================
// EXPRESS API SERVER SETUP
// ============================================

import express from 'express';
import cors from 'cors';

// Initialize Express app
const app = express();
const API_PORT = process.env.API_PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
  });
  next();
});

// Import API routes (will create these in Part 7)
// Import will be added later when routes are created

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      discord: client.isReady() ? 'connected' : 'disconnected',
      mongodb: mongoService.isConnected() ? 'connected' : 'disconnected',
    },
  });
});

// API routes will be mounted here
// app.use('/api/v1', apiRouter);
// app.use('/mcp', mcpRouter);

// 404 handler - must be after all routes
// Will import from errorHandler later
// app.use(notFoundHandler);

// Error handling middleware - must be last
// Will import from errorHandler later
// app.use(errorHandler);

// Start Express server
let httpServer;

function startExpressServer() {
  return new Promise((resolve, reject) => {
    try {
      httpServer = app.listen(API_PORT, () => {
        console.log(`✅ API server listening on port ${API_PORT}`);
        logger.info(`API server started on port ${API_PORT}`);
        resolve();
      });

      httpServer.on('error', (error) => {
        console.error('❌ Failed to start API server:', error.message);
        logger.error('Failed to start API server', { error: error.message });
        reject(error);
      });
    } catch (error) {
      console.error('❌ Error initializing API server:', error.message);
      reject(error);
    }
  });
}

// Export app for testing
export { app };
```

### 6.2 Update startBot() Function

Modify the `startBot()` function to start the Express server:

**Location:** Inside the `startBot()` function, after MongoDB connection (around line 186)

**Add this code after MongoDB connection:**

```javascript
// Start Express API server
try {
  console.log('🌐 Starting Express API server...');
  await startExpressServer();
  console.log('✅ Express API server started');
} catch (error) {
  console.error('⚠️  Failed to start API server:', error.message);
  logger.error('Failed to start API server', { error: error.message });
  console.log('⚠️  Continuing without API server (Discord bot features still available)');
}
```

### 6.3 Update shutdown() Function

Add Express server shutdown to the `shutdown()` function:

**Location:** Inside the `shutdown()` function (around line 260)

**Add this code before MongoDB disconnect:**

```javascript
// Close Express server
if (httpServer) {
  await new Promise((resolve) => {
    httpServer.close(() => {
      console.log('✅ Express server closed');
      logger.info('Express server closed');
      resolve();
    });
  });
}
```

---

## Part 7: Create Base API Router

Create the base API router structure that will mount all API routes.

### 7.1 Create src/api/routes/index.js

```javascript
import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// Apply authentication to all API routes
router.use(authenticateApiKey);

// Mount sub-routers (will be imported when created)
// import meetingsRouter from './meetings.js';
// router.use('/meetings', meetingsRouter);

// Analytics routes (will be created later)
// import analyticsRouter from './analytics.js';
// router.use('/analytics', analyticsRouter);

// API root endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TeamTape API v1',
    version: '1.0.0',
    endpoints: {
      meetings: '/api/v1/meetings',
      analytics: '/api/v1/analytics',
      mcp: '/mcp',
    },
    documentation: 'https://github.com/AhmedBaari/team-tape',
  });
});

export default router;
```

### 7.2 Update src/index.js to Use Router

**Location:** In the Express setup section (where we added `// app.use('/api/v1', apiRouter);`)

**Replace the commented line with:**

```javascript
import apiRouter from './api/routes/index.js';
import { notFoundHandler, errorHandler } from './api/utils/errorHandler.js';

// Mount API routes
app.use('/api/v1', apiRouter);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Error handling middleware - must be last
app.use(errorHandler);
```

---

## Part 8: Testing the Setup

### 8.1 Start the Server

```bash
npm run dev
```

You should see output like:

```
🚀 Starting TeamTape bot...
✅ Discord client initialized
🌐 Starting Express API server...
✅ API server listening on port 3000
✅ Bot logged in as TeamTape#1234
📊 Connecting to MongoDB...
✅ MongoDB connected
✅ Express API server started
🎉 Bot initialization complete!
```

### 8.2 Test Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2024-12-27T09:00:00.000Z",
  "uptime": 42.5,
  "services": {
    "discord": "connected",
    "mongodb": "connected"
  }
}
```

### 8.3 Test API Root

```bash
curl -H "Authorization: Bearer your_api_key_here" http://localhost:3000/api/v1
```

Expected response:

```json
{
  "message": "TeamTape API v1",
  "version": "1.0.0",
  "endpoints": {
    "meetings": "/api/v1/meetings",
    "analytics": "/api/v1/analytics",
    "mcp": "/mcp"
  },
  "documentation": "https://github.com/AhmedBaari/team-tape"
}
```

### 8.4 Test Authentication

Test without API key:

```bash
curl http://localhost:3000/api/v1
```

Expected response:

```json
{
  "error": "Unauthorized",
  "message": "Missing Authorization header"
}
```

Test with invalid API key:

```bash
curl -H "Authorization: Bearer invalid_key" http://localhost:3000/api/v1
```

Expected response:

```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

---

## Part 9: Validation Checklist

Before proceeding to IMPLEMENTATION_2.MD, verify:

- [x] Dependencies installed (`express`, `cors`, `@modelcontextprotocol/sdk`)
- [x] Directory structure created (`src/api/routes`, `src/api/middleware`, etc.)
- [x] Environment variables added to `.env.example` and `.env`
- [x] Authentication middleware created and working
- [x] Utility functions created (pagination, error handling, response formatting)
- [x] Express server integrated into `src/index.js`
- [x] Base API router created and mounted
- [x] Health check endpoint working
- [x] API authentication working (both valid and invalid keys tested)
- [x] Server starts without errors
- [x] Discord bot still functioning normally

---

## Summary

This implementation guide covered:

1. Installing Express and MCP dependencies
2. Creating the API directory structure
3. Adding environment configuration for API and MCP
4. Implementing authentication middleware with API key validation
5. Creating utility functions for pagination, error handling, and response formatting
6. Integrating Express server into the existing Discord bot
7. Creating base API router structure
8. Testing the setup with health checks and authentication

**Next Steps:** Proceed to `IMPLEMENTATION_2.MD` for REST API endpoint implementation.
