import { MemoryManager } from '../memory/MemoryManager.js';
import { AIModelManager } from './AIModelManager.js';
import { ThoughtChain } from './ThoughtChain.js';
import { MCPManager } from '../mcp/MCPManager.js';
import { logger } from '../utils/logger.js';

export class MiniBotCore {
  constructor() {
    this.memoryManager = new MemoryManager();
    this.aiModelManager = new AIModelManager();
    this.thoughtChain = new ThoughtChain();
    this.mcpManager = new MCPManager();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing MiniBot Core...');
      
      await this.memoryManager.initialize();
      await this.aiModelManager.initialize();
      await this.mcpManager.initialize();
      
      this.isInitialized = true;
      logger.info('MiniBot Core initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MiniBot Core:', error);
      throw error;
    }
  }

  async processMessage(message, userId, platform = 'unknown') {
    if (!this.isInitialized) {
      throw new Error('MiniBot Core not initialized');
    }

    try {
      logger.info(`Processing message from user ${userId} on ${platform}`);
      
      // Store incoming message in short-term memory
      await this.memoryManager.addToShortMemory(userId, {
        type: 'user_message',
        content: message,
        timestamp: new Date(),
        platform
      });

      // Retrieve relevant context from memory
      const context = await this.memoryManager.getRelevantContext(userId, message);
      
      // Process through thought chain
      const thoughtProcess = await this.thoughtChain.process({
        message,
        userId,
        context,
        mcpManager: this.mcpManager,
        aiModel: this.aiModelManager.getCurrentModel(userId)
      });

      // Generate response using AI model
      const response = await this.aiModelManager.generateResponse({
        message,
        context,
        thoughtProcess,
        userId
      });

      // Store response in memory
      await this.memoryManager.addToShortMemory(userId, {
        type: 'bot_response',
        content: response,
        timestamp: new Date(),
        thoughtProcess
      });

      // Update long-term memory if needed
      await this.memoryManager.updateLongTermMemory(userId, message, response);

      return response;
    } catch (error) {
      logger.error('Error processing message:', error);
      return 'I apologize, but I encountered an error processing your message. Please try again.';
    }
  }

  async getStatus() {
    return {
      initialized: this.isInitialized,
      memory: await this.memoryManager.getStatus(),
      aiModels: this.aiModelManager.getAvailableModels(),
      mcpServers: await this.mcpManager.getStatus()
    };
  }

  async setUserModel(userId, modelName) {
    return this.aiModelManager.setUserModel(userId, modelName);
  }
}