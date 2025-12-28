# Integration Guide

## Prerequisites

- Node.js 22.x
- MongoDB 6.x or higher  
- Discord.js 14.x
- Existing bot token and permissions
- Access to server terminal

---

## Step-by-Step Integration

### Phase 1: Bug Fixes (Apply First)

#### Step 1.1: Apply Bug Fix #1 (Duplicate Summary)

1. Open `src/commands/stop-recording.js`
2. Find the `processRecording` function around line 275-287
3. Replace the processing message update code with:

```javascript
const redirectEmbed = new EmbedBuilder()
  .setColor('#32B8C6')
  .setTitle('✅ Recording Processed Successfully')
  .setDescription(`Meeting summary and files posted below ⬇️`)
  .addFields({
    name: '📋 Meeting ID',
    value: `\`${meetingId}\``,
    inline: true,
  })
  .setTimestamp();

await processingMessage.edit({
  embeds: [redirectEmbed],
  content: null,
});
```

#### Step 1.2: Apply Bug Fix #2 (Duplicate Start Embed)

1. Open `src/commands/start-recording.js`
2. Find lines 97-108 (system channel notification)
3. Delete the entire try-catch block that sends to systemChannel
4. Save file

#### Step 1.3: Test Bug Fixes

```bash
npm start
# In Discord:
# 1. Use /start-recording - verify single embed
# 2. Use /stop-recording - verify single summary
```

---

### Phase 2: Feature Implementation

#### Step 2.1: Database Migration

Create migration script:

```bash
mkdir -p scripts
cat > scripts/migrate-guild-configs.js << 'EOF'
import 'dotenv/config';
import mongoose from 'mongoose';

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected');

    const db = mongoose.connection.db;
    
    // Create guildConfigs collection if not exists
    const collections = await db.listCollections({ name: 'guildconfigs' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('guildconfigs');
      console.log('✅ Guild configs collection created');
    }
    
    // Create index
    await db.collection('guildconfigs').createIndex(
      { guildId: 1 }, 
      { unique: true }
    );
    console.log('✅ Index created on guildId');
    
    console.log('✅ Migration complete');
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
EOF
```

Run migration:

```bash
node scripts/migrate-guild-configs.js
```

#### Step 2.2: Create New Model File

```bash
cat > src/models/GuildConfig.js << 'EOF'
# (Copy complete code from IMPLEMENTATION_5_FEATURE_6_ADMIN_CONFIG.md)
EOF
```

#### Step 2.3: Create Config Command

```bash
cat > src/commands/config.js << 'EOF'
# (Copy complete code from IMPLEMENTATION_5_FEATURE_6_ADMIN_CONFIG.md)
EOF
```

#### Step 2.4: Apply Feature #3 (DM Prompt)

Replace `src/events/voiceStateUpdate.js`:

```bash
# (Copy complete modified code from IMPLEMENTATION_2_FEATURE_3_DM_PROMPT.md)
```

#### Step 2.5: Apply Feature #4 (Auto-Stop)

1. Modify `src/services/audioRecorder.js`:
   - Add `emptyChannelTimer` and `isStopping` to recording session
   - Add `startEmptyChannelTimer()` and `cancelEmptyChannelTimer()` methods
   - Update `stopRecording()` to clear timer and check `isStopping` flag

2. Already integrated in voiceStateUpdate.js from Step 2.4

#### Step 2.6: Apply Feature #5 (Stop Button)

1. Modify `src/utils/embedBuilder.js`:
   - Update `createRecordingStartEmbed()` to return `{ embed, components }`

2. Modify `src/commands/start-recording.js`:
   - Add `executeStopRecording` import
   - Update embed creation
   - Add button collector
   - Track `startedBy` in meeting data

3. Modify `src/commands/stop-recording.js`:
   - Extract logic to `executeStopRecording()` function
   - Export function
   - Update to use redirect embed (Bug Fix #1)

#### Step 2.7: Apply Feature #6 (Admin Config)

1. Add GuildConfig model (Step 2.2)
2. Add config command (Step 2.3)
3. Modify `src/services/mongoService.js`:
   - Add GuildConfig import
   - Add helper methods: `getGuildConfig()`, `getNotificationChannel()`, `getUserDisplayName()`

4. Modify notification channel usage:
   - `src/commands/start-recording.js`: Use configured channel
   - `src/commands/stop-recording.js`: Send results to configured channel
   - `src/events/voiceStateUpdate.js`: Use configured channel for auto-stop

5. Modify transcript names:
   - `src/services/transcriptionService.js`: Check custom display names

---

### Phase 3: Deployment

#### Step 3.1: Environment Variables

Verify `.env` file has required variables:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
MONGODB_URI=mongodb://localhost:27017/teamtape
PERPLEXITY_API_KEY=your_perplexity_key
WHISPER_API_URL=http://localhost:7704
```

No new environment variables needed for these features.

#### Step 3.2: Register New Slash Commands

```bash
# Config command needs to be registered
npm start
# Bot will auto-register /config command on startup
```

Or manually:

```bash
node scripts/deploy-commands.js
```

#### Step 3.3: Restart Bot

```bash
# Development
npm start

# Production (PM2)
pm2 restart team-tape
pm2 logs team-tape
```

---

## Testing Checklist

### Bug Fixes
- [ ] Bug #1 Fixed: Summary appears exactly once
- [ ] Bug #2 Fixed: Start embed appears exactly once
- [ ] No regressions in existing functionality

### Feature #3: DM Prompt
- [ ] DM received when joining voice channel
- [ ] "Start Recording" button works
- [ ] "No Thanks" button dismisses message
- [ ] Handles DMs disabled gracefully
- [ ] Works with multiple users
- [ ] Cooldown prevents spam

### Feature #4: Auto-Stop
- [ ] Timer starts when channel becomes empty (30s)
- [ ] Timer cancels if user rejoins
- [ ] Recording stops after 30s empty
- [ ] Manual stop clears timer
- [ ] No duplicate stops
- [ ] Logs show timer events

### Feature #5: Stop Button
- [ ] Button appears in start embed
- [ ] Recording starter can click
- [ ] Admins can click
- [ ] Non-authorized users get error
- [ ] Button disables after use
- [ ] Stops recording correctly

### Feature #6: Admin Config
- [ ] `/config notification-channel` sets channel
- [ ] Notifications sent to configured channel
- [ ] `/config set-username` opens modal
- [ ] Custom names saved to database
- [ ] Transcripts use custom names
- [ ] `/config view` shows settings
- [ ] Non-admins can't use commands
- [ ] Fallback works if channel deleted

### Integration
- [ ] All features work together
- [ ] No console errors
- [ ] Logs are clean
- [ ] Database records correct
- [ ] Performance acceptable

---

## Rollback Procedure

If issues arise, rollback in reverse order:

### Rollback Feature #6
```bash
# Remove config command
rm src/commands/config.js

# Revert mongoService changes
git checkout src/services/mongoService.js

# Revert transcriptionService changes
git checkout src/services/transcriptionService.js

# Optional: Drop database collection
mongo teamtape --eval "db.guildconfigs.drop()"
```

### Rollback Feature #5
```bash
git checkout src/utils/embedBuilder.js
git checkout src/commands/start-recording.js
git checkout src/commands/stop-recording.js
```

### Rollback Feature #4
```bash
git checkout src/services/audioRecorder.js
git checkout src/events/voiceStateUpdate.js
```

### Rollback Feature #3
```bash
git checkout src/events/voiceStateUpdate.js
```

### Rollback Bug Fixes
```bash
git checkout src/commands/stop-recording.js
git checkout src/commands/start-recording.js
```

---

## Troubleshooting

### Issue: DM Prompt Not Sending

**Symptoms**: No DM received when joining voice channel

**Checks**:
- [ ] Bot has `DirectMessages` intent enabled
- [ ] User hasn't blocked bot
- [ ] Check logs for "Cannot send DM (DMs disabled)"
- [ ] Verify voiceStateUpdate event is firing

**Solution**:
```bash
# Check logs
pm2 logs team-tape --lines 100 | grep "DM"

# Verify intents in src/index.js
grep "DirectMessages" src/index.js
```

### Issue: Auto-Stop Not Working

**Symptoms**: Recording doesn't stop when channel empty

**Checks**:
- [ ] Timer logic in audioRecorder.js implemented
- [ ] voiceStateUpdate event listener active
- [ ] Channel member count calculation excludes bots
- [ ] Logs show timer start/cancel

**Solution**:
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm start

# Watch for timer events
pm2 logs team-tape | grep "timer"
```

### Issue: Stop Button Not Responding

**Symptoms**: Button click does nothing

**Checks**:
- [ ] Collector is set up correctly
- [ ] CustomId matches between button and collector
- [ ] Collector hasn't timed out
- [ ] Button interaction permissions

**Solution**:
```bash
# Check if interaction handler registered
grep "interactionCreate" src/index.js

# Verify button collector setup
grep "createMessageComponentCollector" src/commands/start-recording.js
```

### Issue: Config Commands Not Saving

**Symptoms**: Settings don't persist

**Checks**:
- [ ] MongoDB connection active
- [ ] guildConfigs collection exists
- [ ] Index on guildId
- [ ] mongoService methods implemented

**Solution**:
```bash
# Check MongoDB
mongo teamtape
> db.guildconfigs.find()
> db.guildconfigs.getIndexes()

# Check logs
pm2 logs team-tape | grep "config"
```

### Issue: Custom Names Not Appearing

**Symptoms**: Transcripts show Discord names, not custom names

**Checks**:
- [ ] Custom name saved in database
- [ ] transcriptionService queries database
- [ ] Correct guildId passed to lookup
- [ ] Fallback to Discord name if not found

**Solution**:
```bash
# Verify database entry
mongo teamtape
> db.guildconfigs.findOne({ guildId: "YOUR_GUILD_ID" })

# Check logs
pm2 logs team-tape | grep "custom.*name"
```

---

## Performance Monitoring

### Metrics to Watch

```bash
# CPU usage
pm2 monit

# Memory usage
pm2 status

# MongoDB performance
mongo teamtape --eval "db.serverStatus()"

# Log file size
du -h logs/discord-bot.log
```

### Optimization

If performance degrades:

1. **Reduce collector timeouts**: 24h → 1h for stop button
2. **Increase cooldown**: 5min → 10min for DM prompts
3. **Add indexes**: Ensure MongoDB indexes exist
4. **Clean old data**: Archive old meetings

---

## Production Deployment

### Recommended Sequence

1. **Test in development**: Complete all testing checklist items
2. **Create backup**: Backup MongoDB database
3. **Deploy during low-traffic**: Choose off-peak hours
4. **Monitor logs**: Watch for errors for first hour
5. **Rollback plan ready**: Have git hash of last known good state

### Deployment Script

```bash
#!/bin/bash
set -e

echo "🚀 Deploying TeamTape updates..."

# Backup database
echo "📦 Backing up database..."
mongodump --uri="$MONGODB_URI" --out="/tmp/teamtape-backup-$(date +%Y%m%d)"

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run migration
echo "🔄 Running database migration..."
node scripts/migrate-guild-configs.js

# Restart bot
echo "🔄 Restarting bot..."
pm2 restart team-tape

# Wait and check status
echo "⏳ Waiting for bot to start..."
sleep 5
pm2 status team-tape

echo "✅ Deployment complete!"
echo "📊 Monitor logs: pm2 logs team-tape"
```

---

## Maintenance

### Weekly Tasks
- [ ] Review error logs: `pm2 logs team-tape --err --lines 100`
- [ ] Check database size: `mongo teamtape --eval "db.stats()"`
- [ ] Verify backups exist
- [ ] Test core functionality (start/stop recording)

### Monthly Tasks
- [ ] Clean old recordings: Delete recordings older than 90 days
- [ ] Archive old meetings: Export to S3/backup
- [ ] Review performance metrics
- [ ] Update dependencies: `npm outdated`

### Quarterly Tasks
- [ ] Security audit
- [ ] Performance optimization review
- [ ] User feedback assessment
- [ ] Feature usage analysis

---

## Support & Documentation

### Log Patterns to Monitor

```bash
# Critical errors
pm2 logs team-tape | grep "ERROR"

# Auto-stop events
pm2 logs team-tape | grep "auto-stop"

# Timer-related
pm2 logs team-tape | grep "timer"

# Configuration changes
pm2 logs team-tape | grep "config"

# DM issues
pm2 logs team-tape | grep "DM"
```

### Useful Commands

```bash
# Restart bot
pm2 restart team-tape

# View real-time logs
pm2 logs team-tape --lines 50

# Check bot status
pm2 status team-tape

# Check MongoDB
mongo teamtape
> db.meetings.find().limit(5)
> db.guildconfigs.find()

# View active recordings
curl http://localhost:7705/api/v1/meetings/active
```

---

## Version History

### v1.0.0 - Initial Implementation
- Bug fixes for duplicate messages
- Feature #3: DM prompt on voice join
- Feature #4: Auto-stop when channel empty
- Feature #5: Stop button in embed
- Feature #6: Admin configuration system

---

## Post-Implementation Review

After 1 week of production use, review:

- [ ] Error rate (should be <1% of operations)
- [ ] User feedback (collect via Discord)
- [ ] Performance metrics (CPU, memory, DB)
- [ ] Feature adoption (how many users use DM prompt, etc.)
- [ ] Identify improvements

---

## Success Criteria

Deployment is successful if:

1. ✅ No critical errors in logs
2. ✅ All features work as expected
3. ✅ No performance degradation
4. ✅ Positive user feedback
5. ✅ Database integrity maintained
6. ✅ No regressions in existing functionality

---

## Contact & Escalation

If you encounter issues beyond this guide:

1. Check `TROUBLESHOOTING.md` in repository
2. Review GitHub Issues
3. Check Discord.js documentation
4. Review MongoDB documentation

---

## Final Checklist

Before marking deployment complete:

- [ ] All bug fixes applied
- [ ] All features implemented
- [ ] Migration script run successfully
- [ ] All tests passed
- [ ] No errors in logs
- [ ] Bot responding to commands
- [ ] Notifications working correctly
- [ ] Recordings working end-to-end
- [ ] Database records persisting
- [ ] Backup created
- [ ] Rollback plan documented
- [ ] Team notified of changes

---

## Conclusion

This integration guide covers the complete deployment of 2 bug fixes and 4 new features for TeamTape. Follow the steps sequentially, test thoroughly at each stage, and monitor closely post-deployment.

**Estimated Total Time**: 2-4 hours (including testing)

**Risk Level**: Low (all changes are backwards-compatible with fallbacks)

Good luck with your deployment! 🚀
