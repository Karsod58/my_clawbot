import { logger } from '../utils/logger.js';

export class ThoughtChain {
  constructor() {
    this.steps = ['analyze', 'plan', 'execute', 'reflect'];
  }

  async process({ message, userId, context, mcpManager, aiModel }) {
    const thoughtProcess = {
      timestamp: new Date(),
      userId,
      message,
      steps: {},
      actions: [],
      reasoning: []
    };

    try {
      // Step 1: Analyze the input
      thoughtProcess.steps.analyze = await this.analyzeInput(message, context);
      
      // Step 2: Plan the response
      thoughtProcess.steps.plan = await this.planResponse(message, context, mcpManager);
      
      // Step 3: Execute actions if needed
      if (thoughtProcess.steps.plan.requiresActions) {
        thoughtProcess.steps.execute = await this.executeActions(
          thoughtProcess.steps.plan.actions,
          mcpManager,
          userId
        );
      }
      
      // Step 4: Reflect on the process
      thoughtProcess.steps.reflect = await this.reflectOnProcess(thoughtProcess);

      return thoughtProcess;
    } catch (error) {
      logger.error('Error in thought chain process:', error);
      thoughtProcess.error = error.message;
      return thoughtProcess;
    }
  }

  async analyzeInput(message, context) {
    const analysis = {
      intent: this.detectIntent(message),
      entities: this.extractEntities(message),
      sentiment: this.analyzeSentiment(message),
      complexity: this.assessComplexity(message),
      contextRelevance: this.assessContextRelevance(message, context)
    };

    return analysis;
  }

  async planResponse(message, context, mcpManager) {
    const plan = {
      responseType: 'text',
      requiresActions: false,
      actions: [],
      reasoning: []
    };

    // Check if message requires MCP actions
    const mcpActions = await this.identifyMCPActions(message, mcpManager);
    if (mcpActions.length > 0) {
      plan.requiresActions = true;
      plan.actions = mcpActions;
      plan.reasoning.push('Message requires external tool usage');
    }

    // Determine response strategy
    if (this.isQuestionAboutMemory(message)) {
      plan.responseType = 'memory_query';
      plan.reasoning.push('User is asking about stored information');
    } else if (this.isCommandMessage(message)) {
      plan.responseType = 'command';
      plan.reasoning.push('User is giving a command or instruction');
    } else {
      plan.responseType = 'conversational';
      plan.reasoning.push('Standard conversational response');
    }

    return plan;
  }

  async executeActions(actions, mcpManager, userId) {
    const results = [];

    for (const action of actions) {
      try {
        const result = await mcpManager.executeAction(action, userId);
        results.push({
          action: action.type,
          success: true,
          result
        });
      } catch (error) {
        logger.error(`Failed to execute action ${action.type}:`, error);
        results.push({
          action: action.type,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async reflectOnProcess(thoughtProcess) {
    const reflection = {
      processQuality: 'good',
      improvements: [],
      confidence: 0.8,
      nextSteps: []
    };

    // Assess if all steps completed successfully
    if (thoughtProcess.error) {
      reflection.processQuality = 'poor';
      reflection.improvements.push('Handle errors more gracefully');
      reflection.confidence = 0.3;
    }

    // Check if actions were successful
    if (thoughtProcess.steps.execute) {
      const failedActions = thoughtProcess.steps.execute.filter(r => !r.success);
      if (failedActions.length > 0) {
        reflection.processQuality = 'fair';
        reflection.improvements.push('Improve action execution reliability');
        reflection.confidence = 0.6;
      }
    }

    return reflection;
  }

  detectIntent(message) {
    const intents = {
      question: /\?|what|how|when|where|why|who/i,
      command: /please|can you|could you|do|create|make|build/i,
      greeting: /hello|hi|hey|good morning|good afternoon/i,
      goodbye: /bye|goodbye|see you|farewell/i,
      memory: /remember|recall|what did|previous|before/i
    };

    for (const [intent, pattern] of Object.entries(intents)) {
      if (pattern.test(message)) {
        return intent;
      }
    }

    return 'unknown';
  }

  extractEntities(message) {
    // Simple entity extraction - in production, use NLP libraries
    const entities = {
      urls: message.match(/https?:\/\/[^\s]+/g) || [],
      mentions: message.match(/@\w+/g) || [],
      hashtags: message.match(/#\w+/g) || [],
      numbers: message.match(/\d+/g) || []
    };

    return entities;
  }

  analyzeSentiment(message) {
    // Simple sentiment analysis - in production, use proper sentiment analysis
    const positive = /good|great|awesome|excellent|love|like|happy|pleased/i;
    const negative = /bad|terrible|awful|hate|dislike|sad|angry|frustrated/i;

    if (positive.test(message)) return 'positive';
    if (negative.test(message)) return 'negative';
    return 'neutral';
  }

  assessComplexity(message) {
    const wordCount = message.split(' ').length;
    const hasQuestions = (message.match(/\?/g) || []).length;
    const hasCommands = /please|can you|could you/i.test(message);

    if (wordCount > 50 || hasQuestions > 2 || hasCommands) {
      return 'high';
    } else if (wordCount > 20 || hasQuestions > 0) {
      return 'medium';
    }
    return 'low';
  }

  assessContextRelevance(message, context) {
    if (!context || (!context.shortTerm && !context.longTerm)) {
      return 'none';
    }

    // Simple relevance check - in production, use semantic similarity
    const contextText = JSON.stringify(context).toLowerCase();
    const messageWords = message.toLowerCase().split(' ');
    
    const relevantWords = messageWords.filter(word => 
      word.length > 3 && contextText.includes(word)
    );

    const relevanceRatio = relevantWords.length / messageWords.length;
    
    if (relevanceRatio > 0.3) return 'high';
    if (relevanceRatio > 0.1) return 'medium';
    return 'low';
  }

  async identifyMCPActions(message, mcpManager) {
    const actions = [];

    // Check for GitHub-related actions
    if (/github|repository|repo|code|commit|pull request|pr/i.test(message)) {
      actions.push({
        type: 'github',
        operation: this.detectGitHubOperation(message),
        parameters: this.extractGitHubParameters(message)
      });
    }

    // Check for Figma-related actions
    if (/figma|design|prototype|component|frame/i.test(message)) {
      actions.push({
        type: 'figma',
        operation: this.detectFigmaOperation(message),
        parameters: this.extractFigmaParameters(message)
      });
    }

    return actions;
  }

  detectGitHubOperation(message) {
    if (/create.*issue|new.*issue|issue.*about/i.test(message)) return 'create_issue';
    if (/list.*repo|show.*repo|my.*repo/i.test(message)) return 'list_repositories';
    if (/list.*issue|show.*issue/i.test(message)) return 'list_issues';
    if (/list.*commit|show.*commit/i.test(message)) return 'list_commits';
    if (/pull.*request|pr/i.test(message)) return 'get_pull_requests';
    if (/file.*content|show.*file|get.*file/i.test(message)) return 'get_file_content';
    if (/search.*repo/i.test(message)) return 'search_repositories';
    if (/user.*info|profile/i.test(message)) return 'get_user_info';
    
    // If message contains owner/repo pattern, get specific repository
    if (/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(message)) {
      return 'get_repository';
    }
    
    // Default to listing repositories for general GitHub queries
    return 'list_repositories';
  }

  detectFigmaOperation(message) {
    if (/create|new/i.test(message)) return 'create_component';
    if (/list.*project|show.*project/i.test(message)) return 'list_team_projects';
    if (/list.*file|show.*file/i.test(message)) return 'get_project_files';
    if (/get.*file|file.*detail/i.test(message)) return 'get_file';
    if (/node|component|frame/i.test(message)) return 'get_file_nodes';
    if (/user.*info|profile/i.test(message)) return 'get_user_info';
    
    // Default to getting user info for general Figma queries
    return 'get_user_info';
  }

  extractGitHubParameters(message) {
    const params = {
      repository: this.extractRepository(message),
      branch: this.extractBranch(message),
      file: this.extractFile(message),
      title: this.extractIssueTitle(message),
      body: this.extractIssueBody(message)
    };

    // If we have a repository, try to split it into owner/repo
    if (params.repository && params.repository.includes('/')) {
      const [owner, repo] = params.repository.split('/');
      params.owner = owner;
      params.repo = repo;
    } else if (params.repository) {
      // If only repo name is provided, assume current user is owner
      params.repo = params.repository;
      // We'll need to get the owner from GitHub user info
    }

    return params;
  }

  extractFigmaParameters(message) {
    return {
      fileId: this.extractFigmaFileId(message),
      nodeId: this.extractFigmaNodeId(message)
    };
  }

  extractRepository(message) {
    // Look for patterns like "owner/repo", "repository owner/repo", or "my repository repo_name"
    const repoMatch = message.match(/(?:repo|repository)\s+([^\s]+\/[^\s]+)/i) ||
                     message.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/) ||
                     message.match(/(?:my\s+)?(?:repo|repository)\s+([a-zA-Z0-9_.-]+)/i);
    return repoMatch ? repoMatch[1] : null;
  }

  extractIssueTitle(message) {
    // Look for patterns like "about the 'title'" or "titled 'title'" or "issue 'title'"
    const titleMatch = message.match(/(?:about|titled?|issue)\s+['""]([^'""]+)['""]/) ||
                      message.match(/['""]([^'""]+)['""]/) ||
                      message.match(/about\s+(.+?)(?:\s+in|\s+for|$)/i);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  extractIssueBody(message) {
    // Look for additional context or description
    const bodyMatch = message.match(/(?:description|details?|body):\s*(.+)/i);
    return bodyMatch ? bodyMatch[1].trim() : null;
  }

  extractBranch(message) {
    const branchMatch = message.match(/(?:branch)\s+([^\s]+)/i);
    return branchMatch ? branchMatch[1] : 'main';
  }

  extractFile(message) {
    const fileMatch = message.match(/(?:file)\s+([^\s]+)/i);
    return fileMatch ? fileMatch[1] : null;
  }

  extractFigmaFileId(message) {
    const figmaUrlMatch = message.match(/figma\.com\/file\/([^\/]+)/);
    return figmaUrlMatch ? figmaUrlMatch[1] : null;
  }

  extractFigmaNodeId(message) {
    const nodeMatch = message.match(/node-id=([^&\s]+)/);
    return nodeMatch ? nodeMatch[1] : null;
  }

  isQuestionAboutMemory(message) {
    return /remember|recall|what did|previous|before|earlier|last time/i.test(message);
  }

  isCommandMessage(message) {
    return /please|can you|could you|do|create|make|build|help me/i.test(message);
  }
}