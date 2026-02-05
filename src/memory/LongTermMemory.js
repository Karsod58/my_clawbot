import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

export class LongTermMemory {
  constructor() {
    this.db = null;
    this.dbPath = process.env.DATABASE_PATH || './data/minibot.db';
  }

  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Initialize SQLite database with better async support
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      // Create tables
      await this.createTables();
      
      logger.info('Long-term memory initialized with SQLite database');
    } catch (error) {
      logger.error('Failed to initialize long-term memory:', error);
      throw error;
    }
  }

  async createTables() {
    const createMemoryTable = `
      CREATE TABLE IF NOT EXISTS long_term_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        importance REAL DEFAULT 0.5,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_user_id ON long_term_memory(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_timestamp ON long_term_memory(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_importance ON long_term_memory(importance)'
    ];

    await this.db.run(createMemoryTable);
    
    for (const indexQuery of createIndexes) {
      await this.db.run(indexQuery);
    }
  }

  async store(userId, memoryData) {
    try {
      const {
        userMessage,
        botResponse,
        timestamp,
        importance = 0.5,
        metadata = {}
      } = memoryData;

      const content = JSON.stringify({
        userMessage,
        botResponse,
        timestamp
      });

      const metadataStr = JSON.stringify(metadata);

      const query = `
        INSERT INTO long_term_memory (user_id, content, metadata, importance, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `;

      const result = await this.db.run(query, [
        userId,
        content,
        metadataStr,
        importance,
        timestamp || new Date()
      ]);

      const memoryId = result?.lastID || null;
      if (memoryId) {
        logger.debug(`Stored long-term memory for user ${userId}, ID: ${memoryId}`);
      } else {
        logger.warn(`Failed to get lastID for stored memory for user ${userId}`);
      }
      return memoryId;
    } catch (error) {
      logger.error('Error storing long-term memory:', error);
      throw error;
    }
  }

  async getRelevant(userId, query, limit = 5) {
    try {
      // Simple text-based relevance search
      // In production, you might want to use FTS (Full-Text Search) or vector similarity
      const searchQuery = `
        SELECT * FROM long_term_memory 
        WHERE user_id = ? 
        AND (content LIKE ? OR metadata LIKE ?)
        ORDER BY importance DESC, timestamp DESC
        LIMIT ?
      `;

      const searchTerm = `%${query}%`;
      const results = await this.db.all(searchQuery, [userId, searchTerm, searchTerm, limit]);

      return results.map(row => ({
        id: row.id,
        content: JSON.parse(row.content),
        metadata: JSON.parse(row.metadata || '{}'),
        importance: row.importance,
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      logger.error('Error getting relevant long-term memories:', error);
      return [];
    }
  }

  async getRecent(userId, limit = 10) {
    try {
      const query = `
        SELECT * FROM long_term_memory 
        WHERE user_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `;

      const results = await this.db.all(query, [userId, limit]);

      return results.map(row => ({
        id: row.id,
        content: JSON.parse(row.content),
        metadata: JSON.parse(row.metadata || '{}'),
        importance: row.importance,
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      logger.error('Error getting recent long-term memories:', error);
      return [];
    }
  }

  async search(userId, query, options = {}) {
    try {
      const {
        limit = 10,
        minImportance = 0,
        startDate = null,
        endDate = null
      } = options;

      let searchQuery = `
        SELECT * FROM long_term_memory 
        WHERE user_id = ? 
        AND importance >= ?
      `;

      const params = [userId, minImportance];

      // Add text search
      if (query) {
        searchQuery += ` AND (content LIKE ? OR metadata LIKE ?)`;
        const searchTerm = `%${query}%`;
        params.push(searchTerm, searchTerm);
      }

      // Add date range
      if (startDate) {
        searchQuery += ` AND timestamp >= ?`;
        params.push(startDate);
      }

      if (endDate) {
        searchQuery += ` AND timestamp <= ?`;
        params.push(endDate);
      }

      searchQuery += ` ORDER BY importance DESC, timestamp DESC LIMIT ?`;
      params.push(limit);

      const results = await this.db.all(searchQuery, params);

      return results.map(row => ({
        id: row.id,
        content: JSON.parse(row.content),
        metadata: JSON.parse(row.metadata || '{}'),
        importance: row.importance,
        timestamp: new Date(row.timestamp)
      }));
    } catch (error) {
      logger.error('Error searching long-term memory:', error);
      return [];
    }
  }

  async update(id, updates) {
    try {
      const {
        content,
        metadata,
        importance
      } = updates;

      let updateQuery = 'UPDATE long_term_memory SET updated_at = CURRENT_TIMESTAMP';
      const params = [];

      if (content !== undefined) {
        updateQuery += ', content = ?';
        params.push(typeof content === 'string' ? content : JSON.stringify(content));
      }

      if (metadata !== undefined) {
        updateQuery += ', metadata = ?';
        params.push(JSON.stringify(metadata));
      }

      if (importance !== undefined) {
        updateQuery += ', importance = ?';
        params.push(importance);
      }

      updateQuery += ' WHERE id = ?';
      params.push(id);

      const result = await this.db.run(updateQuery, params);
      return result ? result.changes > 0 : false;
    } catch (error) {
      logger.error('Error updating long-term memory:', error);
      return false;
    }
  }

  async delete(id) {
    try {
      const result = await this.db.run('DELETE FROM long_term_memory WHERE id = ?', [id]);
      return result ? result.changes > 0 : false;
    } catch (error) {
      logger.error('Error deleting long-term memory:', error);
      return false;
    }
  }

  async clear(userId) {
    try {
      const result = await this.db.run('DELETE FROM long_term_memory WHERE user_id = ?', [userId]);
      const changes = result ? result.changes : 0;
      logger.info(`Cleared ${changes} long-term memories for user ${userId}`);
      return changes;
    } catch (error) {
      logger.error('Error clearing long-term memory:', error);
      throw error;
    }
  }

  async getStatus() {
    try {
      const totalQuery = 'SELECT COUNT(*) as total FROM long_term_memory';
      const userCountQuery = 'SELECT COUNT(DISTINCT user_id) as users FROM long_term_memory';
      const avgImportanceQuery = 'SELECT AVG(importance) as avg_importance FROM long_term_memory';

      const [totalResult, userCountResult, avgImportanceResult] = await Promise.all([
        this.db.get(totalQuery),
        this.db.get(userCountQuery),
        this.db.get(avgImportanceQuery)
      ]);

      return {
        type: 'long-term',
        totalMemories: totalResult.total,
        totalUsers: userCountResult.users,
        averageImportance: avgImportanceResult.avg_importance || 0,
        databasePath: this.dbPath
      };
    } catch (error) {
      logger.error('Error getting long-term memory status:', error);
      return {
        type: 'long-term',
        error: error.message
      };
    }
  }

  async getMemoryStats(userId) {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total,
          AVG(importance) as avg_importance,
          MIN(timestamp) as oldest,
          MAX(timestamp) as newest
        FROM long_term_memory 
        WHERE user_id = ?
      `;

      const result = await this.db.get(statsQuery, [userId]);

      return {
        totalMemories: result.total,
        averageImportance: result.avg_importance || 0,
        oldestMemory: result.oldest ? new Date(result.oldest) : null,
        newestMemory: result.newest ? new Date(result.newest) : null
      };
    } catch (error) {
      logger.error('Error getting memory stats:', error);
      return null;
    }
  }

  async cleanup(options = {}) {
    try {
      const {
        maxAge = 365, // days
        minImportance = 0.1,
        maxRecords = 10000
      } = options;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);

      // Delete old, low-importance memories
      const cleanupQuery = `
        DELETE FROM long_term_memory 
        WHERE timestamp < ? 
        AND importance < ?
      `;

      const result1 = await this.db.run(cleanupQuery, [cutoffDate, minImportance]);

      // If still too many records, delete oldest ones
      const countResult = await this.db.get('SELECT COUNT(*) as total FROM long_term_memory');
      
      if (countResult.total > maxRecords) {
        const excessRecords = countResult.total - maxRecords;
        const deleteOldestQuery = `
          DELETE FROM long_term_memory 
          WHERE id IN (
            SELECT id FROM long_term_memory 
            ORDER BY timestamp ASC 
            LIMIT ?
          )
        `;
        
        const result2 = await this.db.run(deleteOldestQuery, [excessRecords]);
        const changes1 = result1 ? result1.changes : 0;
        const changes2 = result2 ? result2.changes : 0;
        logger.info(`Cleaned up ${changes1 + changes2} old memories`);
      } else {
        const changes1 = result1 ? result1.changes : 0;
        logger.info(`Cleaned up ${changes1} old memories`);
      }

      return result1 ? result1.changes : 0;
    } catch (error) {
      logger.error('Error cleaning up long-term memory:', error);
      return 0;
    }
  }
}