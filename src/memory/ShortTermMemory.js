import { logger } from '../utils/logger.js';

export class ShortTermMemory {
  constructor() {
    this.memory = new Map(); // userId -> array of memory items
    this.maxItems = parseInt(process.env.SHORT_MEMORY_LIMIT) || 50;
  }

  async initialize() {
    logger.info('Short-term memory initialized');
  }

  async add(userId, memoryItem) {
    if (!this.memory.has(userId)) {
      this.memory.set(userId, []);
    }

    const userMemory = this.memory.get(userId);
    
    // Add timestamp and ID if not present
    const item = {
      id: this.generateId(),
      timestamp: new Date(),
      ...memoryItem
    };

    userMemory.push(item);

    // Keep only the most recent items
    if (userMemory.length > this.maxItems) {
      userMemory.splice(0, userMemory.length - this.maxItems);
    }

    logger.debug(`Added item to short-term memory for user ${userId}`);
    return item.id;
  }

  async getRecent(userId, limit = 10) {
    if (!this.memory.has(userId)) {
      return [];
    }

    const userMemory = this.memory.get(userId);
    return userMemory.slice(-limit).reverse(); // Most recent first
  }

  async getAll(userId) {
    if (!this.memory.has(userId)) {
      return [];
    }

    return [...this.memory.get(userId)];
  }

  async getCount(userId) {
    if (!this.memory.has(userId)) {
      return 0;
    }

    return this.memory.get(userId).length;
  }

  async getOldest(userId, limit = 10) {
    if (!this.memory.has(userId)) {
      return [];
    }

    const userMemory = this.memory.get(userId);
    return userMemory.slice(0, limit);
  }

  async search(userId, query) {
    if (!this.memory.has(userId)) {
      return [];
    }

    const userMemory = this.memory.get(userId);
    const queryLower = query.toLowerCase();

    return userMemory.filter(item => {
      const content = JSON.stringify(item).toLowerCase();
      return content.includes(queryLower);
    });
  }

  async cleanup(userId, keepCount) {
    if (!this.memory.has(userId)) {
      return;
    }

    const userMemory = this.memory.get(userId);
    if (userMemory.length > keepCount) {
      const toKeep = userMemory.slice(-keepCount);
      this.memory.set(userId, toKeep);
      logger.debug(`Cleaned up short-term memory for user ${userId}, kept ${keepCount} items`);
    }
  }

  async clear(userId) {
    if (this.memory.has(userId)) {
      this.memory.delete(userId);
      logger.info(`Cleared short-term memory for user ${userId}`);
    }
  }

  async getStatus() {
    const totalUsers = this.memory.size;
    let totalItems = 0;

    for (const userMemory of this.memory.values()) {
      totalItems += userMemory.length;
    }

    return {
      type: 'short-term',
      totalUsers,
      totalItems,
      maxItemsPerUser: this.maxItems
    };
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Get memory items by type
  async getByType(userId, type) {
    if (!this.memory.has(userId)) {
      return [];
    }

    const userMemory = this.memory.get(userId);
    return userMemory.filter(item => item.type === type);
  }

  // Get memory items within time range
  async getByTimeRange(userId, startTime, endTime) {
    if (!this.memory.has(userId)) {
      return [];
    }

    const userMemory = this.memory.get(userId);
    return userMemory.filter(item => {
      const itemTime = new Date(item.timestamp);
      return itemTime >= startTime && itemTime <= endTime;
    });
  }

  // Update an existing memory item
  async update(userId, itemId, updates) {
    if (!this.memory.has(userId)) {
      return false;
    }

    const userMemory = this.memory.get(userId);
    const itemIndex = userMemory.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      return false;
    }

    userMemory[itemIndex] = {
      ...userMemory[itemIndex],
      ...updates,
      updatedAt: new Date()
    };

    return true;
  }

  // Remove a specific memory item
  async remove(userId, itemId) {
    if (!this.memory.has(userId)) {
      return false;
    }

    const userMemory = this.memory.get(userId);
    const itemIndex = userMemory.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      return false;
    }

    userMemory.splice(itemIndex, 1);
    return true;
  }
}