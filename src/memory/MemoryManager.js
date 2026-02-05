import { ShortTermMemory } from './ShortTermMemory.js';
import { LongTermMemory } from './LongTermMemory.js';
import { RAGMemory } from './RAGMemory.js';
import { logger } from '../utils/logger.js';

export class MemoryManager {
  constructor() {
    this.shortTermMemory = new ShortTermMemory();
    this.longTermMemory = new LongTermMemory();
    this.ragMemory = new RAGMemory();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing Memory Manager...');
      
      await this.shortTermMemory.initialize();
      await this.longTermMemory.initialize();
      await this.ragMemory.initialize();
      
      this.isInitialized = true;
      logger.info('Memory Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Memory Manager:', error);
      throw error;
    }
  }

  async addToShortMemory(userId, memoryItem) {
    if (!this.isInitialized) {
      throw new Error('Memory Manager not initialized');
    }

    return await this.shortTermMemory.add(userId, memoryItem);
  }

  async getRelevantContext(userId, query) {
    if (!this.isInitialized) {
      throw new Error('Memory Manager not initialized');
    }

    try {
      // Get recent short-term memories
      const shortTerm = await this.shortTermMemory.getRecent(userId, 10);
      
      // Get relevant long-term memories
      const longTerm = await this.longTermMemory.getRelevant(userId, query, 5);
      
      // Get RAG-based relevant information
      const rag = await this.ragMemory.search(query, 5);

      return {
        shortTerm,
        longTerm,
        rag
      };
    } catch (error) {
      logger.error('Error getting relevant context:', error);
      return { shortTerm: [], longTerm: [], rag: [] };
    }
  }

  async updateLongTermMemory(userId, userMessage, botResponse) {
    try {
      // Check if this interaction should be stored in long-term memory
      const shouldStore = await this.shouldStoreInLongTerm(userMessage, botResponse);
      
      if (shouldStore) {
        await this.longTermMemory.store(userId, {
          userMessage,
          botResponse,
          timestamp: new Date(),
          importance: this.calculateImportance(userMessage, botResponse)
        });

        // Also add to RAG memory for semantic search
        await this.ragMemory.addDocument({
          content: `User: ${userMessage}\nBot: ${botResponse}`,
          metadata: {
            userId,
            timestamp: new Date(),
            type: 'conversation'
          }
        });
      }

      // Check if short-term memory should be consolidated
      await this.consolidateMemoryIfNeeded(userId);
    } catch (error) {
      logger.error('Error updating long-term memory:', error);
    }
  }

  async shouldStoreInLongTerm(userMessage, botResponse) {
    // Store if message contains important keywords
    const importantKeywords = [
      'remember', 'important', 'project', 'deadline', 'meeting',
      'password', 'login', 'configuration', 'settings', 'preference'
    ];

    const messageText = (userMessage + ' ' + botResponse).toLowerCase();
    const hasImportantKeywords = importantKeywords.some(keyword => 
      messageText.includes(keyword)
    );

    // Store if message is long (indicates detailed conversation)
    const isDetailed = userMessage.length > 100 || botResponse.length > 200;

    // Store if it contains questions and answers
    const hasQA = userMessage.includes('?') && botResponse.length > 50;

    return hasImportantKeywords || isDetailed || hasQA;
  }

  calculateImportance(userMessage, botResponse) {
    let importance = 0.5; // Base importance

    // Increase importance for certain keywords
    const highImportanceKeywords = ['important', 'urgent', 'critical', 'remember'];
    const mediumImportanceKeywords = ['project', 'task', 'deadline', 'meeting'];

    const messageText = (userMessage + ' ' + botResponse).toLowerCase();

    highImportanceKeywords.forEach(keyword => {
      if (messageText.includes(keyword)) importance += 0.2;
    });

    mediumImportanceKeywords.forEach(keyword => {
      if (messageText.includes(keyword)) importance += 0.1;
    });

    // Increase importance for longer, more detailed responses
    if (botResponse.length > 500) importance += 0.1;
    if (userMessage.length > 200) importance += 0.1;

    return Math.min(importance, 1.0);
  }

  async consolidateMemoryIfNeeded(userId) {
    const shortTermCount = await this.shortTermMemory.getCount(userId);
    const threshold = parseInt(process.env.LONG_MEMORY_THRESHOLD) || 100;

    if (shortTermCount > threshold) {
      logger.info(`Consolidating memory for user ${userId}`);
      
      // Get older short-term memories
      const oldMemories = await this.shortTermMemory.getOldest(userId, 20);
      
      // Move important ones to long-term memory
      for (const memory of oldMemories) {
        if (memory.importance && memory.importance > 0.7) {
          await this.longTermMemory.store(userId, memory);
        }
      }

      // Clean up old short-term memories
      await this.shortTermMemory.cleanup(userId, threshold * 0.8);
    }
  }

  async getStatus() {
    if (!this.isInitialized) {
      return { initialized: false };
    }

    return {
      initialized: true,
      shortTerm: await this.shortTermMemory.getStatus(),
      longTerm: await this.longTermMemory.getStatus(),
      rag: await this.ragMemory.getStatus()
    };
  }

  async searchMemory(userId, query, options = {}) {
    const results = {
      shortTerm: [],
      longTerm: [],
      rag: []
    };

    try {
      if (options.includeShortTerm !== false) {
        results.shortTerm = await this.shortTermMemory.search(userId, query);
      }

      if (options.includeLongTerm !== false) {
        results.longTerm = await this.longTermMemory.search(userId, query);
      }

      if (options.includeRAG !== false) {
        results.rag = await this.ragMemory.search(query, options.ragLimit || 5);
      }

      return results;
    } catch (error) {
      logger.error('Error searching memory:', error);
      return results;
    }
  }

  async clearUserMemory(userId, type = 'all') {
    try {
      if (type === 'all' || type === 'short') {
        await this.shortTermMemory.clear(userId);
      }

      if (type === 'all' || type === 'long') {
        await this.longTermMemory.clear(userId);
      }

      // Note: RAG memory is shared across users, so we don't clear it per user
      logger.info(`Cleared ${type} memory for user ${userId}`);
    } catch (error) {
      logger.error('Error clearing user memory:', error);
      throw error;
    }
  }
}