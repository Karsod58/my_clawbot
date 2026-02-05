import dotenv from 'dotenv';
import express from 'express';
import { MiniBotCore } from './core/MiniBotCore.js';
import { TelegramHandler } from './messaging/TelegramHandler.js';
import { WhatsAppHandler } from './messaging/WhatsAppHandler.js';
import { logger } from './utils/logger.js';

dotenv.config();

class MiniBotApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.core = new MiniBotCore();
    this.telegramHandler = null;
    this.whatsappHandler = null;
  }

  async initialize() {
    try {
      // Initialize core AI system
      await this.core.initialize();
      
      // Initialize messaging handlers - Telegram only
      if (process.env.TELEGRAM_BOT_TOKEN) {
        this.telegramHandler = new TelegramHandler(this.core);
        await this.telegramHandler.initialize();
        logger.info('Telegram handler initialized');
      } else {
        logger.warn('No Telegram bot token provided');
      }

      // WhatsApp disabled - using Telegram only
      logger.info('WhatsApp handler disabled - using Telegram only');

      // Setup express routes
      this.setupRoutes();
      
      logger.info('MiniBot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MiniBot:', error);
      process.exit(1);
    }
  }

  setupRoutes() {
    this.app.use(express.json());
    
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    this.app.get('/status', async (req, res) => {
      const status = await this.core.getStatus();
      res.json(status);
    });

    this.app.post('/chat', async (req, res) => {
      try {
        const { message, userId, platform = 'api' } = req.body;
        const response = await this.core.processMessage(message, userId, platform);
        res.json({ response });
      } catch (error) {
        logger.error('Chat API error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  async start() {
    await this.initialize();
    
    this.app.listen(this.port, () => {
      logger.info(`MiniBot server running on port ${this.port}`);
    });
  }
}

const app = new MiniBotApp();
app.start().catch(error => {
  logger.error('Failed to start MiniBot:', error);
  process.exit(1);
});