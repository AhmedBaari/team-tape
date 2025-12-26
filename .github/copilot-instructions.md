# GitHub Copilot Instructions for TeamTape

## Project Overview

TeamTape is a Discord bot for automatic voice meeting recording, transcription, and AI-powered summaries. Built with Node.js 22+ and Discord.js v14, supporting Discord's DAVE end-to-end encryption protocol.

## Code Style & Standards

### Language & Syntax
- Use **ES modules** (import/export), not CommonJS (require)
- Use modern JavaScript (ES2022+) features:
  - Async/await for promises
  - Optional chaining (`?.`)
  - Nullish coalescing (`??`)
  - Template literals for strings
  - Destructuring assignment
  - Arrow functions for callbacks
- Prefer `const` over `let`, avoid `var`
- Use strict equality (`===`) over loose equality (`==`)

### File Structure
```
src/
├── commands/           # Slash commands (one per file)
├── events/             # Discord event handlers
├── services/           # Business logic and external integrations
├── models/             # MongoDB/Mongoose schemas
├── utils/              # Helper functions and utilities
└── index.js            # Main entry point
```

### Naming Conventions
- **Files**: camelCase (e.g., `audioRecorder.js`, `voiceStateUpdate.js`)
- **Classes**: PascalCase (e.g., `AudioRecorder`, `Meeting`)
- **Functions**: camelCase (e.g., `startRecording`, `handleUserSpeaking`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RECORDING_DURATION`)
- **Private methods**: prefix with underscore or use JSDoc `@private`

### Documentation
- **Always** add JSDoc comments for:
  - Public functions and methods
  - Complex business logic
  - Service classes
- JSDoc must include:
  - Function description
  - `@param` for each parameter with type
  - `@returns` with type and description
  - `@throws` if function can throw errors
  - `@private` for internal methods

**Example:**
```javascript
/**
 * Start recording in a voice channel
 * @param {VoiceChannel} channel - Discord voice channel
 * @param {string} meetingId - Unique meeting identifier
 * @param {Client} client - Discord client instance
 * @returns {Promise<Object>} Recording session info
 * @throws {Error} If already recording or connection fails
 */
async startRecording(channel, meetingId, client) {
  // Implementation
}
```

## Critical Implementation Rules

### 1. Voice & Encryption (MANDATORY)

**Always import encryption libraries BEFORE @discordjs/voice:**
```javascript
// CORRECT ORDER - encryption FIRST
import sodium from 'libsodium-wrappers';
await sodium.ready;

import { joinVoiceChannel } from '@discordjs/voice';
```

**Never use deprecated options:**
```javascript
// ❌ WRONG
const connection = joinVoiceChannel({
  selfDeaf: true  // This prevents receiving audio!
});

// ✅ CORRECT
const connection = joinVoiceChannel({
  selfDeaf: false,  // Must be false to receive audio
  selfMute: true,   // Bot should be muted
});
```

### 2. Discord.js Modern Patterns

**Use MessageFlags instead of deprecated ephemeral:**
```javascript
// ❌ WRONG (deprecated in v14)
await interaction.deferReply({ ephemeral: false });

// ✅ CORRECT
import { MessageFlags } from 'discord.js';
await interaction.deferReply({ flags: MessageFlags.None });
// For ephemeral: { flags: MessageFlags.Ephemeral }
```

**Use clientReady instead of ready event:**
```javascript
// ⚠️ DEPRECATED (still works in v14)
client.once('ready', () => { ... });

// ✅ FUTURE-PROOF
client.once('clientReady', () => { ... });
```

### 3. MongoDB/Mongoose Best Practices

**Remove deprecated connection options:**
```javascript
// ❌ WRONG (deprecated in Mongoose v6+)
await mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ✅ CORRECT
await mongoose.connect(uri, {
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
});
```

**Always validate before casting:**
```javascript
// ❌ WRONG - can cause "Cast to Number failed for NaN"
const duration = Date.now() - recording.startTime;

// ✅ CORRECT - validate and provide fallback
const duration = recording && recording.startTime
  ? Math.floor((Date.now() - recording.startTime) / 1000)
  : 0;
```

### 4. Error Handling

**Always use try-catch for async operations:**
```javascript
async execute(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.None });
    // ... logic
  } catch (error) {
    logger.error('Error executing command', {
      error: error.message,
      stack: error.stack,
      userId: interaction.user.id,
    });
    
    const embed = createErrorEmbed('Error', error.message);
    await interaction.editReply({ embeds: [embed] });
  }
}
```

**Include context in logger calls:**
```javascript
logger.error('Error starting recording', {
  error: error.message,
  stack: error.stack,
  meetingId,
  channelId: channel.id,
  userId: user.id,
});
```

### 5. Audio Recording Patterns

**Subscribe to user audio streams correctly:**
```javascript
const audioStream = connection.receiver.subscribe(userId, {
  end: {
    behavior: EndBehaviorType.AfterSilence,
    duration: 1000,  // 1 second of silence
  },
});

// Create Opus decoder
const opusDecoder = new prism.opus.Decoder({
  rate: 48000,
  channels: 2,
  frameSize: 960,
});

// Pipeline: Opus → PCM → File
audioStream.pipe(opusDecoder).pipe(writeStream);
```

**Always clean up streams:**
```javascript
for (const [userId, streamInfo] of session.userAudioStreams) {
  try {
    if (streamInfo.stream) streamInfo.stream.destroy();
    if (streamInfo.decoder) streamInfo.decoder.destroy();
    if (streamInfo.writeStream) streamInfo.writeStream.end();
  } catch (error) {
    logger.warn(`Error closing stream for user ${userId}`, { error: error.message });
  }
}
```

## Service-Specific Guidelines

### Audio Recorder Service
- Store sessions in `Map<meetingId, RecordingSession>`
- Always include `guildId` in `getActiveRecordings()` return objects
- Use `session.startTime` for duration calculations, not derived properties
- Implement graceful shutdown in `shutdownAll()`

### MongoDB Service
- Use exponential backoff for connection retries
- Always validate input before database operations
- Return meaningful error messages
- Use transactions for multi-document updates

### Command Handlers
- Validate user permissions before execution
- Always defer replies for long-running operations
- Send user-friendly error messages (no stack traces to users)
- Use embed builders from `utils/embedBuilder.js`

### Event Handlers
- Keep event handlers lightweight
- Delegate complex logic to services
- Handle errors without crashing the bot
- Log all significant events

## Dependencies & Versions

**Critical dependencies (do NOT downgrade):**
- `discord.js`: ^14.16.3
- `@discordjs/voice`: ^0.19.0 (DAVE protocol support)
- `@discordjs/opus`: ^0.9.0 or `opusscript` (fallback)
- `@snazzah/davey`: ^0.1.8 (DAVE encryption)
- `sodium-native`: ^4.0.0
- `libsodium-wrappers`: ^0.7.13
- Node.js: 22.12.0+

## Common Pitfalls to Avoid

1. **Don't** use `selfDeaf: true` in voice connections (prevents receiving audio)
2. **Don't** forget to await `sodium.ready` before voice operations
3. **Don't** access `channelRecording.startTime` (doesn't exist, use `session.startTime`)
4. **Don't** use deprecated Mongoose connection options
5. **Don't** use `ephemeral` parameter (use `MessageFlags` instead)
6. **Don't** forget to include `guildId` when returning recording objects
7. **Don't** perform calculations that can result in NaN without validation
8. **Don't** expose sensitive data (tokens, API keys) in logs or responses

## Testing & Validation

When modifying code:
1. **Test voice connections** - Ensure bot joins and receives audio
2. **Test both manual and auto-stop** - Verify `/stop-recording` and empty channel detection
3. **Check logs** - No errors, warnings handled gracefully
4. **Verify database updates** - Check MongoDB for correct data
5. **Test edge cases** - User leaves/rejoins, multiple recordings, connection drops

## File Modification Guidelines

### When modifying audio recording:
- Always test with real voice channels
- Verify encryption negotiation succeeds
- Check PCM files are created in `recordings/`
- Ensure streams are properly closed

### When modifying commands:
- Update JSDoc if signature changes
- Test error cases (user not in voice, no permissions, etc.)
- Verify embed formatting and messages
- Check deferred reply handling

### When modifying database:
- Update schema documentation
- Add migration scripts if schema changes
- Test with existing data
- Verify indexes are appropriate

## Environment Variables

Required:
- `DISCORD_TOKEN` - Bot token from Discord Developer Portal
- `DISCORD_CLIENT_ID` - Application ID
- `MONGODB_URI` - MongoDB connection string
- `PERPLEXITY_API_KEY` - API key for AI summaries

Optional:
- `RECORDINGS_PATH` - Default: `./recordings`
- `LOG_LEVEL` - Default: `info` (debug, info, warn, error)

## AI Integration Notes

### Transcription Service
- **Current**: Placeholder implementation
- **Planned**: Whisper API integration
- When implementing: Use streaming for large files, handle multiple languages

### Perplexity Service
- Model: `llama-3.1-sonar-small-128k-online`
- Formats: Key points, action items, decisions
- Keep prompts under 120K tokens
- Handle rate limits gracefully

## Security & Privacy

- **Never log** user audio content or transcripts to console
- **Sanitize** user input before database queries
- **Validate** file paths to prevent directory traversal
- **Use** environment variables for all secrets
- **Implement** proper access control for recordings

## Performance Optimization

- Use streaming for large file operations
- Implement pagination for database queries
- Set memory limits for PM2 deployment (`--max-memory-restart 2G`)
- Clean up old recordings automatically (TTL indexes)
- Use connection pooling for MongoDB

## When Adding New Features

1. **Plan first**: Outline the feature and dependencies
2. **Check compatibility**: Ensure Discord.js version supports it
3. **Add logging**: Debug, info, and error levels appropriately
4. **Write tests**: At minimum, manual test checklist
5. **Update docs**: Add to README.md and TROUBLESHOOTING.md
6. **Handle errors**: Never crash the bot on feature failure

## Helpful Context

### Recent Issues Resolved
1. **DAVE encryption** - Upgraded @discordjs/voice to 0.19.0
2. **NaN duration** - Fixed by using session.startTime with validation
3. **No active recording** - Added guildId to getActiveRecordings()
4. **Opus decoder** - Added opusscript fallback for Node v23

### Known Limitations
- Transcription is placeholder (Whisper API not integrated)
- Per-user PCM files not merged into single MP3
- No automatic cleanup of old recordings
- Single-server deployment only (no horizontal scaling)

## Final Notes

- **Prioritize reliability** over features
- **Keep dependencies updated** for security
- **Log everything important** but not sensitive data
- **Handle Discord API changes** promptly
- **Test with real Discord servers** before deploying

When in doubt, refer to:
- [Discord.js Documentation](https://discord.js.org)
- [Mongoose Documentation](https://mongoosejs.com)
- `TROUBLESHOOTING.md` for common issues
