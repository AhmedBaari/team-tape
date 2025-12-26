# TeamTape Troubleshooting Guide

Common issues and solutions for TeamTape Discord bot.

## Voice Recording Issues

### Error: "No compatible encryption modes"

**Full error:**
```
No compatible encryption modes. Available include: aead_aes256_gcm_rtpsize, aead_xchacha20_poly1305_rtpsize
```

**Cause:** Missing voice encryption libraries required by @discordjs/voice.

**Solution:**

Install one or more encryption libraries:

```bash
# Best performance (recommended)
bun install sodium-native

# Alternative if sodium-native fails to compile
bun install libsodium-wrappers

# Fallback option (slowest)
bun install tweetnacl
```

**Verification:**

Check if encryption is available:
```javascript
import { generateDependencyReport } from '@discordjs/voice';
console.log(generateDependencyReport());
```

You should see:
```
Encryption Libraries
- sodium-native: found
- libsodium-wrappers: found
```

---

### Error: "Cannot play audio as no valid encryption package is installed"

**Solution:** Same as above - install sodium-native or libsodium-wrappers.

---

### Error: Opus libraries not found

**Full error:**
```
Opus Libraries: not found
```

**Solution:**

```bash
bun install @discordjs/opus
# or
bun install opusscript  # JavaScript fallback (slower)
```

---

### Error: FFmpeg not found

**Solution:**

**Option 1:** Install ffmpeg-static (npm package)
```bash
bun install ffmpeg-static
```

**Option 2:** Install FFmpeg globally

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
1. Download from https://ffmpeg.org/download.html
2. Add to PATH
3. Verify: `ffmpeg -version`

---

## MongoDB Issues

### Warning: "useNewUrlParser is a deprecated option"

**Cause:** These options are deprecated in MongoDB Node.js driver v4+.

**Solution:** Already fixed in latest code. These warnings are harmless and can be ignored, or update your code to remove these options:

```javascript
// Old (deprecated)
await mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// New (correct)
await mongoose.connect(uri, {
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
});
```

---

### Error: "MongoDB connection failed"

**Solutions:**

1. **Check MongoDB is running:**
   ```bash
   # Local MongoDB
   sudo systemctl status mongodb
   
   # Or start it
   sudo systemctl start mongodb
   ```

2. **Verify connection string:**
   ```bash
   # Local
   MONGODB_URI=mongodb://localhost:27017/teamtape
   
   # MongoDB Atlas
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/teamtape
   ```

3. **Check firewall/network:**
   ```bash
   # Test connection
   mongosh "$MONGODB_URI"
   ```

4. **MongoDB Atlas whitelist:**
   - Go to Atlas → Security → Network Access
   - Add your server IP or allow 0.0.0.0/0 (all IPs)

---

## Discord.js Issues

### DeprecationWarning: The ready event has been renamed to clientReady

**Cause:** Discord.js v15 will rename the 'ready' event.

**Current status:** Harmless warning - the 'ready' event still works in v14.

**Future fix (when upgrading to v15):**
```javascript
// Change this:
client.once('ready', () => { ... });

// To this:
client.once('clientReady', () => { ... });
```

---

### Warning: Supplying "ephemeral" for interaction response options is deprecated

**Solution:** Use `flags` instead:

```javascript
// Old (deprecated)
await interaction.deferReply({ ephemeral: true });

// New (correct)
import { MessageFlags } from 'discord.js';
await interaction.deferReply({ flags: MessageFlags.Ephemeral });
```

---

### Error: "Invalid token"

**Solutions:**

1. Verify token in .env:
   ```bash
   DISCORD_TOKEN=your_actual_bot_token_here
   ```

2. Regenerate token:
   - Go to Discord Developer Portal
   - Select your app → Bot
   - Click "Reset Token"
   - Update .env with new token

3. Check token format:
   - Should be long alphanumeric string
   - No quotes or extra spaces

---

### Bot not responding to slash commands

**Solutions:**

1. **Verify bot permissions:**
   - Bot needs `applications.commands` scope
   - Check OAuth2 URL includes this scope

2. **Re-register commands:**
   - Commands registered on bot startup
   - Restart bot to refresh
   - Wait 1-5 minutes for global commands to propagate

3. **Check bot has required permissions in server:**
   - Send Messages
   - Embed Links
   - Attach Files
   - Connect (voice)
   - Speak (voice)

4. **Guild-specific commands (faster testing):**
   ```javascript
   // Change in src/index.js
   await rest.put(
     Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
     { body: commands }
   );
   ```

---

## Installation Issues

### sodium-native compilation errors

**Common on Windows or systems without build tools.**

**Solutions:**

1. **Use libsodium-wrappers instead:**
   ```bash
   bun install libsodium-wrappers
   ```

2. **Install build tools (if you want sodium-native):**
   
   **Ubuntu:**
   ```bash
   sudo apt install build-essential python3
   ```
   
   **Windows:**
   - Install Visual Studio Build Tools
   - Or use WSL2
   
   **macOS:**
   ```bash
   xcode-select --install
   ```

---

### Module not found errors

**Solution:**

```bash
# Clean install
rm -rf node_modules
rm package-lock.json  # or bun.lockb
bun install

# Or
npm ci  # Clean install from lock file
```

---

## Runtime Issues

### High memory usage

**Causes:**
- Long recordings
- Many concurrent meetings
- Recording not properly stopped

**Solutions:**

1. **Increase PM2 memory limit:**
   ```bash
   pm2 start src/index.js --name team-tape --max-memory-restart 2G
   ```

2. **Monitor memory:**
   ```bash
   pm2 monit
   ```

3. **Implement recording cleanup:**
   - Auto-delete old recordings
   - Upload to cloud storage
   - Compress recordings

---

### Bot disconnects from voice after some time

**Solutions:**

1. **Check network stability**

2. **Increase keepalive:**
   ```javascript
   connection.on('stateChange', (oldState, newState) => {
     if (newState.status === 'disconnected') {
       // Attempt reconnect
     }
   });
   ```

3. **Monitor voice connection:**
   - Check logs for disconnect reasons
   - May be Discord rate limiting

---

### Transcription not working

**Cause:** Whisper integration is a placeholder in current code.

**Solution:** Implement actual Whisper API integration:

```bash
# Install whisper package
bun install openai  # For OpenAI Whisper API
# or
bun install whisper-node  # For local Whisper
```

See `src/services/transcriptionService.js` for integration points.

---

### Perplexity API errors

**Solutions:**

1. **Verify API key:**
   ```bash
   PERPLEXITY_API_KEY=your_actual_key_here
   ```

2. **Check API quota:**
   - Log into Perplexity account
   - Check usage limits

3. **Test API manually:**
   ```bash
   curl https://api.perplexity.ai/chat/completions \
     -H "Authorization: Bearer $PERPLEXITY_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"llama-3.1-sonar-small-128k-online","messages":[{"role":"user","content":"Test"}]}'
   ```

---

## Debugging Tips

### Enable verbose logging

```bash
# In .env
LOG_LEVEL=debug
```

### Check dependency report

Add to your code temporarily:
```javascript
import { generateDependencyReport } from '@discordjs/voice';
console.log(generateDependencyReport());
```

### Test voice connection manually

```javascript
import { joinVoiceChannel } from '@discordjs/voice';

const connection = joinVoiceChannel({
  channelId: 'YOUR_CHANNEL_ID',
  guildId: 'YOUR_GUILD_ID',
  adapterCreator: guild.voiceAdapterCreator,
});

console.log('Connection state:', connection.state.status);
```

### Monitor logs in real-time

```bash
# Development
npm run dev

# Production with PM2
pm2 logs team-tape --lines 100

# File logs
tail -f logs/combined.log
tail -f logs/error.log
```

---

## Getting Help

1. **Check logs:**
   ```bash
   cat logs/error.log
   ```

2. **GitHub Issues:**
   https://github.com/AhmedBaari/team-tape/issues

3. **Discord.js Documentation:**
   https://discord.js.org/

4. **Discord.js Voice Docs:**
   https://discord.js.org/docs/packages/voice/main

5. **Discord Developer Docs:**
   https://discord.com/developers/docs

---

## Quick Fixes Checklist

- [ ] All dependencies installed (`bun install`)
- [ ] Encryption library installed (sodium-native or libsodium-wrappers)
- [ ] FFmpeg installed or ffmpeg-static package
- [ ] @discordjs/opus installed
- [ ] .env file configured with all required values
- [ ] MongoDB running and accessible
- [ ] Discord bot token valid
- [ ] Bot has proper permissions in Discord server
- [ ] Node.js version >= 22.0.0
- [ ] Recordings directory exists and is writable

---

**Last Updated:** December 2025
