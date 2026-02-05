import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { logger } from '../utils/logger.js';

export class WhatsAppHandler {
  constructor(core) {
    this.core = core;
    this.client = null;
    this.sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_session';
    this.isReady = false;
  }

  async initialize() {
    try {
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: this.sessionPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
          ]
        }
      });

      this.setupEventHandlers();
      
      await this.client.initialize();
      
      logger.info('WhatsApp client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // QR Code for authentication
    this.client.on('qr', (qr) => {
      logger.info('WhatsApp QR Code received. Please scan with your phone.');
      console.log('QR Code:', qr);
      // In production, you might want to display this QR code in a web interface
    });

    // Client ready
    this.client.on('ready', () => {
      logger.info('WhatsApp client is ready!');
      this.isReady = true;
    });

    // Authentication success
    this.client.on('authenticated', () => {
      logger.info('WhatsApp client authenticated');
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      logger.error('WhatsApp authentication failed:', msg);
    });

    // Disconnected
    this.client.on('disconnected', (reason) => {
      logger.warn('WhatsApp client disconnected:', reason);
      this.isReady = false;
    });

    // Handle incoming messages
    this.client.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        logger.error('Error handling WhatsApp message:', error);
        await this.sendErrorMessage(message.from);
      }
    });

    // Handle message creation (sent messages)
    this.client.on('message_create', async (message) => {
      // Only process messages sent by others, not by the bot
      if (!message.fromMe) {
        return;
      }
    });
  }

  async handleMessage(message) {
    // Skip group messages for now (can be enabled later)
    if (message.from.includes('@g.us')) {
      return;
    }

    // Skip messages from the bot itself
    if (message.fromMe) {
      return;
    }

    const userId = message.from;
    const text = message.body;

    logger.info(`Received WhatsApp message from ${userId}: ${text}`);

    // Handle commands
    if (text.startsWith('/') || text.startsWith('!')) {
      await this.handleCommand(message);
      return;
    }

    // Show typing indicator
    const chat = await message.getChat();
    await chat.sendStateTyping();

    try {
      // Process message through core
      const response = await this.core.processMessage(text, userId, 'whatsapp');

      // Send response
      await this.sendMessage(userId, response);
    } catch (error) {
      logger.error('Error processing WhatsApp message:', error);
      await this.sendErrorMessage(userId);
    } finally {
      // Clear typing indicator
      await chat.clearState();
    }
  }

  async handleCommand(message) {
    const userId = message.from;
    const text = message.body;
    const command = text.split(' ')[0].substring(1); // Remove '/' or '!'
    const args = text.split(' ').slice(1);

    switch (command.toLowerCase()) {
      case 'start':
      case 'help':
        await this.handleHelpCommand(userId);
        break;
      
      case 'status':
        await this.handleStatusCommand(userId);
        break;
      
      case 'model':
        await this.handleModelCommand(userId, args);
        break;
      
      case 'memory':
        await this.handleMemoryCommand(userId, args);
        break;
      
      case 'clear':
        await this.handleClearCommand(userId);
        break;
      
      default:
        await this.sendMessage(userId, 'Unknown command. Type /help for available commands.');
    }
  }

  async handleHelpCommand(userId) {
    const helpMessage = `
🤖 *MiniBot - WhatsApp Assistant*

I'm an AI assistant with advanced memory and reasoning capabilities.

*Available Commands:*
/help - Show this help message
/status - Show bot status and memory info
/model - Change AI model (/model list)
/memory - Memory management (/memory stats)
/clear - Clear conversation history

*Features:*
• Multi-layered memory system
• GitHub and Figma integration
• Multiple AI model support
• Thought-action-output reasoning

Just send me a message and I'll respond with detailed analysis!
    `;

    await this.sendMessage(userId, helpMessage);
  }

  async handleStatusCommand(userId) {
    try {
      const status = await this.core.getStatus();
      const currentModel = this.core.aiModelManager.getCurrentModel(userId);

      const statusMessage = `
📊 *Bot Status*

🧠 *Current AI Model:* ${currentModel}

💾 *Memory Status:*
• Short-term: ${status.memory.shortTerm.totalItems} items
• Long-term: ${status.memory.longTerm.totalMemories} memories
• RAG: ${status.memory.rag.totalDocuments} documents

🔧 *Available Models:* ${status.aiModels.join(', ')}

🔗 *MCP Servers:* ${Object.keys(status.mcpServers).length} active
      `;

      await this.sendMessage(userId, statusMessage);
    } catch (error) {
      await this.sendMessage(userId, 'Error retrieving status information.');
    }
  }

  async handleModelCommand(userId, args) {
    if (args.length === 0 || args[0] === 'list') {
      const availableModels = this.core.aiModelManager.getAvailableModels();
      const currentModel = this.core.aiModelManager.getCurrentModel(userId);
      const openSourceModels = this.core.aiModelManager.getOpenSourceModels();
      const commercialModels = this.core.aiModelManager.getCommercialModels();

      const modelMessage = `
🤖 *Available AI Models:*

*🔥 Ollama Cloud Models:*
${openSourceModels.map(model => 
  `${model === currentModel ? '✅' : '⚪'} ${model}`
).join('\n')}

*💰 Commercial Models:*
${commercialModels.map(model => 
  `${model === currentModel ? '✅' : '⚪'} ${model}`
).join('\n')}

*To change model:* /model <model_name>
*Examples:*
• /model ministral-3-3b (lightweight)
• /model deepseek-v3.2 (powerful reasoning)
• /model gpt-4 (paid, requires API key)

*Model Info:* /model info <model_name>
      `;

      await this.sendMessage(userId, modelMessage);
    } else if (args[0] === 'info' && args.length > 1) {
      const modelName = args[1];
      try {
        const modelInfo = await this.core.aiModelManager.getModelInfo(modelName);
        if (!modelInfo) {
          await this.sendMessage(userId, `❌ Model "${modelName}" not found.`);
          return;
        }

        const infoMessage = `
🤖 *Model Information: ${modelName}*

*Provider:* ${modelInfo.provider}
*Type:* ${modelInfo.provider === 'ollama' ? '🔥 Ollama Cloud' : 
  modelInfo.type === 'commercial' ? '💰 Commercial' : '🆓 Open Source'}
*Status:* ${modelInfo.available ? '✅ Available' : '❌ Not Available'}
*Model ID:* ${modelInfo.model}

${!modelInfo.available && modelInfo.provider === 'ollama' ? 
  `*To install:* Contact your administrator to add this model` : ''}
        `;

        await this.sendMessage(userId, infoMessage);
      } catch (error) {
        await this.sendMessage(userId, `❌ Error getting model info: ${error.message}`);
      }
    } else {
      const modelName = args[0];
      try {
        await this.core.setUserModel(userId, modelName);
        const modelInfo = await this.core.aiModelManager.getModelInfo(modelName);
        const typeEmoji = modelInfo?.provider === 'ollama' ? '🔥' : 
          modelInfo?.type === 'commercial' ? '💰' : '🆓';
        await this.sendMessage(userId, `✅ AI model changed to: ${typeEmoji} *${modelName}*`);
      } catch (error) {
        await this.sendMessage(userId, `❌ Error: ${error.message}`);
      }
    }
  }

  async handleMemoryCommand(userId, args) {
    if (args.length === 0 || args[0] === 'stats') {
      try {
        const memoryStatus = await this.core.memoryManager.getStatus();
        
        const memoryMessage = `
🧠 *Memory Statistics*

📝 *Short-term Memory:*
• Total items: ${memoryStatus.shortTerm.totalItems}
• Users: ${memoryStatus.shortTerm.totalUsers}

💾 *Long-term Memory:*
• Total memories: ${memoryStatus.longTerm.totalMemories}
• Users: ${memoryStatus.longTerm.totalUsers}
• Avg importance: ${memoryStatus.longTerm.averageImportance?.toFixed(2) || 'N/A'}

🔍 *RAG Memory:*
• Documents: ${memoryStatus.rag.totalDocuments}
• Model: ${memoryStatus.rag.embeddingModel}

*Commands:*
/memory search <query> - Search memories
/memory clear - Clear memories
        `;

        await this.sendMessage(userId, memoryMessage);
      } catch (error) {
        await this.sendMessage(userId, 'Error retrieving memory statistics.');
      }
    } else if (args[0] === 'search' && args.length > 1) {
      const query = args.slice(1).join(' ');
      try {
        const results = await this.core.memoryManager.searchMemory(userId, query);
        
        let searchMessage = `🔍 *Memory Search Results for "${query}":*\n\n`;
        
        if (results.shortTerm.length > 0) {
          searchMessage += `📝 *Short-term (${results.shortTerm.length}):*\n`;
          results.shortTerm.slice(0, 3).forEach((item, i) => {
            searchMessage += `${i + 1}. ${JSON.stringify(item.content).substring(0, 100)}...\n`;
          });
          searchMessage += '\n';
        }

        if (results.longTerm.length > 0) {
          searchMessage += `💾 *Long-term (${results.longTerm.length}):*\n`;
          results.longTerm.slice(0, 3).forEach((item, i) => {
            searchMessage += `${i + 1}. ${JSON.stringify(item.content).substring(0, 100)}...\n`;
          });
        }

        if (results.shortTerm.length === 0 && results.longTerm.length === 0) {
          searchMessage += 'No memories found matching your query.';
        }

        await this.sendMessage(userId, searchMessage);
      } catch (error) {
        await this.sendMessage(userId, 'Error searching memories.');
      }
    } else if (args[0] === 'clear') {
      await this.handleClearCommand(userId);
    }
  }

  async handleClearCommand(userId) {
    const confirmMessage = `
⚠️ *Memory Clear Confirmation*

What would you like to clear?

Reply with:
• *all* - Clear all memories
• *short* - Clear short-term memory only
• *cancel* - Cancel operation
    `;

    await this.sendMessage(userId, confirmMessage);

    // Set up a temporary listener for the next message from this user
    const handleClearResponse = async (message) => {
      if (message.from !== userId) return;

      const response = message.body.toLowerCase().trim();
      
      try {
        if (response === 'all') {
          await this.core.memoryManager.clearUserMemory(userId, 'all');
          await this.sendMessage(userId, '✅ All memories cleared successfully!');
        } else if (response === 'short') {
          await this.core.memoryManager.clearUserMemory(userId, 'short');
          await this.sendMessage(userId, '✅ Short-term memory cleared successfully!');
        } else if (response === 'cancel') {
          await this.sendMessage(userId, '❌ Memory clear cancelled.');
        } else {
          await this.sendMessage(userId, 'Invalid response. Memory clear cancelled.');
        }
      } catch (error) {
        await this.sendMessage(userId, '❌ Error clearing memory.');
      }

      // Remove the temporary listener
      this.client.removeListener('message', handleClearResponse);
    };

    // Add temporary listener with timeout
    this.client.on('message', handleClearResponse);
    
    // Remove listener after 30 seconds
    setTimeout(() => {
      this.client.removeListener('message', handleClearResponse);
    }, 30000);
  }

  async sendMessage(userId, text) {
    if (!this.isReady) {
      logger.warn('WhatsApp client not ready, cannot send message');
      return;
    }

    try {
      // WhatsApp has a message length limit
      const maxLength = 4096;
      
      if (text.length <= maxLength) {
        await this.client.sendMessage(userId, text);
        return;
      }

      // Split long messages
      const chunks = [];
      for (let i = 0; i < text.length; i += maxLength) {
        chunks.push(text.substring(i, i + maxLength));
      }

      for (const chunk of chunks) {
        await this.client.sendMessage(userId, chunk);
        // Small delay between chunks to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      logger.error('Error sending WhatsApp message:', error);
    }
  }

  async sendErrorMessage(userId) {
    await this.sendMessage(userId, 
      '❌ Sorry, I encountered an error processing your message. Please try again.'
    );
  }

  async getContactInfo(userId) {
    try {
      const contact = await this.client.getContactById(userId);
      return {
        name: contact.name || contact.pushname || 'Unknown',
        number: contact.number,
        isBlocked: contact.isBlocked,
        isGroup: contact.isGroup
      };
    } catch (error) {
      logger.error('Error getting contact info:', error);
      return null;
    }
  }

  async getChatInfo(chatId) {
    try {
      const chat = await this.client.getChatById(chatId);
      return {
        name: chat.name,
        isGroup: chat.isGroup,
        participantCount: chat.participants ? chat.participants.length : 1
      };
    } catch (error) {
      logger.error('Error getting chat info:', error);
      return null;
    }
  }

  getStatus() {
    return {
      isReady: this.isReady,
      sessionPath: this.sessionPath
    };
  }
}