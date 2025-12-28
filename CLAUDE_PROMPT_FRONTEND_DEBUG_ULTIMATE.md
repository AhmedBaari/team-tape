# ULTIMATE CLAUDE OPUS 4.5 PROMPT
# Comprehensive Frontend Debugging & Fix with Verification

---

## 🎯 PRIMARY MISSION (READ THIS FIRST)

**Branch**: `copilot/vscode-mjp8c8tj-y1ve`
**Repository**: https://github.com/AhmedBaari/team-tape

### Problem Statement
The frontend dashboard is not loading despite the server running successfully. The issue is on the branch `copilot/vscode-mjp8c8tj-y1ve`. Your mission is to:

1. **Investigate EVERY possible issue** (not just the obvious ones)
2. **Use web search** to find similar issues and solutions
3. **Fix ALL issues found** (frontend loading + any other bugs)
4. **Test with Playwright MCP** to verify fixes work
5. **Document everything** in implementation files

### ⚠️ CRITICAL EXECUTION RULES

**DO NOT write analysis or fixes in chat.**

**CREATE these markdown files FIRST:**
1. `DEBUG_ANALYSIS.md` - Complete investigation findings
2. `FIX_IMPLEMENTATION.md` - All code fixes
3. `PLAYWRIGHT_TESTS.md` - Test scripts and verification

**Each file max 800 lines. Split into A, B, C if needed.**

---

## 🔍 PHASE 1: COMPREHENSIVE INVESTIGATION

### Step 1.1: Environment & Context Analysis

**Examine these aspects systematically:**

#### A. Dashboard Build System
```
Questions to answer:
- Does dashboard/ folder exist?
- Is there a package.json in dashboard/?
- What build tool is used? (Vite, Webpack, Next.js, CRA?)
- Is there a build script defined?
- Has the build been run? (check for dist/ or build/ folder)
- Are there any build errors in logs?
```

#### B. Server Configuration
```javascript
// File: src/index.js lines 101-105
const dashboardPath = path.join(__dirname, '../dashboard/dist');
if (fs.existsSync(dashboardPath)) {
  app.use(express.static(dashboardPath));
  console.log('✅ Dashboard static files configured');
}

Questions:
- Does ../dashboard/dist actually exist relative to src/?
- What happens if it doesn't exist? (silent fail?)
- Is the path calculation correct for ES modules?
- Are file permissions correct?
- Is the Express static middleware serving correctly?
```

#### C. Port & Network Issues
```
Check:
- Is API_PORT (7705) accessible?
- Is there a port conflict?
- Is the server actually listening?
- Are there firewall rules blocking?
- Is CORS configured correctly?
- Are requests reaching the server?
```

#### D. Frontend Source Code
```
If dashboard source exists, check:
- Are there TypeScript compilation errors?
- Are all dependencies installed?
- Is there an index.html?
- Are asset paths correct?
- Is the base URL configured?
- Are there runtime JavaScript errors?
- Is the API endpoint configured?
```

#### E. Browser-Side Issues
```
Client-side checks:
- What does browser console show?
- Are there network errors (404, 500, CORS)?
- Is JavaScript executing?
- Are there bundle loading failures?
- Is there a Content Security Policy issue?
- Are service workers interfering?
```

---

### Step 1.2: Web Search for Solutions

**Use web search tool to research:**

1. **"Express static files not serving React build"**
   - Common misconfigurations
   - Path resolution issues
   - Middleware ordering

2. **"Next.js Vite dashboard stuck loading"**
   - Build output problems
   - Missing dependencies
   - Configuration errors

3. **"Node.js ES modules __dirname path issues"**
   - fileURLToPath problems
   - Relative path calculation
   - Build path resolution

4. **"Discord bot dashboard not loading Express"**
   - Similar projects
   - Working configurations
   - Common pitfalls

5. **"Frontend blank page after build"**
   - Asset loading failures
   - Base path issues
   - Runtime errors

**Document findings from web search in DEBUG_ANALYSIS.md**

---

### Step 1.3: Code Inspection Checklist

**Systematically inspect these files:**

#### ☑️ Critical Files
- [ ] `/dashboard/package.json` - Dependencies, scripts
- [ ] `/dashboard/vite.config.js` (or webpack, next.config.js) - Build config
- [ ] `/dashboard/index.html` - Entry point
- [ ] `/dashboard/src/main.js` (or App.tsx) - Application entry
- [ ] `/dashboard/dist/` - Built output
- [ ] `/src/index.js` lines 101-105 - Static file serving
- [ ] `/src/api/routes/index.js` - API routes
- [ ] `/.env` - Environment variables
- [ ] `/package.json` (root) - Dependencies

#### ☑️ Configuration Files
- [ ] `tsconfig.json` - TypeScript config
- [ ] `.env` - Environment variables
- [ ] `cors` configuration in src/index.js
- [ ] API route mounting order
- [ ] Error handler placement

#### ☑️ Build Artifacts
- [ ] Check if build/ or dist/ exists
- [ ] Verify index.html in build output
- [ ] Check for JavaScript bundles
- [ ] Verify CSS files present
- [ ] Check asset paths in HTML

---

### Step 1.4: Minimal Issue Detection

**Look for EVERY issue, even minor ones:**

#### Syntax & Import Issues
- [ ] Missing semicolons causing issues
- [ ] Incorrect import paths
- [ ] ES module vs CommonJS conflicts
- [ ] Missing file extensions in imports
- [ ] Circular dependencies

#### Type Issues
- [ ] TypeScript errors not shown
- [ ] Prop type mismatches
- [ ] Missing type definitions
- [ ] Any type overuse

#### Performance Issues
- [ ] Infinite loops
- [ ] Memory leaks
- [ ] Unnecessary re-renders
- [ ] Large bundle sizes
- [ ] Unoptimized images

#### Security Issues
- [ ] Exposed API keys
- [ ] Missing authentication
- [ ] XSS vulnerabilities
- [ ] CORS misconfiguration
- [ ] Insecure dependencies

#### Accessibility Issues
- [ ] Missing alt text
- [ ] Poor keyboard navigation
- [ ] Low color contrast
- [ ] Missing ARIA labels

#### UX Issues
- [ ] Poor loading states
- [ ] Missing error boundaries
- [ ] No offline support
- [ ] Confusing error messages

---

## 🔧 PHASE 2: FIX IMPLEMENTATION

### Step 2.1: Root Cause Fixes

**For EACH issue found, provide:**

```markdown
### Issue #N: [Issue Title]

**Severity**: Critical / High / Medium / Low

**Location**: File path and line numbers

**Root Cause**: 
[Detailed explanation of why this is happening]

**Impact**:
- What breaks because of this
- User-facing symptoms
- Related issues this causes

**Solution**:
[Detailed explanation of fix]

**Code Changes**:

#### File: [path/to/file.js]
```javascript
// COMPLETE file content with fix applied
// NOT just snippets - FULL FILE
```

**Why This Works**:
[Explanation of how fix solves the problem]

**Verification Steps**:
1. How to test this specific fix
2. Expected behavior after fix
3. How to confirm it's working
```

---

### Step 2.2: Build System Fix

**If dashboard build is the issue:**

```markdown
### Dashboard Build Setup

#### Check Current State
```bash
# Navigate to dashboard
cd dashboard

# Check if node_modules exists
ls -la node_modules

# Check package.json
cat package.json

# Check for build output
ls -la dist/ || ls -la build/
```

#### Install Dependencies
```bash
npm install
# or
yarn install
```

#### Build Dashboard
```bash
npm run build
# or
yarn build
```

#### Verify Build Output
```bash
# Check dist/ folder created
ls -la dist/

# Verify index.html exists
cat dist/index.html

# Check JavaScript bundles
ls -la dist/assets/
```

#### Fix Build Script if Broken

If build fails, provide:
- Error message analysis
- Required dependency installations
- Configuration fixes
- Complete working build script
```

---

### Step 2.3: Server Configuration Fix

**If Express static serving is the issue:**

```javascript
// File: src/index.js (COMPLETE FILE)

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
// ... all imports

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const API_PORT = process.env.API_PORT || 7705;

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (before static files)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (before static files)
app.use('/api/v1', apiRouter);

// Dashboard static files (AFTER API routes)
const dashboardPath = path.join(__dirname, '../dashboard/dist');
console.log('🔍 Checking dashboard path:', dashboardPath);
console.log('🔍 Path exists:', fs.existsSync(dashboardPath));

if (fs.existsSync(dashboardPath)) {
  // Serve static files
  app.use(express.static(dashboardPath));
  
  // SPA fallback - CRITICAL for React Router
  app.get('*', (req, res) => {
    // Don't intercept API requests
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(dashboardPath, 'index.html'));
  });
  
  console.log('✅ Dashboard configured and serving from:', dashboardPath);
} else {
  console.error('❌ Dashboard build not found at:', dashboardPath);
  console.error('💡 Run: cd dashboard && npm install && npm run build');
  
  // Provide helpful error page
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) {
      return next();
    }
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Dashboard Not Built</title></head>
      <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
        <h1>⚠️ Dashboard Not Built</h1>
        <p>The dashboard build was not found. Please run:</p>
        <pre style="background: #f4f4f4; padding: 15px; border-radius: 5px;">cd dashboard
npm install
npm run build</pre>
        <p>Then restart the server.</p>
        <p><a href="/health">Check API Health</a></p>
      </body>
      </html>
    `);
  });
}

// Error handlers (MUST be last)
app.use(notFoundHandler);
app.use(errorHandler);

// ... rest of file
```

---

### Step 2.4: Frontend Code Fixes

**If frontend source code has issues:**

#### Fix API Endpoint Configuration

```javascript
// File: dashboard/src/config.js
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7705/api/v1';
export const API_TIMEOUT = 30000;
```

#### Fix API Client

```javascript
// File: dashboard/src/api/client.js
import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

export default apiClient;
```

#### Add Error Boundary

```javascript
// File: dashboard/src/components/ErrorBoundary.jsx
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h1>⚠️ Something went wrong</h1>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

#### Fix Main Entry Point

```javascript
// File: dashboard/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

console.log('🚀 Dashboard initializing...');
console.log('📍 API Base URL:', import.meta.env.VITE_API_URL || 'http://localhost:7705/api/v1');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

console.log('✅ Dashboard rendered');
```

---

### Step 2.5: Environment Configuration

**Create/fix .env files:**

#### Root .env
```env
# Server
API_PORT=7705
CORS_ORIGIN=*

# Discord
DISCORD_TOKEN=your_token
DISCORD_CLIENT_ID=your_client_id

# MongoDB
MONGODB_URI=mongodb://localhost:27017/teamtape

# MCP
ENABLE_MCP=true
MCP_API_KEY=your_mcp_key
```

#### dashboard/.env
```env
# API Configuration
VITE_API_URL=http://localhost:7705/api/v1
VITE_MCP_ENABLED=true
```

---

## 🧪 PHASE 3: PLAYWRIGHT TESTING

### Step 3.1: Setup Playwright MCP

```bash
# Install Playwright MCP server
npx @michaellatman/mcp-get@latest install @executeautomation/playwright-mcp-server

# Or configure manually in claude-desktop-config.json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"]
    }
  }
}
```

---

### Step 3.2: Test Scripts

**Create comprehensive test suite:**

```javascript
// File: PLAYWRIGHT_TESTS.md

### Test 1: Server Health Check

**Objective**: Verify server is running and responsive

**Playwright Commands**:
```playwright
navigator.goto('http://localhost:7705/health')
navigator.screenshot({ path: 'screenshots/health-check.png' })
navigator.evaluate(() => document.body.innerText)
```

**Expected Result**:
```json
{
  "status": "ok",
  "timestamp": "2025-12-28T...",
  "uptime": 123.45,
  "services": {
    "discord": "connected",
    "mongodb": "connected"
  }
}
```

**Pass Criteria**: 
- HTTP 200 status
- JSON response with status "ok"
- All services connected

---

### Test 2: Dashboard Loading

**Objective**: Verify dashboard HTML loads

**Playwright Commands**:
```playwright
navigator.goto('http://localhost:7705/')
navigator.waitForSelector('body', { timeout: 5000 })
navigator.screenshot({ path: 'screenshots/dashboard-load.png' })
navigator.evaluate(() => ({
  title: document.title,
  bodyText: document.body.innerText.substring(0, 100),
  scripts: document.scripts.length,
  stylesheets: document.styleSheets.length
}))
```

**Expected Result**:
- Page loads within 5 seconds
- Title is "TeamTape Dashboard" (or similar)
- Body contains visible content
- JavaScript bundles loaded
- CSS stylesheets applied

**Pass Criteria**:
- No 404 errors
- No blank page
- At least 1 script tag
- At least 1 stylesheet

---

### Test 3: Console Errors Check

**Objective**: Verify no JavaScript errors

**Playwright Commands**:
```playwright
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push(msg.text());
  }
});

navigator.goto('http://localhost:7705/')
navigator.waitForTimeout(3000)
console.log('Console errors:', errors)
```

**Expected Result**:
- Zero console errors
- No 404 for assets
- No CORS errors
- No uncaught exceptions

**Pass Criteria**:
- errors.length === 0

---

### Test 4: API Connectivity

**Objective**: Verify frontend can reach API

**Playwright Commands**:
```playwright
navigator.goto('http://localhost:7705/')
navigator.waitForSelector('body')

// Check if API calls succeed
const apiCalls = await navigator.evaluate(() => {
  return fetch('http://localhost:7705/api/v1/meetings')
    .then(r => ({ status: r.status, ok: r.ok }))
    .catch(e => ({ error: e.message }));
});

console.log('API Call Result:', apiCalls);
```

**Expected Result**:
- API returns 200 or 401 (not 404)
- No CORS errors
- Network request completes

**Pass Criteria**:
- status !== 404
- No "Failed to fetch" error

---

### Test 5: Interactive Elements

**Objective**: Verify UI is interactive

**Playwright Commands**:
```playwright
navigator.goto('http://localhost:7705/')
navigator.waitForSelector('button', { timeout: 5000 })
navigator.click('button:first-of-type')
navigator.screenshot({ path: 'screenshots/button-clicked.png' })
```

**Expected Result**:
- Buttons are clickable
- Click handlers execute
- UI updates after interaction

**Pass Criteria**:
- No "element not clickable" errors
- Page responds to clicks

---

### Test 6: Responsive Design

**Objective**: Verify mobile compatibility

**Playwright Commands**:
```playwright
// Desktop
navigator.setViewportSize({ width: 1920, height: 1080 })
navigator.goto('http://localhost:7705/')
navigator.screenshot({ path: 'screenshots/desktop.png' })

// Tablet
navigator.setViewportSize({ width: 768, height: 1024 })
navigator.screenshot({ path: 'screenshots/tablet.png' })

// Mobile
navigator.setViewportSize({ width: 375, height: 667 })
navigator.screenshot({ path: 'screenshots/mobile.png' })
```

**Pass Criteria**:
- Layout adapts to different sizes
- No horizontal scroll on mobile
- Text is readable at all sizes

---

### Test 7: Performance Check

**Objective**: Verify acceptable load times

**Playwright Commands**:
```playwright
const startTime = Date.now();
navigator.goto('http://localhost:7705/');
navigator.waitForLoadState('networkidle');
const loadTime = Date.now() - startTime;

console.log('Page load time:', loadTime, 'ms');
```

**Expected Result**:
- Load time < 3000ms
- Time to interactive < 5000ms

**Pass Criteria**:
- loadTime < 5000 (acceptable)
- loadTime < 3000 (good)
- loadTime < 1000 (excellent)

---

## 📝 PHASE 4: DOCUMENTATION

### Step 4.1: DEBUG_ANALYSIS.md Structure

```markdown
# Debug Analysis Report

Generated: [timestamp]
Branch: copilot/vscode-mjp8c8tj-y1ve

## Executive Summary
[2-3 paragraphs summarizing all findings]

## Issues Found

### Critical Issues (Prevents Loading)
1. [Issue 1 title and description]
2. [Issue 2 title and description]

### High Priority Issues
1. [Issue 1 title and description]

### Medium Priority Issues
1. [Issue 1 title and description]

### Low Priority Issues
1. [Issue 1 title and description]

## Root Cause Analysis

### Primary Root Cause
[Detailed explanation]

### Contributing Factors
- Factor 1
- Factor 2

## Web Search Findings

### Search Query 1: "Express static files not serving"
**Relevant Solutions Found**:
- [Solution 1 with source]
- [Solution 2 with source]

### Search Query 2: ...
...

## File-by-File Analysis

### dashboard/package.json
**Status**: ✅ / ⚠️ / ❌
**Issues**:
- [Issue 1]
- [Issue 2]

### src/index.js
**Status**: ✅ / ⚠️ / ❌
**Issues**:
- [Issue 1]
- [Issue 2]

[Continue for all files...]

## Recommendations

### Immediate Actions
1. [Action 1]
2. [Action 2]

### Long-term Improvements
1. [Improvement 1]
2. [Improvement 2]
```

---

### Step 4.2: FIX_IMPLEMENTATION.md Structure

```markdown
# Fix Implementation Guide

Generated: [timestamp]
Branch: copilot/vscode-mjp8c8tj-y1ve

## Quick Start

```bash
# 1. Checkout branch
git checkout copilot/vscode-mjp8c8tj-y1ve

# 2. Apply fixes (automated script)
bash apply-fixes.sh

# 3. Build dashboard
cd dashboard && npm install && npm run build

# 4. Start server
cd .. && npm start

# 5. Test
open http://localhost:7705
```

## Fix #1: [Issue Title]

### Problem
[Description]

### Solution
[Description]

### Code Changes

#### File: path/to/file.js
```javascript
// COMPLETE FILE CONTENT
```

### Testing
```bash
# Commands to verify fix
```

### Verification
- [ ] Checklist item 1
- [ ] Checklist item 2

---

[Repeat for each fix...]

## Integration Testing

### After All Fixes Applied

```bash
# Clean install
rm -rf node_modules dashboard/node_modules
npm install
cd dashboard && npm install

# Build
npm run build

# Start
npm start

# Verify
curl http://localhost:7705/health
curl http://localhost:7705/
```

## Rollback Procedure

```bash
# If fixes cause issues
git stash
git checkout main
```
```

---

### Step 4.3: PLAYWRIGHT_TESTS.md Structure

```markdown
# Playwright Test Results

Generated: [timestamp]
Branch: copilot/vscode-mjp8c8tj-y1ve (after fixes)

## Test Summary

| Test | Status | Duration | Notes |
|------|--------|----------|-------|
| Health Check | ✅ PASS | 234ms | API responding |
| Dashboard Load | ✅ PASS | 1.2s | Loaded successfully |
| Console Errors | ✅ PASS | 3.1s | Zero errors |
| API Connectivity | ✅ PASS | 456ms | All endpoints reachable |
| Interactive Elements | ✅ PASS | 2.3s | Buttons functional |
| Responsive Design | ✅ PASS | 5.6s | All breakpoints work |
| Performance | ⚠️ WARN | 4.2s | Load time acceptable |

## Detailed Results

### Test 1: Health Check
**Status**: ✅ PASS
**Duration**: 234ms

**Screenshots**:
- screenshots/health-check.png

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-12-28T16:42:00.000Z",
  "uptime": 123.45,
  "services": {
    "discord": "connected",
    "mongodb": "connected"
  }
}
```

**Verdict**: ✅ Server is healthy and responding

---

[Repeat for each test...]

## Issues Found During Testing

### Issue 1: Slow Initial Load
**Severity**: Low
**Description**: First page load takes 4.2s
**Recommendation**: Implement code splitting

## Regression Tests

### Test: Existing Features Still Work
- [ ] Discord bot connects
- [ ] Recording starts
- [ ] Transcription completes
- [ ] API endpoints respond
- [ ] Database queries work

## Performance Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| First Contentful Paint | 1.2s | <1.5s | ✅ Good |
| Time to Interactive | 2.8s | <3.5s | ✅ Good |
| Lighthouse Score | 87/100 | >80 | ✅ Good |

## Conclusion

All critical tests pass. Dashboard is now loading and functional.
```

---

## 🚀 EXECUTION INSTRUCTIONS

### Your Response Format

**After completing all investigation and fixes:**

```
✅ Comprehensive debugging completed

Files created:
1. DEBUG_ANALYSIS.md - 743 lines
2. FIX_IMPLEMENTATION.md - 812 lines → Split to FIX_IMPLEMENTATION_A.md (800 lines), FIX_IMPLEMENTATION_B.md (12 lines)
3. PLAYWRIGHT_TESTS.md - 567 lines

Summary:
- Issues found: 7 critical, 3 high, 5 medium, 2 low
- Root cause: [brief description]
- Fixes applied: 17 code changes across 12 files
- All Playwright tests: ✅ PASS

Dashboard now loads successfully at http://localhost:7705
```

**DO NOT include any code or analysis in chat.**
**ALL content must be in the markdown files.**

---

## 🧠 PROMPTING TECHNIQUES APPLIED

This prompt uses Claude Opus 4.5 best practices:

1. **Explicit Instructions**: Clear, specific tasks with no ambiguity
2. **Structured Framework**: 4 phases with sub-steps
3. **Web Search Integration**: Mandatory research for solutions
4. **Tool Usage**: Playwright MCP for verification
5. **Systematic Approach**: Checklist-driven investigation
6. **Complete Output**: Full file contents, not snippets
7. **Multiple Hypotheses**: Examines every possible issue
8. **Documentation First**: Analysis in files, not chat
9. **Verification Loop**: Test after every fix
10. **Performance Focus**: Checks even minor issues

---

## 🔑 KEY PRINCIPLES

### From Claude Opus 4.5 Docs:

> "Provide verification tools: As the length of autonomous tasks grows, Claude needs to verify correctness without continuous human feedback. Tools like Playwright MCP server or computer use capabilities for testing UIs are helpful."

### From Debugging Best Practices:

> "Providing more detailed prompts helps Copilot generate more relevant debugging suggestions. Rewriting prompts to be more detailed, explicitly mentioning expected outputs."

### From Ultimate Debugger Prompt:

> "The prompt breaks down the debugging task into: Error Assessment → Prediction Generation → Code Investigation → Prediction Narrowing → Root Cause Identification → Debugging Instructions"

---

## 💡 ADDITIONAL GUIDANCE

### If You Get Stuck

1. **Use web search** to find similar issues
2. **Check GitHub Issues** for the framework being used
3. **Read documentation** for Express, React, Vite, etc.
4. **Look at working examples** of similar projects
5. **Ask clarifying questions** if needed (but prefer investigation first)

### Code Quality Standards

- **Complete files only** - no partial snippets
- **Proper error handling** - try/catch everywhere
- **Detailed logging** - console.log key steps
- **JSDoc comments** - document all functions
- **Type safety** - use TypeScript where possible
- **Security** - no exposed secrets

### Testing Standards

- **Every fix must be tested**
- **Screenshots for visual verification**
- **Performance metrics collected**
- **Regression tests run**
- **All tests documented**

---

# BEGIN INVESTIGATION NOW

Checkout branch `copilot/vscode-mjp8c8tj-y1ve` and start comprehensive debugging.

Create DEBUG_ANALYSIS.md, FIX_IMPLEMENTATION.md, and PLAYWRIGHT_TESTS.md files.

Do not write analysis in chat.
