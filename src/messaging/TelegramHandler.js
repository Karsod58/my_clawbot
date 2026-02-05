import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger.js';

export class TelegramHandler {
  constructor(core) {
    this.core = core;
    this.bot = null;
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.adminUsers = process.env.TELEGRAM_ADMIN_USERS ? 
      process.env.TELEGRAM_ADMIN_USERS.split(',').map(id => parseInt(id)) : [];
  }

  async initialize() {
    if (!this.token) {
      throw new Error('TELEGRAM_BOT_TOKEN not provided');
    }

    try {
      this.bot = new TelegramBot(this.token, { 
        polling: {
          interval: 1000,
          autoStart: true,
          params: {
            timeout: 10
          }
        }
      });
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Set bot commands with retry logic
      await this.setupCommandsWithRetry();
      
      logger.info('Telegram bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
      throw error;
    }
  }

  async setupCommandsWithRetry(maxRetries = 3) {
    const commands = [
      { command: 'start', description: 'Start the bot' },
      { command: 'help', description: 'Show help message' },
      { command: 'status', description: 'Show bot status' },
      { command: 'model', description: 'Change AI model' },
      { command: 'memory', description: 'Memory management' },
      { command: 'clear', description: 'Clear conversation history' }
    ];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.bot.setMyCommands(commands);
        logger.info('Telegram bot commands set successfully');
        return;
      } catch (error) {
        logger.warn(`Failed to set commands (attempt ${attempt}/${maxRetries}):`, error.message);
        
        if (attempt === maxRetries) {
          logger.error('Failed to set commands after all retries, continuing without commands');
          return;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  setupEventHandlers() {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('Error handling Telegram message:', error);
        await this.sendErrorMessage(msg.chat.id);
      }
    });

    // Handle callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (query) => {
      try {
        await this.handleCallbackQuery(query);
      } catch (error) {
        logger.error('Error handling Telegram callback query:', error);
      }
    });

    // Handle errors with better logging
    this.bot.on('error', (error) => {
      logger.error('Telegram bot error:', error.message);
    });

    // Handle polling errors with retry logic
    this.bot.on('polling_error', (error) => {
      if (error.code === 'EFATAL' || error.message.includes('ENOTFOUND')) {
        logger.warn('Network connectivity issue with Telegram. Retrying in 30 seconds...');
        
        // Stop current polling
        this.bot.stopPolling();
        
        // Restart polling after delay
        setTimeout(() => {
          try {
            this.bot.startPolling();
            logger.info('Telegram polling restarted');
          } catch (restartError) {
            logger.error('Failed to restart Telegram polling:', restartError.message);
          }
        }, 30000);
      } else {
        logger.error('Telegram polling error:', error.message);
      }
    });
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const text = msg.text;

    logger.info(`Received Telegram message from ${userId}: ${text}`);

    // Handle commands
    if (text.startsWith('/')) {
      await this.handleCommand(msg);
      return;
    }

    // Show typing indicator
    await this.bot.sendChatAction(chatId, 'typing');

    // Process message through core
    const response = await this.core.processMessage(text, userId, 'telegram');

    // Send response
    await this.sendMessage(chatId, response);
  }

  async handleCommand(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const command = msg.text.split(' ')[0].substring(1); // Remove '/'
    const args = msg.text.split(' ').slice(1);

    switch (command) {
      case 'start':
        await this.handleStartCommand(chatId, userId);
        break;
      
      case 'help':
        await this.handleHelpCommand(chatId);
        break;
      
      case 'status':
        await this.handleStatusCommand(chatId, userId);
        break;
      
      case 'model':
        await this.handleModelCommand(chatId, userId, args);
        break;
      
      case 'memory':
        await this.handleMemoryCommand(chatId, userId, args);
        break;
      
      case 'clear':
        await this.handleClearCommand(chatId, userId);
        break;
      
      case 'reset':
        await this.handleResetCommand(chatId, userId);
        break;
      
      default:
        await this.sendMessage(chatId, 'Unknown command. Type /help for available commands.');
    }
  }

  async handleStartCommand(chatId, userId) {
    const welcomeMessage = `
🤖 Welcome to MiniBot!

I'm an AI assistant with advanced memory capabilities and integration with GitHub and Figma.

Features:
• Multi-layered memory system
• Thought-action-output reasoning
• GitHub and Figma integration
• Multiple AI model support

Type /help to see available commands or just start chatting!
    `;

    await this.sendMessage(chatId, welcomeMessage);
  }

  async handleHelpCommand(chatId) {
    const helpMessage = `
🔧 Available Commands:

/start - Start the bot
/help - Show this help message
/status - Show bot status and memory info
/model - Change AI model (/model list to see options)
/memory - Memory management (/memory stats)
/clear - Clear your conversation history
/reset - Reset to default AI model

💬 You can also:
• Ask questions about GitHub repositories
• Request Figma design information
• Have conversations that I'll remember
• Switch between different AI models

Just type your message and I'll respond with detailed reasoning!
    `;

    await this.sendMessage(chatId, helpMessage);
  }

  async handleStatusCommand(chatId, userId) {
    try {
      const status = await this.core.getStatus();
      const currentModel = this.core.aiModelManager.getCurrentModel(userId);

      const statusMessage = `
📊 Bot Status:

🧠 Current AI Model: ${currentModel}
💾 Memory Status:
  • Short-term: ${status.memory.shortTerm.totalItems} items
  • Long-term: ${status.memory.longTerm.totalMemories} memories
  • RAG: ${status.memory.rag.totalDocuments} documents

🔧 Available Models: ${status.aiModels.join(', ')}

🔗 MCP Servers: ${Object.keys(status.mcpServers).length} active
      `;

      await this.sendMessage(chatId, statusMessage);
    } catch (error) {
      await this.sendMessage(chatId, 'Error retrieving status information.');
    }
  }

  async handleModelCommand(chatId, userId, args) {
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

      await this.sendMessage(chatId, modelMessage);
    } else if (args[0] === 'info' && args.length > 1) {
      const modelName = args[1];
      try {
        const modelInfo = await this.core.aiModelManager.getModelInfo(modelName);
        if (!modelInfo) {
          await this.sendMessage(chatId, `❌ Model "${modelName}" not found.`);
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

        await this.sendMessage(chatId, infoMessage);
      } catch (error) {
        await this.sendMessage(chatId, `❌ Error getting model info: ${error.message}`);
      }
    } else {
      const modelName = args[0];
      try {
        await this.core.setUserModel(userId, modelName);
        const modelInfo = await this.core.aiModelManager.getModelInfo(modelName);
        const typeEmoji = modelInfo?.provider === 'ollama' ? '🔥' : 
          modelInfo?.type === 'commercial' ? '💰' : '🆓';
        await this.sendMessage(chatId, `✅ AI model changed to: ${typeEmoji} ${modelName}`);
      } catch (error) {
        await this.sendMessage(chatId, `❌ Error: ${error.message}`);
      }
    }
  }

  async handleMemoryCommand(chatId, userId, args) {
    if (args.length === 0 || args[0] === 'stats') {
      try {
        const memoryStatus = await this.core.memoryManager.getStatus();
        
        const memoryMessage = `
🧠 Memory Statistics:

📝 Short-term Memory:
  • Total items: ${memoryStatus.shortTerm.totalItems}
  • Users: ${memoryStatus.shortTerm.totalUsers}

💾 Long-term Memory:
  • Total memories: ${memoryStatus.longTerm.totalMemories}
  • Users: ${memoryStatus.longTerm.totalUsers}
  • Avg importance: ${memoryStatus.longTerm.averageImportance?.toFixed(2) || 'N/A'}

🔍 RAG Memory:
  • Documents: ${memoryStatus.rag.totalDocuments}
  • Model: ${memoryStatus.rag.embeddingModel}

Commands:
/memory search <query> - Search your memories
/memory clear - Clear your memories
        `;

        await this.sendMessage(chatId, memoryMessage);
      } catch (error) {
        await this.sendMessage(chatId, 'Error retrieving memory statistics.');
      }
    } else if (args[0] === 'search' && args.length > 1) {
      const query = args.slice(1).join(' ');
      try {
        const results = await this.core.memoryManager.searchMemory(userId, query);
        
        let searchMessage = `🔍 Memory Search Results for "${query}":\n\n`;
        
        if (results.shortTerm.length > 0) {
          searchMessage += `📝 Short-term (${results.shortTerm.length}):\n`;
          results.shortTerm.slice(0, 3).forEach((item, i) => {
            searchMessage += `${i + 1}. ${JSON.stringify(item.content).substring(0, 100)}...\n`;
          });
          searchMessage += '\n';
        }

        if (results.longTerm.length > 0) {
          searchMessage += `💾 Long-term (${results.longTerm.length}):\n`;
          results.longTerm.slice(0, 3).forEach((item, i) => {
            searchMessage += `${i + 1}. ${JSON.stringify(item.content).substring(0, 100)}...\n`;
          });
        }

        if (results.shortTerm.length === 0 && results.longTerm.length === 0) {
          searchMessage += 'No memories found matching your query.';
        }

        await this.sendMessage(chatId, searchMessage);
      } catch (error) {
        await this.sendMessage(chatId, 'Error searching memories.');
      }
    } else if (args[0] === 'clear') {
      await this.handleClearCommand(chatId, userId);
    }
  }

  async handleClearCommand(chatId, userId) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🗑️ Clear All', callback_data: `clear_all_${userId}` },
          { text: '📝 Short-term Only', callback_data: `clear_short_${userId}` }
        ],
        [
          { text: '❌ Cancel', callback_data: `clear_cancel_${userId}` }
        ]
      ]
    };

    await this.bot.sendMessage(chatId, 
      '⚠️ What would you like to clear?', 
      { reply_markup: keyboard }
    );
  }

  async handleResetCommand(chatId, userId) {
    try {
      // Clear user model preference
      this.core.aiModelManager.clearUserModel(userId);
      
      // Get the current default model
      const defaultModel = this.core.aiModelManager.getCurrentModel(userId);
      
      await this.sendMessage(chatId, `✅ Reset to default model: ${defaultModel}`);
    } catch (error) {
      await this.sendMessage(chatId, `❌ Error resetting model: ${error.message}`);
    }
  }

  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;
    const userId = query.from.id.toString();

    if (data.startsWith('clear_')) {
      const action = data.split('_')[1];
      const targetUserId = data.split('_')[2];

      // Security check
      if (userId !== targetUserId) {
        await this.bot.answerCallbackQuery(query.id, { text: 'Unauthorized action' });
        return;
      }

      try {
        if (action === 'all') {
          await this.core.memoryManager.clearUserMemory(userId, 'all');
          await this.bot.editMessageText('✅ All memories cleared successfully!', {
            chat_id: chatId,
            message_id: query.message.message_id
          });
        } else if (action === 'short') {
          await this.core.memoryManager.clearUserMemory(userId, 'short');
          await this.bot.editMessageText('✅ Short-term memory cleared successfully!', {
            chat_id: chatId,
            message_id: query.message.message_id
          });
        } else if (action === 'cancel') {
          await this.bot.editMessageText('❌ Memory clear cancelled.', {
            chat_id: chatId,
            message_id: query.message.message_id
          });
        }
      } catch (error) {
        await this.bot.editMessageText('❌ Error clearing memory.', {
          chat_id: chatId,
          message_id: query.message.message_id
        });
      }
    }

    await this.bot.answerCallbackQuery(query.id);
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      // Clean and escape text for Telegram
      const cleanText = this.cleanTextForTelegram(text);
      
      // Split long messages
      const maxLength = 4096;
      if (cleanText.length <= maxLength) {
        return await this.bot.sendMessage(chatId, cleanText, {
          parse_mode: 'Markdown',
          ...options
        });
      }

      // Split message into chunks
      const chunks = [];
      for (let i = 0; i < cleanText.length; i += maxLength) {
        chunks.push(cleanText.substring(i, i + maxLength));
      }

      for (const chunk of chunks) {
        await this.bot.sendMessage(chatId, chunk, {
          parse_mode: 'Markdown',
          ...options
        });
      }
    } catch (error) {
      logger.error('Error sending Telegram message:', error);
      
      // Fallback: try without markdown parsing
      try {
        const plainText = this.stripMarkdown(text);
        const maxLength = 4096;
        
        if (plainText.length <= maxLength) {
          await this.bot.sendMessage(chatId, plainText, options);
        } else {
          // Split plain text into chunks
          const chunks = [];
          for (let i = 0; i < plainText.length; i += maxLength) {
            chunks.push(plainText.substring(i, i + maxLength));
          }
          
          for (const chunk of chunks) {
            await this.bot.sendMessage(chatId, chunk, options);
          }
        }
      } catch (fallbackError) {
        logger.error('Error sending fallback message:', fallbackError);
        // Last resort: send error message
        await this.bot.sendMessage(chatId, '❌ Sorry, I encountered an error sending the response.');
      }
    }
  }

  cleanTextForTelegram(text) {
    // Remove or escape problematic markdown characters
    return text
      // Fix unmatched asterisks
      .replace(/\*([^*]*)\*/g, (match, content) => {
        // Only keep if it's a complete pair
        return content.trim() ? `*${content}*` : content;
      })
      // Fix unmatched underscores
      .replace(/_([^_]*)_/g, (match, content) => {
        return content.trim() ? `_${content}_` : content;
      })
      // Fix unmatched backticks
      .replace(/`([^`]*)`/g, (match, content) => {
        return content.trim() ? `\`${content}\`` : content;
      })
      // Remove incomplete markdown
      .replace(/\*(?!\*)/g, '') // Remove single asterisks
      .replace(/_(?!_)/g, '') // Remove single underscores
      .replace(/`(?!`)/g, '') // Remove single backticks
      // Keep valid links as-is
      .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '[$1]($2)');
  }

  stripMarkdown(text) {
    // Remove all markdown formatting
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1') // Italic
      .replace(/__(.*?)__/g, '$1') // Bold
      .replace(/_(.*?)_/g, '$1') // Italic
      .replace(/`(.*?)`/g, '$1') // Code
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '')) // Code blocks
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Links
      .replace(/[*_`[\]()]/g, ''); // Remove remaining markdown chars
  }

  async sendErrorMessage(chatId) {
    await this.sendMessage(chatId, 
      '❌ Sorry, I encountered an error processing your message. Please try again.'
    );
  }

  isAdmin(userId) {
    return this.adminUsers.includes(parseInt(userId));
  }
}