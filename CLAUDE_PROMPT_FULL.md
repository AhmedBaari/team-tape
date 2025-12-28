# COMPLETE CLAUDE OPUS 4.5 PROMPT
# Discord Voice Recording Bot: Bug Fixes & Feature Implementation

---

## 🎯 PRIMARY INSTRUCTION (EXECUTE FIRST - CRITICAL)

**CREATE THE FOLLOWING MARKDOWN FILES IN THE REPOSITORY ROOT:**

1. `IMPLEMENTATION_1_BUG_FIXES.md`
2. `IMPLEMENTATION_2_FEATURE_3_DM_PROMPT.md`
3. `IMPLEMENTATION_3_FEATURE_4_AUTO_STOP.md`
4. `IMPLEMENTATION_4_FEATURE_5_STOP_BUTTON.md`
5. `IMPLEMENTATION_5_FEATURE_6_ADMIN_CONFIG.md`
6. `IMPLEMENTATION_6_INTEGRATION_GUIDE.md`

### ⚠️ CRITICAL RULES:

- **DO NOT write ANY implementation details, code, or analysis in chat responses**
- **ALL analysis, code, explanations, and instructions MUST go into the markdown files above**
- **Each file must contain COMPLETE code (full files, never snippets)**
- **Maximum 800 lines per file** - if content exceeds this, split into IMPLEMENTATION_XA.md, IMPLEMENTATION_XB.md
- **After creating all files, respond in chat ONLY with**: "✅ Implementation files created successfully" + list of file names

---

## 📋 Mission Overview

You are a senior Discord bot architect tasked with resolving production bugs and implementing user experience enhancements for a voice recording bot built with Node.js 22, Discord.js v14, MongoDB, Whisper, and Perplexity API.

This is a multi-stage task requiring:
1. Bug analysis and fixes
2. New feature development
3. Database schema updates
4. Integration documentation

---

## 🐛 SECTION 1: CRITICAL BUG FIXES

### Bug #1: Duplicate Summary Messages
**Symptom**: Bot sends meeting recording summary 2 times instead of once  
**Expected**: Send summary exactly once per recording  
**File to Analyze**: `src/commands/stop-recording.js`

**Investigation Required**:
- Trace where summary is sent in `processRecording()` function
- Check if `processRecording()` is called multiple times
- Verify `channel.send()` calls for duplicate invocations
- Check if `processingMessage.edit()` also sends duplicate
- Identify root cause (race condition? multiple listeners? intentional multi-channel?)

---

### Bug #2: Duplicate Recording Started Embeds
**Symptom**: Bot sends "recording started" embed 2 times instead of once  
**Expected**: Send start notification exactly once per recording  
**File to Analyze**: `src/commands/start-recording.js`

**Investigation Required**:
- Trace where start embed is sent in execute function
- Check `interaction.editReply()` at line ~88
- Check `systemChannel.send()` at line ~92-96
- Identify if both are intentional (different channels?) or redundant
- Determine if user wants notification in both interaction reply AND system channel, or just one

---

## 🚀 SECTION 2: NEW FEATURES TO IMPLEMENT

### Feature #3: Voice Channel Join DM Prompt

**User Story**: When someone joins a voice channel, bot DMs them asking if they want to start recording

**Detailed Requirements**:
- Listen to `voiceStateUpdate` event in Discord client
- Detect when user joins a voice channel (oldState.channel === null && newState.channel !== null)
- Send DM to user with embed: "Would you like to start recording in [channel name]?"
- Include interactive buttons:
  - ✅ "Start Recording" (ButtonStyle.Success)
  - ❌ "No Thanks" (ButtonStyle.Secondary)
- "Start Recording" button → initiates recording in that voice channel (same logic as /start-recording)
- "No Thanks" button → dismisses message and disables buttons
- Handle edge cases:
  - User has DMs disabled → log warning, don't crash
  - Recording already active in that channel → send different message
  - Bot lacks permissions to join voice channel → inform user
  - Multiple users join simultaneously → each gets separate DM

**Discord.js Features to Use**:
- `client.on('voiceStateUpdate', ...)` event listener
- `ButtonBuilder` with `ButtonStyle.Success` and `ButtonStyle.Secondary`
- `ActionRowBuilder` for button layout
- `user.send()` for DM
- `interaction.createMessageComponentCollector()` for button clicks
- Set collector timeout to 5 minutes

**Files to Create**:
- `src/events/voiceJoinPrompt.js`

**Files to Modify**:
- `src/index.js` (add event listener registration)

---

### Feature #4: Auto-Stop Recording When Channel Empty

**User Story**: If no one is in the voice channel during recording, automatically stop after 30 seconds

**Detailed Requirements**:
- Monitor `voiceStateUpdate` events during active recordings
- When last person leaves voice channel (channel.members.size === 1 and that 1 is the bot):
  - Start 30-second countdown timer
  - Log: "Voice channel empty, auto-stop in 30 seconds"
- If someone rejoins before timer expires:
  - Cancel timer
  - Log: "User rejoined, canceling auto-stop"
- If timer completes (30 seconds with no one):
  - Automatically trigger stop-recording logic
  - Send notification: "Recording stopped automatically (channel empty for 30 seconds)"
  - Clean up recording session
  - Process recording normally (transcription + summary)

**Implementation Considerations**:
- Store timer reference in recording session object: `session.emptyChannelTimer`
- Clear timer on manual stop: `clearTimeout(session.emptyChannelTimer)`
- Handle race conditions:
  - Manual stop during countdown → clear timer
  - User joins during auto-stop execution → don't start duplicate recordings
- Don't count bot itself as participant when checking if channel is empty
- Log all timer events for debugging

**Files to Modify**:
- `src/services/audioRecorder.js` (add timer logic to recording session)
- `src/events/voiceStateUpdate.js` (create if doesn't exist)
- `src/commands/stop-recording.js` (ensure timer cleanup on manual stop)

---

### Feature #5: Stop Button in Recording Started Embed

**User Story**: Add a "Stop Recording" button to the "recording started" message for easy access

**Detailed Requirements**:
- Modify `createRecordingStartEmbed()` to return both embed AND button row
- Button configuration:
  - Label: "🛑 Stop Recording"
  - Style: `ButtonStyle.Danger`
  - CustomId: `stop_recording_${meetingId}_${timestamp}`
- Button click behavior:
  - Check permissions: Only user who started recording OR server admins can click
  - If unauthorized: Send ephemeral message "You don't have permission to stop this recording"
  - If authorized: Trigger stop-recording logic (same as /stop-recording command)
  - Disable button after click
  - Update embed to show "Recording stopped by [username]"
- Use interaction collector with:
  - Filter: Check user permissions
  - Timeout: 24 hours (or until recording manually stopped)
  - On collect: Execute stop logic
  - On end: Disable button

**Discord.js Features to Use**:
- `ButtonBuilder` with `customId` and `ButtonStyle.Danger`
- `ActionRowBuilder` for component layout
- `message.createMessageComponentCollector()` with filter
- `button.setDisabled(true)` after interaction
- `PermissionsBitField.Flags.Administrator` for admin check

**Files to Modify**:
- `src/utils/embedBuilder.js` (modify createRecordingStartEmbed to return components)
- `src/commands/start-recording.js` (attach button row, set up collector)
- `src/commands/stop-recording.js` (extract stop logic to reusable function)

---

### Feature #6: Admin Configuration System

**User Story**: Admins can configure notification channel and custom user display names

---

#### Part A: Set Notification Channel

**Requirements**:
- Slash command: `/config notification-channel`
- Shows channel select menu with all text channels in guild
- Admin selects channel from dropdown
- Stores channel ID in MongoDB (guild-level config)
- All recording notifications (start, stop, summary) sent to configured channel instead of systemChannel
- If no channel configured: fall back to systemChannel behavior

**Command Options**:
```javascript
.addChannelOption(option =>
  option
    .setName('channel')
    .setDescription('Channel for recording notifications')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(true)
)
```

**Permission Check**: `PermissionsBitField.Flags.Administrator`

---

#### Part B: Set User Display Names

**Requirements**:
- Slash command: `/config set-username`
- Command options:
  - `user` (UserOption) - User to set custom name for
  - Opens modal after command with TextInput:
    - Label: "Custom Display Name"
    - Placeholder: Current Discord username
    - MaxLength: 32
    - Required: true
- Stores mapping: `userId → custom display name` in MongoDB
- Transcription service uses custom names instead of Discord displayName
- If no custom name set: use Discord displayName as fallback

**Modal Implementation**:
```javascript
const modal = new ModalBuilder()
  .setCustomId(`set_username_${userId}`)
  .setTitle('Set Custom Username')
  .addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('username_input')
        .setLabel('Custom Display Name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(user.displayName)
        .setMaxLength(32)
        .setRequired(true)
    )
  );
```

**Permission Check**: `PermissionsBitField.Flags.Administrator`

---

#### Database Schema Addition

**Collection**: `guildConfigs`

```javascript
{
  guildId: String,              // Primary key
  notificationChannelId: String, // Channel ID for notifications
  userNameMappings: {
    [userId: String]: String    // userId -> custom display name
  },
  createdAt: Date,
  updatedAt: Date
}
```

**MongoDB Operations Needed**:
- `getGuildConfig(guildId)` - Fetch config or return defaults
- `setNotificationChannel(guildId, channelId)` - Update channel
- `setUserDisplayName(guildId, userId, displayName)` - Update user mapping
- `getUserDisplayName(guildId, userId)` - Get custom name or null

---

#### Integration Points

**Files to Modify**:
1. `src/services/mongoService.js` - Add guild config methods
2. `src/commands/start-recording.js` - Use config channel instead of systemChannel
3. `src/commands/stop-recording.js` - Use config channel for summary
4. `src/services/transcriptionService.js` - Check custom names before using Discord displayName

**Files to Create**:
1. `src/commands/config.js` - Main config command with subcommands
2. `src/services/configService.js` - Helper service for config operations

---

## 📐 IMPLEMENTATION GUIDELINES

### Code Quality Requirements

**Error Handling**:
- Wrap ALL Discord API calls in try-catch blocks
- Provide user-friendly error messages
- Log errors with contextual data (userId, guildId, meetingId)
- Never crash the bot - graceful degradation

**Logging Standards**:
```javascript
logger.info('Action performed', { meetingId, userId, context });
logger.warn('Non-critical issue', { issue, fallback });
logger.error('Critical error', { error: error.message, stack: error.stack });
```

**Validation Checklist**:
- [ ] Check user permissions before executing
- [ ] Verify channel/guild still exists before sending
- [ ] Confirm recording session is active
- [ ] Validate user input (modal text, command options)
- [ ] Handle race conditions (concurrent stops, timer conflicts)

**Resource Cleanup**:
- Remove event listeners when done
- Clear timers: `clearTimeout()`, `clearInterval()`
- Close collectors: `collector.stop()`
- Disable buttons after use: `button.setDisabled(true)`

---

### Discord.js Best Practices

**Interaction Handling**:
```javascript
// For operations >3 seconds
await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// Ephemeral for error messages
await interaction.reply({ 
  content: 'Error message', 
  flags: MessageFlags.Ephemeral 
});
```

**CustomId Format**:
```javascript
// Use consistent format: action_identifier_timestamp
const customId = `stop_recording_${meetingId}_${Date.now()}`;
```

**Collector Best Practices**:
```javascript
const collector = message.createMessageComponentCollector({
  filter: i => i.user.id === authorizedUserId,
  time: 300000, // 5 minutes
  max: 1        // Stop after first interaction
});

collector.on('collect', async i => { /* handle */ });
collector.on('end', () => { /* cleanup */ });
```

**Permission Checks**:
```javascript
if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
  return interaction.reply({ 
    content: 'You need Administrator permission',
    flags: MessageFlags.Ephemeral 
  });
}
```

---

## 📤 FILE STRUCTURE REQUIREMENTS

### IMPLEMENTATION_1_BUG_FIXES.md

```markdown
# Bug Fixes Implementation

## Bug #1: Duplicate Summary Messages

### Root Cause Analysis
[File path and exact line numbers where duplication occurs]
[Explanation of WHY it sends twice - intentional? bug?]

### Solution
[Complete code fix - show full function with changes]
[Explanation of how fix prevents duplication]

### Files Modified
- `src/commands/stop-recording.js` - Lines X-Y

### Testing Steps
1. Start recording in voice channel
2. Stop recording
3. Verify summary appears ONCE in channel
4. Check logs for duplicate send attempts

---

## Bug #2: Duplicate Recording Started Embeds

### Root Cause Analysis
[File path and exact line numbers]
[Explanation - is systemChannel.send() needed?]

### Solution
[Complete code fix]
[Rationale for removal/modification]

### Files Modified
- `src/commands/start-recording.js` - Lines X-Y

### Testing Steps
1. Use /start-recording command
2. Verify embed appears ONCE
3. Check both interaction reply and system channel
4. Confirm no duplicate embeds
```

---

### IMPLEMENTATION_2_FEATURE_3_DM_PROMPT.md

```markdown
# Feature #3: Voice Channel Join DM Prompt

## Implementation Overview
[1-2 paragraph description of approach]

## Files to Create

### 1. src/events/voiceJoinPrompt.js
[COMPLETE FILE CONTENT - full code with JSDoc]

## Files to Modify

### 1. src/index.js
[Show full modified sections with surrounding context]
[Line numbers where changes occur]

## Database Changes
[None for this feature]

## Environment Variables
[None needed]

## Testing Procedure

### Manual Test Steps
1. Join a voice channel
2. Check DMs - should receive prompt
3. Click "Start Recording" - verify recording starts
4. Join another channel, click "No Thanks" - verify message dismisses
5. Join channel with active recording - verify different message

### Edge Cases to Test
- User has DMs disabled
- Bot lacks voice permissions
- Multiple users join simultaneously
- User leaves before clicking button

### Expected Logs
[Example log output for success case]
[Example log output for error cases]
```

---

### IMPLEMENTATION_3_FEATURE_4_AUTO_STOP.md

```markdown
# Feature #4: Auto-Stop Recording When Channel Empty

## Implementation Overview
[Description of timer-based approach]

## Files to Modify

### 1. src/services/audioRecorder.js

#### Changes Required
[Detailed list of modifications]

#### Complete Modified Code
[FULL FILE CONTENT with changes integrated]

### 2. src/events/voiceStateUpdate.js

[If file exists: show modifications]
[If file doesn't exist: show complete new file]

#### Complete Code
[FULL FILE CONTENT]

### 3. src/commands/stop-recording.js

#### Changes Required
[Add timer cleanup in stopRecording function]

#### Modified Section
[Show relevant function with changes]

## Logic Flow Diagram

```
User leaves channel
  ↓
Check: Is this last person? (excluding bot)
  ↓ YES
Start 30s timer
  ↓
Check every second: Did someone rejoin?
  ↓ NO (30s elapsed)
Trigger auto-stop
  ↓
Process recording normally
```

## Testing Procedure

### Test Case 1: Normal Auto-Stop
1. Start recording with 2 people
2. Person A leaves
3. Wait 30 seconds
4. Verify recording stops automatically
5. Verify summary is generated

### Test Case 2: Rejoin Before Timer
1. Start recording with 2 people
2. Person A leaves (timer starts)
3. Wait 15 seconds
4. Person A rejoins
5. Verify timer is cancelled
6. Recording continues

### Test Case 3: Manual Stop During Timer
1. Start recording with 2 people
2. Person A leaves (timer starts)
3. Wait 10 seconds
4. Use /stop-recording
5. Verify timer is cleared
6. No duplicate stop execution

### Expected Logs
[Example log output for each test case]
```

---

### IMPLEMENTATION_4_FEATURE_5_STOP_BUTTON.md

```markdown
# Feature #5: Stop Button in Recording Started Embed

## Implementation Overview
[Description of button + collector approach]

## Files to Modify

### 1. src/utils/embedBuilder.js

#### Changes Required
- Modify `createRecordingStartEmbed()` to return object with embed + components
- Keep function signature compatible with existing usage

#### Complete Modified Code
[FULL FILE CONTENT]

### 2. src/commands/start-recording.js

#### Changes Required
- Update embed creation to handle new return format
- Add button row to reply
- Set up message component collector
- Handle button click interactions

#### Complete Modified Code
[FULL FILE CONTENT]

### 3. src/commands/stop-recording.js

#### Changes Required
- Extract stop logic into reusable function
- Export function for use by button handler

#### New Function
```javascript
/**
 * Shared stop recording logic
 * Can be called by command or button interaction
 */
export async function executeStopRecording(guildId, channel, initiatorId) {
  // Full implementation
}
```

#### Complete Modified Code
[FULL FILE CONTENT]

## Permission Logic

```javascript
function canStopRecording(interaction, recordingStarterId) {
  // Is recording starter
  if (interaction.user.id === recordingStarterId) return true;
  
  // Is administrator
  if (interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }
  
  return false;
}
```

## Testing Procedure

### Test Case 1: Authorized Stop
1. User A starts recording
2. Click stop button as User A
3. Verify recording stops
4. Verify button disables

### Test Case 2: Admin Stop
1. User A starts recording
2. Click stop button as Admin User B
3. Verify recording stops
4. Verify button disables

### Test Case 3: Unauthorized Stop
1. User A starts recording
2. Click stop button as non-admin User C
3. Verify ephemeral error message
4. Verify recording continues
5. Verify button remains enabled

### Test Case 4: Button Timeout
1. Start recording
2. Wait 24 hours (or modify timeout for testing)
3. Verify button disables automatically

### Expected Logs
[Example log output]
```

---

### IMPLEMENTATION_5_FEATURE_6_ADMIN_CONFIG.md

```markdown
# Feature #6: Admin Configuration System

## Implementation Overview
[Description of config system architecture]

## Database Schema

### Collection: guildConfigs

```javascript
{
  _id: ObjectId,
  guildId: String,              // Index this field
  notificationChannelId: String,
  userNameMappings: {
    "userId1": "Custom Name 1",
    "userId2": "Custom Name 2"
  },
  createdAt: Date,
  updatedAt: Date
}
```

### MongoDB Indexes
```javascript
db.guildConfigs.createIndex({ guildId: 1 }, { unique: true });
```

## Files to Create

### 1. src/commands/config.js

[COMPLETE FILE CONTENT - full slash command with subcommands]

```javascript
// Structure:
// /config notification-channel <channel>
// /config set-username <user>
```

### 2. src/services/configService.js

[COMPLETE FILE CONTENT - helper functions for config operations]

Functions to include:
- `getGuildConfig(guildId)`
- `setNotificationChannel(guildId, channelId)`
- `setUserDisplayName(guildId, userId, displayName)`
- `getUserDisplayName(guildId, userId)`

## Files to Modify

### 1. src/services/mongoService.js

#### Add Guild Config Methods

[Show new functions to add]

[FULL FILE CONTENT with additions]

### 2. src/commands/start-recording.js

#### Changes Required
- Use configured notification channel instead of systemChannel
- Fall back to systemChannel if no config

#### Modified Section
[Show relevant code changes]

### 3. src/commands/stop-recording.js

#### Changes Required
- Use configured notification channel for summary
- Fall back to systemChannel if no config

#### Modified Section
[Show relevant code changes]

### 4. src/services/transcriptionService.js

#### Changes Required
- Check for custom display name before using Discord displayName
- In `transcribePerUser()` function

#### Modified Section
```javascript
// Before
const username = userMap.get(userId) || this.getUserName(userId) || userId;

// After
const username = await configService.getUserDisplayName(guildId, userId)
  || userMap.get(userId) 
  || this.getUserName(userId) 
  || userId;
```

## Modal Implementation Details

### Set Username Modal

```javascript
const modal = new ModalBuilder()
  .setCustomId(`set_username_${interaction.user.id}_${Date.now()}`)
  .setTitle('Set Custom Username');

const usernameInput = new TextInputBuilder()
  .setCustomId('username_input')
  .setLabel('Custom Display Name')
  .setStyle(TextInputStyle.Short)
  .setPlaceholder(targetUser.displayName)
  .setMaxLength(32)
  .setRequired(true);

const actionRow = new ActionRowBuilder().addComponents(usernameInput);
modal.addComponents(actionRow);

await interaction.showModal(modal);

// Listen for modal submit
client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith('set_username_')) return;
  
  const customName = interaction.fields.getTextInputValue('username_input');
  // Save to database
});
```

## Testing Procedure

### Part A: Notification Channel

#### Test Case 1: Set Channel
1. Admin runs `/config notification-channel #recordings`
2. Verify success message
3. Start and stop recording
4. Verify notifications appear in #recordings
5. Verify no notification in systemChannel

#### Test Case 2: Non-Admin Attempt
1. Non-admin runs `/config notification-channel #test`
2. Verify permission denied error

#### Test Case 3: Deleted Channel
1. Set notification channel to #temp
2. Delete #temp channel
3. Start recording
4. Verify fallback to systemChannel
5. Verify warning in logs

### Part B: Custom Usernames

#### Test Case 1: Set Username
1. Admin runs `/config set-username @User123`
2. Modal appears with current name
3. Enter "Custom Name"
4. Submit modal
5. Verify success message
6. Record meeting with that user
7. Verify transcript shows "Custom Name"

#### Test Case 2: Unicode/Special Characters
1. Set username to "User™ 💎"
2. Verify it saves and displays correctly
3. Check transcript formatting

#### Test Case 3: Max Length
1. Enter 33 characters in modal
2. Verify modal prevents submission
3. Enter exactly 32 characters
4. Verify it saves successfully

### Expected Database State

After running both commands:
```javascript
{
  guildId: "1234567890",
  notificationChannelId: "9876543210",
  userNameMappings: {
    "111111": "Custom Name",
    "222222": "Another User"
  },
  createdAt: ISODate("2025-12-28T..."),
  updatedAt: ISODate("2025-12-28T...")
}
```

### Expected Logs
[Example log output for each operation]
```

---

### IMPLEMENTATION_6_INTEGRATION_GUIDE.md

```markdown
# Integration Guide

## Prerequisites

- Node.js 22.x
- MongoDB 6.x or higher
- Discord.js 14.x
- Existing bot token and permissions

## Step-by-Step Integration

### Phase 1: Bug Fixes (Apply First)

#### Step 1.1: Apply Bug Fix #1
1. Open `src/commands/stop-recording.js`
2. Locate the code section identified in IMPLEMENTATION_1
3. Apply the fix for duplicate summary messages
4. Save file

#### Step 1.2: Apply Bug Fix #2
1. Open `src/commands/start-recording.js`
2. Locate the code section identified in IMPLEMENTATION_1
3. Apply the fix for duplicate start embeds
4. Save file

#### Step 1.3: Test Bug Fixes
```bash
npm start
# In Discord:
# 1. Use /start-recording
# 2. Verify single embed
# 3. Use /stop-recording
# 4. Verify single summary
```

---

### Phase 2: Feature Implementation

#### Step 2.1: Install Dependencies (if any new ones)
```bash
npm install
# Check package.json for new dependencies
```

#### Step 2.2: Database Migration
```bash
# Run MongoDB migration script
node scripts/migrate-guild-configs.js
```

Migration script content:
```javascript
// scripts/migrate-guild-configs.js
import mongoService from './src/services/mongoService.js';

async function migrate() {
  await mongoService.connect();
  const db = mongoService.getDatabase();
  
  // Create guildConfigs collection if not exists
  await db.createCollection('guildConfigs');
  
  // Create index
  await db.collection('guildConfigs').createIndex(
    { guildId: 1 }, 
    { unique: true }
  );
  
  console.log('✅ Guild configs collection created');
  await mongoService.close();
}

migrate().catch(console.error);
```

#### Step 2.3: Apply Feature #3 (DM Prompt)
1. Create `src/events/voiceJoinPrompt.js` with code from IMPLEMENTATION_2
2. Modify `src/index.js` as shown in IMPLEMENTATION_2
3. Test: Join voice channel, verify DM received

#### Step 2.4: Apply Feature #4 (Auto-Stop)
1. Modify `src/services/audioRecorder.js` as shown in IMPLEMENTATION_3
2. Create/modify `src/events/voiceStateUpdate.js` as shown in IMPLEMENTATION_3
3. Modify `src/commands/stop-recording.js` for timer cleanup
4. Test: Leave channel empty for 30s, verify auto-stop

#### Step 2.5: Apply Feature #5 (Stop Button)
1. Modify `src/utils/embedBuilder.js` as shown in IMPLEMENTATION_4
2. Modify `src/commands/start-recording.js` as shown in IMPLEMENTATION_4
3. Modify `src/commands/stop-recording.js` as shown in IMPLEMENTATION_4
4. Test: Click stop button, verify recording stops

#### Step 2.6: Apply Feature #6 (Admin Config)
1. Create `src/commands/config.js` with code from IMPLEMENTATION_5
2. Create `src/services/configService.js` with code from IMPLEMENTATION_5
3. Modify `src/services/mongoService.js` as shown in IMPLEMENTATION_5
4. Modify other files as listed in IMPLEMENTATION_5
5. Test: Run /config commands, verify settings persist

---

### Phase 3: Deployment

#### Step 3.1: Environment Variables

Add to `.env` (if any new variables needed):
```env
# No new environment variables required for these features
```

#### Step 3.2: Register New Slash Commands

```bash
# If /config is new command, register it
node scripts/deploy-commands.js
```

#### Step 3.3: Restart Bot

```bash
# Stop current instance
pm2 stop discord-bot

# Start with new code
pm2 start discord-bot
pm2 logs discord-bot
```

---

## Testing Checklist

Copy this checklist and mark items as you test:

### Bug Fixes
- [ ] Bug #1 Fixed: Summary sends exactly once
- [ ] Bug #2 Fixed: Start embed sends exactly once
- [ ] No regressions in existing recording functionality

### Feature #3: DM Prompt
- [ ] DM received when joining voice channel
- [ ] "Start Recording" button works
- [ ] "No Thanks" button dismisses message
- [ ] Handles DMs disabled gracefully
- [ ] Works with multiple users joining
- [ ] Doesn't spam if user switches channels

### Feature #4: Auto-Stop
- [ ] Timer starts when channel becomes empty
- [ ] Timer cancels if user rejoins
- [ ] Recording stops after 30s empty
- [ ] Manual stop clears timer
- [ ] No duplicate stops
- [ ] Logs show timer events

### Feature #5: Stop Button
- [ ] Button appears in start embed
- [ ] Recording starter can click button
- [ ] Admins can click button
- [ ] Non-authorized users get error
- [ ] Button disables after use
- [ ] Stops recording correctly

### Feature #6: Admin Config
- [ ] /config notification-channel sets channel
- [ ] Notifications sent to configured channel
- [ ] /config set-username opens modal
- [ ] Custom names saved to database
- [ ] Transcripts use custom names
- [ ] Non-admins can't use commands
- [ ] Fallback works if channel deleted

### Integration
- [ ] All features work together
- [ ] No console errors
- [ ] Logs are clean and informative
- [ ] Database records correct
- [ ] Performance is acceptable

---

## Rollback Procedure

If issues arise, rollback in reverse order:

### Rollback Feature #6
1. Delete `src/commands/config.js`
2. Delete `src/services/configService.js`
3. Revert changes to `src/services/mongoService.js`
4. Revert changes to transcription service
5. Drop `guildConfigs` collection (optional)

### Rollback Feature #5
1. Revert `src/utils/embedBuilder.js`
2. Revert `src/commands/start-recording.js`
3. Revert `src/commands/stop-recording.js`

### Rollback Feature #4
1. Revert `src/services/audioRecorder.js`
2. Delete/revert `src/events/voiceStateUpdate.js`
3. Revert `src/commands/stop-recording.js`

### Rollback Feature #3
1. Delete `src/events/voiceJoinPrompt.js`
2. Revert `src/index.js`

### Rollback Bug Fixes
1. Revert `src/commands/stop-recording.js`
2. Revert `src/commands/start-recording.js`

---

## Troubleshooting

### Issue: DM Prompt Not Sending
**Check**:
- Bot has DM permissions
- User hasn't blocked bot
- Check logs for errors
- Verify voiceStateUpdate event is firing

### Issue: Auto-Stop Not Working
**Check**:
- Timer logic in audioRecorder.js
- voiceStateUpdate event listener active
- Channel member count calculation
- Logs for timer start/cancel events

### Issue: Stop Button Not Responding
**Check**:
- Collector is set up correctly
- CustomId matches between button and collector
- Collector hasn't timed out
- Button interaction permissions

### Issue: Config Commands Not Saving
**Check**:
- MongoDB connection
- guildConfigs collection exists
- Index on guildId
- mongoService methods implemented
- Logs for database errors

---

## Performance Considerations

### Monitoring
- Watch for increased CPU usage from collectors
- Monitor MongoDB query performance
- Check memory usage for timer references
- Log response times for modal interactions

### Optimization
- Set reasonable collector timeouts
- Clear timers properly to prevent leaks
- Use indexes on MongoDB queries
- Batch config reads where possible

---

## Support & Maintenance

### Logs to Monitor
```bash
# Watch for these log patterns:
grep "duplicate" logs/discord-bot.log
grep "auto-stop" logs/discord-bot.log
grep "timer" logs/discord-bot.log
grep "config" logs/discord-bot.log
```

### Regular Checks
- Weekly: Review error logs
- Monthly: Check database size (guildConfigs growth)
- Quarterly: Audit permissions and access

---

## Version History

- v1.0.0 - Initial implementation
  - Bug fixes for duplicate messages
  - Feature #3: DM prompt
  - Feature #4: Auto-stop
  - Feature #5: Stop button
  - Feature #6: Admin config
```

---

## Environment Variables

No new environment variables required. All existing variables remain:
- `DISCORD_TOKEN`
- `MONGODB_URI`
- `WHISPER_API_URL`
- `PERPLEXITY_API_KEY`

---

## Dependencies

No new npm packages required. All features use existing dependencies:
- discord.js v14 (already installed)
- mongodb (already installed)

---

## Post-Implementation Review

After 1 week of production use:
- [ ] Review error logs
- [ ] Check user feedback
- [ ] Monitor performance metrics
- [ ] Assess feature adoption
- [ ] Identify improvements
```

---

## 🎯 EXECUTION CHECKLIST FOR CLAUDE

Before writing ANY response:

1. [ ] Have I created all 6 markdown files?
2. [ ] Does each file contain COMPLETE code (not snippets)?
3. [ ] Is each file under 800 lines?
4. [ ] Have I included testing procedures in each file?
5. [ ] Did I avoid writing implementation details in chat?

**Your ONLY chat response should be:**
```
✅ Implementation files created successfully:
- IMPLEMENTATION_1_BUG_FIXES.md
- IMPLEMENTATION_2_FEATURE_3_DM_PROMPT.md
- IMPLEMENTATION_3_FEATURE_4_AUTO_STOP.md
- IMPLEMENTATION_4_FEATURE_5_STOP_BUTTON.md
- IMPLEMENTATION_5_FEATURE_6_ADMIN_CONFIG.md
- IMPLEMENTATION_6_INTEGRATION_GUIDE.md

All files contain complete implementations, testing procedures, and integration steps.
```

---

## 📚 Context Files for Analysis

Examine these files before creating implementations:

**For Bug Analysis**:
- `src/commands/start-recording.js` - Bug #2 location
- `src/commands/stop-recording.js` - Bug #1 location

**For Feature Development**:
- `src/services/audioRecorder.js` - Recording session management
- `src/services/mongoService.js` - Database operations
- `src/services/transcriptionService.js` - Speaker identification
- `src/utils/embedBuilder.js` - Embed creation
- `src/index.js` - Main bot initialization

**Understand Existing Patterns**:
- How commands are structured
- How MongoDB operations work
- How logging is implemented
- How error handling is done
- Code style and naming conventions

---

# BEGIN FILE CREATION NOW

Create all 6 implementation markdown files with complete, production-ready code.

DO NOT write analysis or code in chat.
DO NOT provide partial snippets.
DO provide full file contents in the markdown files.

Start creating the files immediately.
