# 🎙️ TeamTape

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-blue)](https://discord.js.org/)
![Status](https://img.shields.io/badge/status-production%20ready-brightgreen)

**TeamTape** is a professional Discord bot for automatic meeting recording, transcription, and AI-powered summaries. Designed for teams using Discord for synchronous meetings.

## ✨ Features

### 🎤 Voice Recording
- **Auto-join voice channels** - Automatically joins when 2+ users are present
- **Multi-user audio capture** - Records all participants simultaneously
- **High-quality MP3** - 128kbps balanced quality and file size
- **Speaker identification** - Maps Discord IDs to participant names
- **Seamless integration** - Works with existing Discord voice channels

### 📝 Transcription
- **Local Whisper support** - Self-hosted transcription (configurable)
- **Speaker diarization** - Identifies who spoke and when
- **Timestamp mapping** - Precise timing for each speaker turn
- **Multi-language ready** - Extensible for multiple languages

### 🤖 AI-Powered Summaries
- **Perplexity API integration** - Advanced LLM-based analysis
- **Executive summaries** - 3-5 line key takeaways
- **Action item extraction** - Identifies tasks and assignments
- **Key discussion points** - Bullet-point summaries
- **Innovation tracking** - Extracts new ideas discussed

### 💾 Data Management
- **MongoDB storage** - Complete meeting history and metadata
- **Participant tracking** - Duration, deafened status, speaking time
- **Discord archival** - Posts results to configured text channel
- **Error resilience** - Graceful handling of API failures

### ⚙️ Operations
- **Slash commands** - Discord's native command interface
- **Real-time status** - View active recordings and participants
- **Configuration management** - Customizable settings per guild
- **Comprehensive logging** - Winston-based structured logging

## 🚀 Quick Start

### Prerequisites

- **Node.js 22.x LTS** or higher
- **MongoDB 5.0+** (local or Atlas)
- **Discord bot token** ([Get one](https://discord.com/developers/applications))
- **Perplexity API key** ([Create account](https://www.perplexity.ai))
- **FFmpeg** - For audio encoding

```bash
# macOS (Homebrew)
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows (Chocolatey)
choco install ffmpeg
```

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/AhmedBaari/team-tape.git
cd team-tape
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Set up user mappings** (optional)

```bash
cp config/userMappings.example.json config/userMappings.json
# Edit with Discord user IDs and display names
```

5. **Start the bot**

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

## 📋 Configuration

### Environment Variables (.env)

```env
# Discord Bot
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here  # For testing

# Perplexity API
PERPLEXITY_API_KEY=pplx-your-key-here
PERPLEXITY_MODEL=llama-3.1-sonar-large-128k-online

# MongoDB
MONGODB_URI=mongodb://localhost:27017/teamtape

# Application
NODE_ENV=development
LOG_LEVEL=info

# Paths
RECORDINGS_PATH=./recordings
LOGS_PATH=./logs

# Recording Settings
BITRATE=128
RECORDING_FORMAT=mp3
MIN_PARTICIPANTS=2
STOP_DELAY_SECONDS=60
```

### User Mappings (config/userMappings.json)

Map Discord user IDs to display names for speaker identification:

```json
{
  "123456789012345678": "John Doe",
  "987654321098765432": "Jane Smith",
  "111222333444555666": "Alex Johnson"
}
```

## 🎮 Usage

### Commands

#### `/start-recording`
Begins recording the voice channel

```
/start-recording
/start-recording title: "Q4 Planning Meeting"
```

**Requirements:**
- User in voice channel
- Minimum 2 participants
- No active recording in channel

#### `/stop-recording`
Stops the current recording and processes results

```
/stop-recording
```

**Processing Pipeline:**
1. Finalizes audio file
2. Transcribes with speaker labels
3. Generates AI summary
4. Uploads to Discord channel
5. Stores in MongoDB

## 📊 MongoDB Schema

### Meeting Document

```javascript
{
  meetingId: "mtg_a1b2c3d4",
  startTimestamp: Date,
  endTimestamp: Date,
  duration: 3600, // seconds
  channelId: "123456789",
  channelName: "meeting-room",
  guildId: "987654321",
  guildName: "Team Server",
  participants: [
    {
      userId: "111222333",
      username: "John Doe",
      joinedAt: Date,
      leftAt: Date,
      duration: 3600,
      wasDeafened: false,
      speakingTime: 1200
    }
  ],
  transcript: "[00:00:00] John: Hello everyone...",
  summary: {
    executiveSummary: "Team discussed Q4 goals...",
    keyPoints: ["Point 1", "Point 2"],
    actionItems: [
      {
        task: "Finish documentation",
        assignee: "Jane Smith"
      }
    ],
    innovations: ["New async system"],
    sentiment: "positive"
  },
  recordingStatus: "completed", // recording|processing|completed|failed
  discordMessageId: "message_id_here",
  audioFilePath: "./recordings/mtg_a1b2c3d4.mp3",
  transcriptFilePath: "./transcripts/mtg_a1b2c3d4.txt",
  createdAt: Date,
  updatedAt: Date
}
```

## 🔧 Architecture

### Service Layer

```
┌─────────────────────────────────────────┐
│         Discord.js Client               │
├─────────────────────────────────────────┤
│  Commands          │   Event Handlers   │
│  /start-recording  │   voiceStateUpdate │
│  /stop-recording   │   interactionCreate│
├─────────────────────────────────────────┤
│              Services                   │
├──────────────┬──────────────┬───────────┤
│ Audio        │ Transcription│ Perplexity│
│ Recorder     │ Service      │ Service   │
├──────────────┼──────────────┼───────────┤
│ Mongo Service│ Logger       │ Embed     │
│              │              │ Builder   │
├──────────────┴──────────────┴───────────┤
│  External Services                      │
├─────────┬──────────────┬────────────────┤
│MongoDB  │ Perplexity   │ Whisper        │
│         │ API          │ (transcription)│
└─────────┴──────────────┴────────────────┘
```

## 📁 Project Structure

```
team-tape/
├── src/
│   ├── commands/
│   │   ├── start-recording.js
│   │   └── stop-recording.js
│   ├── events/
│   │   ├── ready.js
│   │   └── voiceStateUpdate.js
│   ├── services/
│   │   ├── audioRecorder.js
│   │   ├── transcriptionService.js
│   │   ├── perplexityService.js
│   │   └── mongoService.js
│   ├── models/
│   │   └── Meeting.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── embedBuilder.js
│   └── index.js
├── config/
│   ├── config.example.json
│   └── userMappings.example.json
├── recordings/ (gitignored)
├── logs/ (gitignored)
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── LICENSE
```

## 🐳 Docker Deployment

### Dockerfile

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install FFmpeg
RUN apk add --no-cache ffmpeg

# Copy dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src ./src
COPY config ./config

# Create directories
RUN mkdir -p recordings transcripts logs

CMD ["node", "src/index.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  bot:
    build: .
    env_file: .env
    volumes:
      - ./recordings:/app/recordings
      - ./logs:/app/logs
    depends_on:
      - mongo
  
  mongo:
    image: mongo:6.0
    environment:
      MONGO_INITDB_DATABASE: teamtape
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

## 🚀 Deployment

### PM2 Production Deployment

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start src/index.js --name team-tape

# Monitor
pm2 monit

# Save configuration
pm2 save

# Auto-start on system reboot
pm2 startup
```

### Environment Setup

```bash
# VPS/Server deployment
node --version  # Verify 22.x
npm --version   # Verify package manager
ffmpeg -version # Verify FFmpeg installed
mongod --version # Verify MongoDB running
```

## 💰 Cost Estimation

### Perplexity API Costs

- **Model**: llama-3.1-sonar-large-128k-online
- **Input pricing**: ~$0.005 per 1K tokens
- **Typical meeting**: 5,000-10,000 tokens
- **Cost per meeting**: ~$0.03-$0.05
- **Monthly (20 meetings)**: ~$1.00

### MongoDB Costs (Atlas)

- **Free tier**: 512MB storage (suitable for testing)
- **Paid**: Starting $9/month for 5GB storage
- **Estimate for active usage**: $15-30/month

### Server Costs (VPS)

- **Minimum specs**: 2GB RAM, 2vCPU, 10GB storage
- **Cost**: $5-15/month (Linode, Vultr, DigitalOcean)

## 🐛 Troubleshooting

### Bot not joining voice channel

- Verify bot has `CONNECT` and `SPEAK` permissions
- Check if bot is deafened (it shouldn't be)
- Review logs: `tail -f logs/error.log`

### Transcription failing

- Ensure Whisper model is properly integrated
- Check audio file exists: `ls -lh recordings/`
- Verify FFmpeg is installed

### Perplexity API errors

- Validate API key in `.env`
- Check rate limits: Monitor API dashboard
- Review response: Enable debug logging

### MongoDB connection issues

- Verify URI in `.env`
- Check credentials (user/password)
- Whitelist IP address (Atlas)

## 📚 Development

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format

# Run tests
npm test
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Discord.js** - Discord API library
- **Perplexity API** - AI-powered summaries
- **OpenAI Whisper** - Transcription model
- **MongoDB** - Data persistence
- **Winston** - Logging system

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/AhmedBaari/team-tape/issues)
- **Discussions**: [GitHub Discussions](https://github.com/AhmedBaari/team-tape/discussions)
- **Documentation**: [Wiki](https://github.com/AhmedBaari/team-tape/wiki)

## 🔐 Security & Privacy

### Data Handling

- **Local Processing**: Transcription happens locally (via Whisper)
- **API Calls**: Only audio transcripts sent to Perplexity API
- **Storage**: MongoDB stores meeting metadata and summaries
- **GDPR Compliance**: Implement data retention policies

### Recommendations

- Run on secure infrastructure
- Use environment variables for secrets
- Implement rate limiting for API usage
- Regular backup of MongoDB
- Monitor API costs

## 🗺️ Roadmap

- [ ] Web dashboard for meeting history
- [ ] Advanced speaker identification (voice fingerprinting)
- [ ] Multiple language support
- [ ] Export to calendar integrations
- [ ] Real-time transcription display
- [ ] Custom summary templates
- [ ] Analytics and insights
- [ ] API for third-party integrations

---

**Made with ❤️ for Discord communities. Built for teams by [TeamTape Contributors](https://github.com/AhmedBaari/team-tape/graphs/contributors).**
