import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { logger } from '../utils/logger.js';

export class AIModelManager {
  constructor() {
    this.openai = null;
    this.anthropic = null;
    this.gemini = null;
    this.ollamaClient = null;
    this.userModels = new Map(); // userId -> modelName
    // Default to DeepSeek V3.2 - powerful model for reasoning and coding with fast responses
    this.defaultModel = process.env.DEFAULT_MODEL || 'deepseek-v3.2';
    this.availableModels = {
      // Commercial models
      'gpt-4': { provider: 'openai', model: 'gpt-4', type: 'commercial' },
      'gpt-3.5-turbo': { provider: 'openai', model: 'gpt-3.5-turbo', type: 'commercial' },
      'claude-3-sonnet': { provider: 'anthropic', model: 'claude-3-sonnet-20240229', type: 'commercial' },
      'claude-3-haiku': { provider: 'anthropic', model: 'claude-3-haiku-20240307', type: 'commercial' },
      
      // Google Gemini models
      'gemini-pro': { provider: 'gemini', model: 'gemini-pro', type: 'commercial' },
      'gemini-pro-vision': { provider: 'gemini', model: 'gemini-pro-vision', type: 'commercial' },
      'gemini-1.5-pro': { provider: 'gemini', model: 'gemini-1.5-pro', type: 'commercial' },
      'gemini-1.5-flash': { provider: 'gemini', model: 'gemini-1.5-flash', type: 'commercial' },
      
      // Ollama Cloud API models (available on-demand)
      'deepseek-v3.2': { provider: 'ollama', model: 'deepseek-v3.2', type: 'agentic' },
      'deepseek-v3.1': { provider: 'ollama', model: 'deepseek-v3.1:671b', type: 'agentic' },
      'gpt-oss-120b': { provider: 'ollama', model: 'gpt-oss:120b', type: 'agentic' },
      'gpt-oss-20b': { provider: 'ollama', model: 'gpt-oss:20b', type: 'agentic' },
      'qwen3-coder': { provider: 'ollama', model: 'qwen3-coder:480b', type: 'agentic' },
      'qwen3-next': { provider: 'ollama', model: 'qwen3-next:80b', type: 'agentic' },
      'kimi-k2.5': { provider: 'ollama', model: 'kimi-k2.5', type: 'agentic' },
      'kimi-k2-thinking': { provider: 'ollama', model: 'kimi-k2-thinking', type: 'agentic' },
      'mistral-large-3': { provider: 'ollama', model: 'mistral-large-3:675b', type: 'agentic' },
      'devstral-2': { provider: 'ollama', model: 'devstral-2:123b', type: 'agentic' },
      'devstral-small-2': { provider: 'ollama', model: 'devstral-small-2:24b', type: 'agentic' },
      'minimax-m2.1': { provider: 'ollama', model: 'minimax-m2.1', type: 'agentic' },
      'cogito-2.1': { provider: 'ollama', model: 'cogito-2.1:671b', type: 'agentic' },
      
      // Lightweight models for testing
      'ministral-3-3b': { provider: 'ollama', model: 'ministral-3:3b', type: 'lightweight' },
      'ministral-3-8b': { provider: 'ollama', model: 'ministral-3:8b', type: 'lightweight' },
      'ministral-3-14b': { provider: 'ollama', model: 'ministral-3:14b', type: 'lightweight' },
      'gemma3-4b': { provider: 'ollama', model: 'gemma3:4b', type: 'lightweight' },
      'gemma3-12b': { provider: 'ollama', model: 'gemma3:12b', type: 'lightweight' },
      'rnj-1': { provider: 'ollama', model: 'rnj-1:8b', type: 'lightweight' },
      
      // Note: Legacy local models removed - using Ollama Cloud API models only
    };
  }

  async initialize() {
    try {
      // Initialize commercial providers if API keys are available
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        logger.info('OpenAI client initialized');
      }

      if (process.env.ANTHROPIC_API_KEY) {
        this.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });
        logger.info('Anthropic client initialized');
      }

      // Initialize Google Gemini
      if (process.env.GEMINI_API_KEY) {
        this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        logger.info('Google Gemini client initialized');
      }

      // Initialize Ollama client
      const ollamaUrl = process.env.OLLAMA_URL || 'https://ollama.com';
      const ollamaHeaders = {};

      // Authenticate to Ollama API
      if (process.env.OLLAMA_API_KEY) {
        ollamaHeaders['Authorization'] = `Bearer ${process.env.OLLAMA_API_KEY}`;
        logger.info('Ollama API key configured');
      } else {
        logger.warn('No Ollama API key found - using local endpoint');
      }

      this.ollamaClient = axios.create({
        baseURL: ollamaUrl,
        timeout: 60000, // 60 seconds for model inference
        headers: ollamaHeaders
      });

      // Test Ollama connection
      try {
        // For Ollama API service, we don't need to check installed models
        // The models are available on-demand via the API
        if (process.env.OLLAMA_API_KEY) {
          logger.info('Ollama API client initialized and connected');
          // Mark all Ollama models as available since they're served via API
          this.markOllamaModelsAsAvailable();
        } else {
          // For local Ollama, check what models are installed
          await this.ollamaClient.get('/api/tags');
          logger.info('Ollama local client initialized and connected');
          await this.updateOllamaModels();
        }
      } catch (error) {
        logger.warn('Ollama not available:', error.message);
      }

      // Initialize Hugging Face local client if configured (deprecated)
      // Note: Using API-based approach instead of local deployment

      // Check if at least one provider is available
      if (!this.openai && !this.anthropic && !this.ollamaClient) {
        logger.warn('No AI model providers available. Please configure at least one provider.');
      }
    } catch (error) {
      logger.error('Failed to initialize AI models:', error);
      throw error;
    }
  }

  getCurrentModel(userId) {
    const userModel = this.userModels.get(userId);
    
    // If user has a model set, check if it's still available
    if (userModel && this.availableModels[userModel]) {
      return userModel;
    }
    
    // If user model is not available anymore, clear it and use default
    if (userModel && !this.availableModels[userModel]) {
      logger.warn(`User model ${userModel} no longer available, switching to default`);
      this.userModels.delete(userId);
    }
    
    return this.defaultModel;
  }

  setUserModel(userId, modelName) {
    if (!this.availableModels[modelName]) {
      throw new Error(`Model ${modelName} not available`);
    }
    this.userModels.set(userId, modelName);
    return true;
  }

  clearUserModel(userId) {
    this.userModels.delete(userId);
    logger.info(`Cleared model preference for user ${userId}, using default: ${this.defaultModel}`);
  }

  clearAllUserModels() {
    this.userModels.clear();
    logger.info('Cleared all user model preferences');
  }

  getAvailableModels() {
    return Object.keys(this.availableModels);
  }

  async generateResponse({ message, context, thoughtProcess, userId }) {
    const modelName = this.getCurrentModel(userId);
    const modelConfig = this.availableModels[modelName];

    if (!modelConfig) {
      throw new Error(`Model ${modelName} not configured`);
    }

    const systemPrompt = this.buildSystemPrompt(context, thoughtProcess);
    const userPrompt = this.buildUserPrompt(message, thoughtProcess);

    try {
      if (modelConfig.provider === 'openai') {
        return await this.generateOpenAIResponse(modelConfig.model, systemPrompt, userPrompt);
      } else if (modelConfig.provider === 'anthropic') {
        return await this.generateAnthropicResponse(modelConfig.model, systemPrompt, userPrompt);
      } else if (modelConfig.provider === 'gemini') {
        return await this.generateGeminiResponse(modelConfig.model, systemPrompt, userPrompt);
      } else if (modelConfig.provider === 'ollama') {
        return await this.generateOllamaResponse(modelConfig.model, systemPrompt, userPrompt);
      }
    } catch (error) {
      logger.error(`Error generating response with ${modelName}:`, error);
      
      // Fallback to available model
      const fallbackModel = await this.getFallbackModel(modelConfig.provider);
      if (fallbackModel && fallbackModel !== modelName) {
        logger.info(`Falling back to model: ${fallbackModel}`);
        return await this.generateResponse({ 
          message, 
          context, 
          thoughtProcess, 
          userId: userId + '_fallback' // Prevent infinite recursion
        });
      }
      
      // If no fallback available, use simple response
      logger.warn('No AI models available, using fallback response');
      return await this.generateFallbackResponse(message, context);
    }
  }

  async generateOpenAIResponse(model, systemPrompt, userPrompt) {
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    return response.choices[0].message.content;
  }

  async generateAnthropicResponse(model, systemPrompt, userPrompt) {
    const response = await this.anthropic.messages.create({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.7,
      max_tokens: 2000
    });

    return response.content[0].text;
  }

  async generateGeminiResponse(model, systemPrompt, userPrompt) {
    if (!this.gemini) {
      throw new Error('Gemini client not initialized');
    }

    try {
      const genModel = this.gemini.getGenerativeModel({ model });
      
      // Combine system prompt and user prompt for Gemini
      const fullPrompt = `${systemPrompt}\n\nUser: ${userPrompt}\nAssistant:`;
      
      const result = await genModel.generateContent(fullPrompt);
      const response = await result.response;
      
      return response.text();
    } catch (error) {
      logger.error('Gemini API error:', error);
      throw error;
    }
  }

  async generateOllamaResponse(model, systemPrompt, userPrompt) {
    if (!this.ollamaClient) {
      throw new Error('Ollama client not initialized');
    }

    try {
      const response = await this.ollamaClient.post('/api/generate', {
        model,
        prompt: `${systemPrompt}\n\nUser: ${userPrompt}\nAssistant:`,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
          num_ctx: 2048,  // Reduce context window to save memory
          num_predict: 256 // Limit response length
        }
      });

      const responseData = response.data;
      
      // Handle different response formats
      if (responseData.response && responseData.response.trim()) {
        return responseData.response;
      } else if (responseData.thinking && responseData.thinking.trim()) {
        // Some models (like DeepSeek) use thinking mode - extract the final answer
        const thinking = responseData.thinking;
        // Try to find the actual response at the end of the thinking process
        const lines = thinking.split('\n');
        const lastMeaningfulLine = lines.reverse().find(line => 
          line.trim() && !line.includes('thinking') && !line.includes('reasoning')
        );
        return lastMeaningfulLine || thinking.substring(0, 200) + '...';
      } else {
        return 'I apologize, but I encountered an issue generating a response.';
      }
    } catch (error) {
      logger.error(`Ollama API error for model ${model}:`, error.message);
      
      // If the model process was killed, suggest a lighter model
      if (error.message.includes('terminated') || error.message.includes('killed')) {
        throw new Error(`Model ${model} requires more resources than available. Try using a lighter model or restart Ollama.`);
      }
      
      throw error;
    }
  }

  buildSystemPrompt(context, thoughtProcess) {
    return `You are MiniBot, an AI assistant with advanced memory and reasoning capabilities.

Context from memory:
${context.shortTerm ? 'Recent conversation: ' + JSON.stringify(context.shortTerm, null, 2) : ''}
${context.longTerm ? 'Relevant long-term memory: ' + JSON.stringify(context.longTerm, null, 2) : ''}
${context.rag ? 'Retrieved knowledge: ' + JSON.stringify(context.rag, null, 2) : ''}

Thought process:
${thoughtProcess ? JSON.stringify(thoughtProcess, null, 2) : 'No specific thought process provided'}

Instructions:
- Provide helpful, accurate, and contextual responses
- Use the memory context to maintain conversation continuity
- Be concise but thorough
- If you need to perform actions via MCP, explain what you're doing`;
  }

  buildUserPrompt(message, thoughtProcess) {
    let prompt = `User message: ${message}`;
    
    if (thoughtProcess && thoughtProcess.actions) {
      prompt += `\n\nAvailable actions: ${thoughtProcess.actions.join(', ')}`;
    }

    return prompt;
  }

  async updateOllamaModels() {
    try {
      const response = await this.ollamaClient.get('/api/tags');
      const installedModels = response.data.models || [];
      
      logger.info(`Found ${installedModels.length} Ollama models:`, 
        installedModels.map(m => m.name).join(', '));
      
      // Update available models based on what's actually installed
      for (const [key, config] of Object.entries(this.availableModels)) {
        if (config.provider === 'ollama') {
          const isInstalled = installedModels.some(m => 
            m.name === config.model || m.name.startsWith(config.model.split(':')[0])
          );
          if (!isInstalled) {
            logger.warn(`Ollama model ${config.model} not installed locally`);
          }
        }
      }
    } catch (error) {
      logger.error('Error updating Ollama models:', error);
    }
  }

  markOllamaModelsAsAvailable() {
    // For Ollama API service, all models are available on-demand
    const ollamaModels = Object.entries(this.availableModels)
      .filter(([key, config]) => config.provider === 'ollama')
      .map(([key, config]) => key);
    
    logger.info(`Ollama API models available: ${ollamaModels.join(', ')}`);
  }

  async getFallbackModel(failedProvider) {
    // Try to find an available model from a different provider
    const providerPriority = ['gemini', 'ollama', 'openai', 'anthropic'];
    
    for (const provider of providerPriority) {
      if (provider === failedProvider) continue;
      
      for (const [modelName, config] of Object.entries(this.availableModels)) {
        if (config.provider === provider) {
          // Check if provider is available
          if (provider === 'gemini' && this.gemini) return modelName;
          if (provider === 'ollama' && this.ollamaClient) return modelName;
          if (provider === 'openai' && this.openai) return modelName;
          if (provider === 'anthropic' && this.anthropic) return modelName;
        }
      }
    }
    
    return null;
  }

  async generateFallbackResponse(message, context) {
    // Simple rule-based fallback when AI models are not available
    const responses = [
      "I'm having trouble with my AI models right now, but I'm here to help! You can try:",
      "• Use /model list to see available models",
      "• Use /status to check system status", 
      "• Ask me about GitHub repositories (that still works!)",
      "• Try /reset to reset my configuration"
    ];
    
    return responses.join('\n');
  }

  getModelsByType(type = null) {
    if (!type) return this.getAvailableModels();
    
    return Object.keys(this.availableModels).filter(modelName => 
      this.availableModels[modelName].type === type
    );
  }

  getOpenSourceModels() {
    // Return Ollama models (both agentic and lightweight)
    return Object.keys(this.availableModels).filter(modelName => 
      this.availableModels[modelName].provider === 'ollama'
    );
  }

  getCommercialModels() {
    return this.getModelsByType('commercial');
  }

  async pullOllamaModel(modelName) {
    if (!this.ollamaClient) {
      throw new Error('Ollama client not initialized');
    }

    try {
      logger.info(`Pulling Ollama model: ${modelName}`);
      
      const response = await this.ollamaClient.post('/api/pull', {
        name: modelName
      });

      logger.info(`Successfully pulled model: ${modelName}`);
      await this.updateOllamaModels();
      
      return true;
    } catch (error) {
      logger.error(`Error pulling Ollama model ${modelName}:`, error);
      return false;
    }
  }

  async getModelInfo(modelName) {
    const config = this.availableModels[modelName];
    if (!config) return null;

    const info = {
      name: modelName,
      provider: config.provider,
      model: config.model,
      type: config.type,
      available: false
    };

    // Check availability based on provider
    switch (config.provider) {
      case 'openai':
        info.available = !!this.openai;
        break;
      case 'anthropic':
        info.available = !!this.anthropic;
        break;
      case 'gemini':
        info.available = !!this.gemini;
        break;
      case 'ollama':
        info.available = !!this.ollamaClient;
        if (info.available && process.env.OLLAMA_API_KEY) {
          // For Ollama API service, models are available on-demand
          info.available = true;
        } else if (info.available) {
          // For local Ollama, check if model is installed
          try {
            const response = await this.ollamaClient.get('/api/tags');
            const installedModels = response.data.models || [];
            info.available = installedModels.some(m => 
              m.name === config.model || m.name.startsWith(config.model.split(':')[0])
            );
          } catch (error) {
            info.available = false;
          }
        }
        break;
    }

    return info;
  }
}
