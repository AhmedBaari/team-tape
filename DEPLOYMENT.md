# TeamTape Deployment Guide

Comprehensive guide for deploying TeamTape in production environments.

## Pre-Deployment Checklist

- [ ] Discord bot token obtained
- [ ] Perplexity API key acquired
- [ ] MongoDB database created (Atlas or self-hosted)
- [ ] Server requirements verified (Node.js 22.x, FFmpeg)
- [ ] Environment variables configured
- [ ] User mappings prepared
- [ ] SSL/TLS certificates ready (if applicable)
- [ ] Backup strategy defined
- [ ] Monitoring setup planned

## Local Development Deployment

### 1. Setup

```bash
# Clone repository
git clone https://github.com/AhmedBaari/team-tape.git
cd team-tape

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with local settings
```

### 2. Configuration

**MongoDB (Local)**

```bash
# Install MongoDB Community Edition
# macOS: brew install mongodb-community
# Ubuntu: see MongoDB docs

# Start MongoDB
mongod --dbpath /usr/local/var/mongodb

# Set MONGODB_URI in .env
MONGODB_URI=mongodb://localhost:27017/teamtape
```

**Discord Bot Setup**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application
3. Go to "Bot" section, click "Add Bot"
4. Copy token → paste in `.env` as `DISCORD_TOKEN`
5. Copy Client ID → paste in `.env` as `DISCORD_CLIENT_ID`
6. Go to OAuth2 > URL Generator
7. Select scopes: `bot`
8. Select permissions:
   - `MANAGE_CHANNELS`
   - `CONNECT`
   - `SPEAK`
   - `USE_VOICE_ACTIVATION`
   - `SEND_MESSAGES`
   - `EMBED_LINKS`
   - `ATTACH_FILES`
9. Copy generated URL and invite bot to test server

### 3. Run Locally

```bash
# Development with auto-reload
npm run dev

# Production mode
npm start
```

## VPS Deployment (Ubuntu 22.04)

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Install FFmpeg
sudo apt install -y ffmpeg

# Install MongoDB (optional, use Atlas if preferred)
sudo apt install -y mongodb
sudo systemctl start mongodb

# Verify installations
node --version
npm --version
ffmpeg -version
```

### 2. Prepare Application

```bash
# Create app directory
sudo mkdir -p /opt/team-tape
sudo chown $USER:$USER /opt/team-tape

# Clone repository
cd /opt/team-tape
git clone https://github.com/AhmedBaari/team-tape.git .

# Install dependencies
npm ci --only=production

# Configure environment
cp .env.example .env
# Edit .env with production values
sudo nano .env

# Create necessary directories
mkdir -p recordings logs transcripts
```

### 3. PM2 Process Manager

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start application
pm2 start src/index.js --name team-tape --max-memory-restart 1G

# Configure auto-start on reboot
pm2 startup
pm2 save

# Monitor
pm2 monit

# View logs
pm2 logs team-tape
```

### 4. Systemd Alternative

If preferring systemd over PM2:

```bash
# Create systemd service
sudo nano /etc/systemd/system/team-tape.service
```

```ini
[Unit]
Description=TeamTape Discord Bot
After=network.target
Wants=mongodb.service

[Service]
Type=simple
User=teamtape
WorkingDirectory=/opt/team-tape
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/team-tape/.env
StandardOutput=journal
StandardError=journal
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
# Create user
sudo useradd -r -s /bin/false teamtape
sudo chown -R teamtape:teamtape /opt/team-tape

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable team-tape
sudo systemctl start team-tape

# Monitor
sudo systemctl status team-tape
sudo journalctl -u team-tape -f
```

## Docker Deployment

### 1. Build Image

```bash
# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:22-alpine

WORKDIR /app

# Install FFmpeg
RUN apk add --no-cache ffmpeg

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src ./src
COPY config ./config

# Create directories
RUN mkdir -p recordings transcripts logs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('fs').statSync('./logs/combined.log')" || exit 1

CMD ["node", "src/index.js"]
EOF

# Build
docker build -t team-tape:latest .
```

### 2. Docker Compose

```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./recordings:/app/recordings
      - ./logs:/app/logs
      - ./transcripts:/app/transcripts
    depends_on:
      - mongo
    networks:
      - team-tape-network

  mongo:
    image: mongo:6.0-alpine
    restart: unless-stopped
    environment:
      MONGO_INITDB_DATABASE: teamtape
    volumes:
      - mongo-data:/data/db
    networks:
      - team-tape-network
    ports:
      - "27017:27017"

volumes:
  mongo-data:

networks:
  team-tape-network:
    driver: bridge
EOF

# Run
docker-compose up -d

# Monitor
docker-compose logs -f bot
```

## MongoDB Setup

### MongoDB Atlas (Recommended for Production)

1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster
3. Create database user
4. Get connection string
5. Set `MONGODB_URI` in `.env`:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/teamtape?retryWrites=true&w=majority
```

### Self-Hosted MongoDB

```bash
# Install on Ubuntu
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt update
sudo apt install -y mongodb-org

# Start service
sudo systemctl start mongod
sudo systemctl enable mongod

# Create database and user
mongosh

# In mongosh shell:
use teamtape
db.createUser({
  user: "teamtape_user",
  pwd: "strong_password_here",
  roles: ["readWrite"]
})
exit

# Set connection string
MONGODB_URI=mongodb://teamtape_user:strong_password_here@localhost:27017/teamtape
```

## SSL/TLS Configuration

If using reverse proxy with API:

```nginx
server {
    listen 443 ssl http2;
    server_name api.teamtape.example.com;

    ssl_certificate /etc/letsencrypt/live/api.teamtape.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.teamtape.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Monitoring & Maintenance

### Health Checks

```bash
# Check bot status
pm2 status

# Check logs for errors
tail -f logs/error.log

# MongoDB connection
mongosh --eval "db.adminCommand('ping')"

# Discord API connectivity (via bot status)
# Bot will show "Watching 🎙️ meetings" when connected
```

### Backup Strategy

```bash
# MongoDB backup (local)
mongodump --out /backups/mongodb-$(date +%Y%m%d)

# Recordings backup
tar -czf /backups/recordings-$(date +%Y%m%d).tar.gz ./recordings

# Automate with cron
0 2 * * * mongodump --out /backups/mongodb-$(date +\%Y\%m\%d) && tar -czf /backups/recordings-$(date +\%Y\%m\%d).tar.gz ./recordings
```

### Log Rotation

Winston automatically rotates logs, but ensure space:

```bash
# Check disk usage
df -h

# Clean old logs manually
find ./logs -name "*.log" -mtime +30 -delete
```

### Performance Monitoring

```bash
# CPU/Memory with PM2
pm2 monit

# System metrics
htop

# Disk I/O
iostat -x 1
```

## Scaling Considerations

### Horizontal Scaling

For multiple Discord servers:

1. **Multiple bot instances** (not recommended)
   - Single bot can serve unlimited guilds

2. **Load balancing recordings**
   - Use multiple servers, each handles specific guilds
   - Requires shared MongoDB

### Vertical Scaling

- Increase RAM for concurrent recordings
- SSD storage for recordings directory
- Consider CDN for recording distribution

## Troubleshooting

### Bot not responding

```bash
# Check if running
pm2 status team-tape

# View logs
pm2 logs team-tape

# Restart
pm2 restart team-tape
```

### Recording failures

```bash
# Check disk space
df -h ./recordings

# Check permissions
ls -la ./recordings

# Check FFmpeg
ffmpeg -version
```

### MongoDB connection issues

```bash
# Test connection
mongosh "${MONGODB_URI}"

# Check Atlas whitelist if using cloud
# Ensure IP is whitelisted in Atlas Security > Network Access
```

### High memory usage

- Increase PM2 `--max-memory-restart` limit
- Implement recording cleanup
- Monitor with `pm2 monit`

## Update Procedure

```bash
# Backup current code
cp -r /opt/team-tape /opt/team-tape.backup-$(date +%Y%m%d)

# Pull latest
cd /opt/team-tape
git fetch origin
git checkout main
git pull origin main

# Install updated dependencies
npm ci --only=production

# Restart bot
pm2 restart team-tape

# Verify
pm2 logs team-tape
```

## Production Checklist

- [ ] Use MongoDB Atlas or managed database
- [ ] Enable MongoDB authentication
- [ ] Set strong API keys in environment
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerting
- [ ] Implement automated backups
- [ ] Use process manager (PM2/systemd)
- [ ] Enable auto-restart on failure
- [ ] Set up log rotation
- [ ] Configure rate limiting
- [ ] Document runbook procedures
- [ ] Test disaster recovery
- [ ] Monitor disk space
- [ ] Regular security updates

## Support

For deployment issues:

- Check [GitHub Issues](https://github.com/AhmedBaari/team-tape/issues)
- Review [Troubleshooting](README.md#troubleshooting)
- Join [Discord Server](https://discord.gg/teamtape) (if available)

---

**Last Updated**: December 2025
