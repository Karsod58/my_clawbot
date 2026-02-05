import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export class RAGMemory {
  constructor() {
    this.client = null;
    this.collection = null;
    this.openai = null;
    this.collectionName = 'minibot_rag';
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.vectorDbPath = process.env.VECTOR_DB_PATH || './data/vector_db';
  }

  async initialize() {
    try {
      // For now, we'll disable ChromaDB and use a simple in-memory store
      // This can be enabled later when ChromaDB server is running
      logger.warn('ChromaDB disabled - using simple in-memory RAG storage');
      
      // Initialize OpenAI for embeddings if available
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        logger.info('OpenAI client initialized for embeddings');
      } else {
        logger.warn('OpenAI API key not found - RAG memory will have limited functionality');
      }

      // Use simple in-memory storage for now
      this.documents = new Map();
      
      logger.info('RAG memory initialized with in-memory storage');
    } catch (error) {
      logger.error('Failed to initialize RAG memory:', error);
      throw error;
    }
  }

  async addDocument(document) {
    try {
      const { content, metadata = {} } = document;
      
      if (!content || content.trim().length === 0) {
        throw new Error('Document content cannot be empty');
      }

      // Generate unique ID
      const id = this.generateDocumentId(content, metadata);

      // For simple in-memory storage
      if (!this.client) {
        this.documents.set(id, {
          id,
          content,
          metadata: {
            ...metadata,
            addedAt: new Date().toISOString(),
            contentLength: content.length
          }
        });
        
        logger.debug(`Added document to in-memory RAG storage: ${id}`);
        return id;
      }

      // Original ChromaDB code (when available)
      const embedding = await this.generateEmbedding(content);
      
      await this.collection.add({
        ids: [id],
        embeddings: [embedding],
        documents: [content],
        metadatas: [{
          ...metadata,
          addedAt: new Date().toISOString(),
          contentLength: content.length
        }]
      });

      logger.debug(`Added document to RAG memory: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error adding document to RAG memory:', error);
      throw error;
    }
  }

  async search(query, limit = 5, options = {}) {
    try {
      if (!query || query.trim().length === 0) {
        return [];
      }

      // For simple in-memory storage (fallback when ChromaDB not available)
      if (!this.client) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        for (const [id, doc] of this.documents) {
          if (doc.content.toLowerCase().includes(queryLower)) {
            results.push({
              content: doc.content,
              similarity: 0.8, // Simple fallback similarity
              distance: 0.2,
              metadata: doc.metadata
            });
          }
        }
        
        return results.slice(0, limit);
      }

      // Original ChromaDB search code
      const {
        minSimilarity = 0.7,
        includeMetadata = true,
        filterMetadata = null
      } = options;

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Search in collection
      const searchParams = {
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        include: ['documents', 'distances']
      };

      if (includeMetadata) {
        searchParams.include.push('metadatas');
      }

      if (filterMetadata) {
        searchParams.where = filterMetadata;
      }

      const results = await this.collection.query(searchParams);

      // Process results
      const processedResults = [];
      
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const distance = results.distances[0][i];
          const similarity = 1 - distance; // Convert distance to similarity

          if (similarity >= minSimilarity) {
            processedResults.push({
              content: results.documents[0][i],
              similarity,
              distance,
              metadata: includeMetadata && results.metadatas ? results.metadatas[0][i] : null
            });
          }
        }
      }

      return processedResults;
    } catch (error) {
      logger.error('Error searching RAG memory:', error);
      return [];
    }
  }

  async generateEmbedding(text) {
    try {
      if (!this.openai) {
        throw new Error('OpenAI client not initialized for embeddings');
      }

      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw error;
    }
  }

  generateDocumentId(content, metadata) {
    // Create a hash-based ID from content and metadata
    const hash = crypto.createHash('sha256');
    hash.update(content);
    hash.update(JSON.stringify(metadata));
    return hash.digest('hex').substring(0, 16);
  }

  async updateDocument(id, updates) {
    try {
      const { content, metadata } = updates;

      if (content) {
        // Generate new embedding for updated content
        const embedding = await this.generateEmbedding(content);
        
        // Update the document
        await this.collection.update({
          ids: [id],
          embeddings: [embedding],
          documents: [content],
          metadatas: [{
            ...metadata,
            updatedAt: new Date().toISOString()
          }]
        });
      } else if (metadata) {
        // Update only metadata
        await this.collection.update({
          ids: [id],
          metadatas: [{
            ...metadata,
            updatedAt: new Date().toISOString()
          }]
        });
      }

      logger.debug(`Updated document in RAG memory: ${id}`);
      return true;
    } catch (error) {
      logger.error('Error updating document in RAG memory:', error);
      return false;
    }
  }

  async deleteDocument(id) {
    try {
      await this.collection.delete({
        ids: [id]
      });

      logger.debug(`Deleted document from RAG memory: ${id}`);
      return true;
    } catch (error) {
      logger.error('Error deleting document from RAG memory:', error);
      return false;
    }
  }

  async getDocument(id) {
    try {
      const result = await this.collection.get({
        ids: [id],
        include: ['documents', 'metadatas']
      });

      if (result.documents && result.documents.length > 0) {
        return {
          id,
          content: result.documents[0],
          metadata: result.metadatas ? result.metadatas[0] : null
        };
      }

      return null;
    } catch (error) {
      logger.error('Error getting document from RAG memory:', error);
      return null;
    }
  }

  async getStatus() {
    try {
      if (!this.client) {
        // In-memory storage status
        return {
          type: 'rag',
          totalDocuments: this.documents ? this.documents.size : 0,
          collectionName: this.collectionName,
          embeddingModel: this.embeddingModel,
          storage: 'in-memory'
        };
      }

      const count = await this.collection.count();
      
      return {
        type: 'rag',
        totalDocuments: count,
        collectionName: this.collectionName,
        embeddingModel: this.embeddingModel,
        vectorDbPath: this.vectorDbPath
      };
    } catch (error) {
      logger.error('Error getting RAG memory status:', error);
      return {
        type: 'rag',
        error: error.message
      };
    }
  }

  async addBulkDocuments(documents) {
    try {
      if (!Array.isArray(documents) || documents.length === 0) {
        throw new Error('Documents must be a non-empty array');
      }

      const ids = [];
      const embeddings = [];
      const contents = [];
      const metadatas = [];

      for (const doc of documents) {
        const { content, metadata = {} } = doc;
        
        if (!content || content.trim().length === 0) {
          continue; // Skip empty documents
        }

        const embedding = await this.generateEmbedding(content);
        const id = this.generateDocumentId(content, metadata);

        ids.push(id);
        embeddings.push(embedding);
        contents.push(content);
        metadatas.push({
          ...metadata,
          addedAt: new Date().toISOString(),
          contentLength: content.length
        });
      }

      if (ids.length > 0) {
        await this.collection.add({
          ids,
          embeddings,
          documents: contents,
          metadatas
        });

        logger.info(`Added ${ids.length} documents to RAG memory`);
      }

      return ids;
    } catch (error) {
      logger.error('Error adding bulk documents to RAG memory:', error);
      throw error;
    }
  }

  async searchSimilar(documentId, limit = 5) {
    try {
      // Get the document first
      const doc = await this.getDocument(documentId);
      if (!doc) {
        throw new Error('Document not found');
      }

      // Search for similar documents
      return await this.search(doc.content, limit + 1); // +1 to exclude the original
    } catch (error) {
      logger.error('Error searching for similar documents:', error);
      return [];
    }
  }

  async cleanup(options = {}) {
    try {
      const {
        maxAge = 365, // days
        minSimilarityThreshold = 0.95 // Remove near-duplicates
      } = options;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);

      // Get all documents with metadata
      const allDocs = await this.collection.get({
        include: ['documents', 'metadatas']
      });

      let deletedCount = 0;

      if (allDocs.metadatas) {
        const toDelete = [];

        for (let i = 0; i < allDocs.metadatas.length; i++) {
          const metadata = allDocs.metadatas[i];
          const addedAt = new Date(metadata.addedAt);

          // Delete old documents
          if (addedAt < cutoffDate) {
            toDelete.push(allDocs.ids[i]);
          }
        }

        if (toDelete.length > 0) {
          await this.collection.delete({
            ids: toDelete
          });
          deletedCount = toDelete.length;
        }
      }

      logger.info(`Cleaned up ${deletedCount} documents from RAG memory`);
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up RAG memory:', error);
      return 0;
    }
  }
}