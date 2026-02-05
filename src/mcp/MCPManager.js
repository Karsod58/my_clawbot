import { GitHubMCP } from './GitHubMCP.js';
import { FigmaMCP } from './FigmaMCP.js';
import { logger } from '../utils/logger.js';

export class MCPManager {
  constructor() {
    this.servers = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('Initializing MCP Manager...');

      // Initialize GitHub MCP if token is provided
      if (process.env.GITHUB_TOKEN) {
        try {
          const githubMCP = new GitHubMCP();
          await githubMCP.initialize();
          this.servers.set('github', githubMCP);
          logger.info('GitHub MCP initialized');
        } catch (error) {
          logger.warn('GitHub MCP initialization failed:', error.message);
        }
      }

      // Initialize Figma MCP if token is provided
      if (process.env.FIGMA_TOKEN) {
        try {
          const figmaMCP = new FigmaMCP();
          await figmaMCP.initialize();
          this.servers.set('figma', figmaMCP);
          logger.info('Figma MCP initialized');
        } catch (error) {
          logger.warn('Figma MCP initialization failed:', error.message);
        }
      }

      this.isInitialized = true;
      logger.info(`MCP Manager initialized with ${this.servers.size} servers`);
    } catch (error) {
      logger.error('Failed to initialize MCP Manager:', error);
      // Don't throw error - allow app to continue without MCP
      this.isInitialized = true;
    }
  }

  async executeAction(action, userId) {
    if (!this.isInitialized) {
      throw new Error('MCP Manager not initialized');
    }

    const { type, operation, parameters } = action;
    
    if (!this.servers.has(type)) {
      throw new Error(`MCP server '${type}' not available`);
    }

    const server = this.servers.get(type);
    
    try {
      logger.info(`Executing ${type} action: ${operation} for user ${userId}`);
      const result = await server.executeOperation(operation, parameters, userId);
      
      // Store the action result in memory for future reference
      await this.storeActionResult(type, operation, parameters, result, userId);
      
      return result;
    } catch (error) {
      logger.error(`Error executing ${type} action:`, error);
      throw error;
    }
  }

  async storeActionResult(serverType, operation, parameters, result, userId) {
    try {
      // This could be enhanced to store results in RAG memory for future retrieval
      const actionRecord = {
        serverType,
        operation,
        parameters,
        result: typeof result === 'object' ? JSON.stringify(result) : result,
        userId,
        timestamp: new Date(),
        success: true
      };

      // For now, just log the action
      logger.debug('Action executed successfully:', actionRecord);
      
      // In a full implementation, you might want to:
      // 1. Store successful actions in RAG memory
      // 2. Cache frequently used results
      // 3. Track user preferences and patterns
    } catch (error) {
      logger.error('Error storing action result:', error);
    }
  }

  async getAvailableActions(serverType = null) {
    if (serverType) {
      if (!this.servers.has(serverType)) {
        return [];
      }
      return this.servers.get(serverType).getAvailableOperations();
    }

    // Return all available actions from all servers
    const allActions = {};
    for (const [type, server] of this.servers) {
      allActions[type] = server.getAvailableOperations();
    }
    return allActions;
  }

  async getServerCapabilities(serverType) {
    if (!this.servers.has(serverType)) {
      return null;
    }

    const server = this.servers.get(serverType);
    return {
      type: serverType,
      operations: server.getAvailableOperations(),
      description: server.getDescription(),
      status: server.getStatus()
    };
  }

  async getStatus() {
    const status = {};
    
    for (const [type, server] of this.servers) {
      try {
        status[type] = {
          initialized: true,
          status: server.getStatus(),
          operations: server.getAvailableOperations().length,
          description: server.getDescription()
        };
      } catch (error) {
        status[type] = {
          initialized: false,
          error: error.message
        };
      }
    }

    return status;
  }

  hasServer(serverType) {
    return this.servers.has(serverType);
  }

  getServer(serverType) {
    return this.servers.get(serverType);
  }

  async validateAction(action) {
    const { type, operation, parameters } = action;

    if (!this.servers.has(type)) {
      return {
        valid: false,
        error: `Server '${type}' not available`
      };
    }

    const server = this.servers.get(type);
    const availableOps = server.getAvailableOperations();

    if (!availableOps.includes(operation)) {
      return {
        valid: false,
        error: `Operation '${operation}' not supported by ${type} server`
      };
    }

    // Additional parameter validation could be added here
    return {
      valid: true
    };
  }

  async executeMultipleActions(actions, userId) {
    const results = [];

    for (const action of actions) {
      try {
        const validation = await this.validateAction(action);
        if (!validation.valid) {
          results.push({
            action,
            success: false,
            error: validation.error
          });
          continue;
        }

        const result = await this.executeAction(action, userId);
        results.push({
          action,
          success: true,
          result
        });
      } catch (error) {
        results.push({
          action,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async searchActionHistory(userId, query, options = {}) {
    // This would search through stored action results
    // For now, return empty array as we're not storing history yet
    return [];
  }

  async getActionSuggestions(context, userId) {
    const suggestions = [];

    // Analyze context to suggest relevant actions
    const contextText = JSON.stringify(context).toLowerCase();

    // GitHub suggestions
    if (this.servers.has('github')) {
      if (contextText.includes('repository') || contextText.includes('repo') || 
          contextText.includes('github') || contextText.includes('code')) {
        suggestions.push({
          server: 'github',
          operation: 'list_repositories',
          description: 'List your GitHub repositories',
          confidence: 0.8
        });
      }

      if (contextText.includes('issue') || contextText.includes('bug')) {
        suggestions.push({
          server: 'github',
          operation: 'list_issues',
          description: 'List repository issues',
          confidence: 0.7
        });
      }
    }

    // Figma suggestions
    if (this.servers.has('figma')) {
      if (contextText.includes('design') || contextText.includes('figma') || 
          contextText.includes('prototype') || contextText.includes('component')) {
        suggestions.push({
          server: 'figma',
          operation: 'list_files',
          description: 'List your Figma files',
          confidence: 0.8
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
}