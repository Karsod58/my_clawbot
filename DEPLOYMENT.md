# MiniBot Deployment Guide

## Prerequisites

- Node.js 18+ 
- npm or yarn
- API keys for desired services
- Server with persistent storage (for production)

## Local Development Setup

### 1. Clone and Setup
```bash
git clone <repository-url>
cd minibot-ai
node setup.js
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Edit `.env` file with your API keys:

```env
# AI Models - Choose your preferred providers
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GEMINI_API_KEY=your_gemini_api_key
OLLAMA_API_KEY=your_ollama_api_key
DEFAULT_MODEL=ministral-3-3b

# Open Source Model Servers
OLLAMA_URL=https://api.ollama.ai

# Required for Telegram integration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Optional - for GitHub integration
GITHUB_TOKEN=your_github_personal_access_token

# Optional - for Figma integration
FIGMA_TOKEN=your_figma_personal_access_token

# Database and storage paths
DATABASE_PATH=./data/minibot.db
VECTOR_DB_PATH=./data/vector_db

# Server configuration
PORT=3000
LOG_LEVEL=info
```

### 4. Start Development Server
```bash
npm run dev
```

## Production Deployment

### Option 1: Traditional Server Deployment

#### 1. Server Requirements
- Ubuntu 20.04+ or similar Linux distribution
- 2GB+ RAM (4GB recommended)
- 10GB+ storage
- Node.js 18+
- PM2 for process management

#### 2. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash minibot
sudo su - minibot
```

#### 3. Deploy Application
```bash
# Clone repository
git clone <repository-url>
cd minibot-ai

# Install dependencies
npm ci --production

# Setup environment
cp .env.example .env
# Edit .env with production values

# Create necessary directories
mkdir -p data logs data/vector_db

# Start with PM2
pm2 start src/index.js --name minibot
pm2 save
pm2 startup
```

#### 4. Nginx Reverse Proxy (Optional)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 2: Cloud Platform Deployment

#### Heroku
```bash
# Install Heroku CLI
# Create Heroku app
heroku create minibot-ai

# Set environment variables
heroku config:set OPENAI_API_KEY=your_key
heroku config:set TELEGRAM_BOT_TOKEN=your_token
# ... other variables

# Deploy
git push heroku main
```

#### Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

#### DigitalOcean App Platform
1. Connect GitHub repository
2. Configure environment variables
3. Set build and run commands:
   - Build: `npm ci`
   - Run: `node src/index.js`

## Platform-Specific Setup

### Telegram Bot Setup

1. **Create Bot**
   - Message @BotFather on Telegram
   - Use `/newbot` command
   - Choose bot name and username
   - Copy the provided token

2. **Configure Webhook (Production)**
   ```bash
   curl -X POST \
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
     -H 'Content-Type: application/json' \
     -d '{
       "url": "https://your-domain.com/webhook/telegram"
     }'
   ```

### WhatsApp Setup

1. **QR Code Authentication**
   - Start the application
   - Check logs for QR code
   - Scan with WhatsApp mobile app
   - Session will be saved for future use

2. **Production Considerations**
   - Use headless browser in production
   - Implement session backup/restore
   - Monitor connection status

### GitHub Integration

1. **Personal Access Token**
   - Go to GitHub Settings → Developer settings → Personal access tokens
   - Generate new token with required scopes:
     - `repo` (for repository access)
     - `read:user` (for user information)
     - `read:org` (for organization access)

### Figma Integration

1. **Personal Access Token**
   - Go to Figma Settings → Account → Personal access tokens
   - Generate new token
   - Copy token to environment variables

## Monitoring and Maintenance

### Health Checks
```bash
# Check application status
curl http://localhost:3000/health

# Check detailed status
curl http://localhost:3000/status
```

### Log Management
```bash
# View real-time logs
tail -f logs/combined.log

# View error logs
tail -f logs/error.log

# Rotate logs (with logrotate)
sudo logrotate -f /etc/logrotate.d/minibot
```

### Database Maintenance
```bash
# Backup SQLite database
cp data/minibot.db data/minibot.db.backup

# Vacuum database (optimize)
sqlite3 data/minibot.db "VACUUM;"

# Check database integrity
sqlite3 data/minibot.db "PRAGMA integrity_check;"
```

### Memory Management
```bash
# Monitor memory usage
ps aux | grep node

# Check application memory stats
curl http://localhost:3000/status | jq '.memory'
```

## Security Considerations

### Environment Security
- Never commit `.env` files
- Use secure key management in production
- Rotate API keys regularly
- Implement rate limiting

### Network Security
- Use HTTPS in production
- Implement firewall rules
- Use VPN for sensitive deployments
- Monitor access logs

### Data Security
- Encrypt database at rest
- Implement backup encryption
- Use secure file permissions
- Regular security updates

## Backup Strategy

### Automated Backup Script
```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/minibot"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
cp data/minibot.db $BACKUP_DIR/minibot_$DATE.db

# Backup vector database
tar -czf $BACKUP_DIR/vector_db_$DATE.tar.gz data/vector_db/

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz logs/

# Clean old backups (keep 7 days)
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Restore Process
```bash
# Stop application
pm2 stop minibot

# Restore database
cp /backups/minibot/minibot_YYYYMMDD_HHMMSS.db data/minibot.db

# Restore vector database
tar -xzf /backups/minibot/vector_db_YYYYMMDD_HHMMSS.tar.gz -C data/

# Start application
pm2 start minibot
```

## Troubleshooting

### Common Issues

1. **Memory Errors**
   - Increase server memory
   - Implement memory cleanup
   - Check for memory leaks

2. **API Rate Limits**
   - Implement exponential backoff
   - Use multiple API keys
   - Cache responses

3. **Database Locks**
   - Check for long-running queries
   - Implement connection pooling
   - Use WAL mode for SQLite

4. **WhatsApp Connection Issues**
   - Clear session data
   - Update whatsapp-web.js
   - Check browser dependencies

### Debug Mode
```bash
# Start with debug logging
LOG_LEVEL=debug npm start

# Enable specific component debugging
DEBUG=minibot:* npm start
```

## Performance Optimization

### Database Optimization
```sql
-- Add indexes for better performance
CREATE INDEX idx_user_timestamp ON long_term_memory(user_id, timestamp);
CREATE INDEX idx_importance ON long_term_memory(importance);
```

### Memory Optimization
- Implement memory cleanup intervals
- Use streaming for large responses
- Optimize vector database size

### Response Time Optimization
- Implement response caching
- Use connection pooling
- Optimize AI model selection

## Scaling Considerations

### Horizontal Scaling
- Use Redis for shared session storage
- Implement load balancing
- Use message queues for processing

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Use CDN for static assets

### Microservices Architecture
- Separate memory management service
- Dedicated MCP service
- Independent messaging handlers