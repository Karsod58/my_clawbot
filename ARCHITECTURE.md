# MiniBot Architecture

## Overview

MiniBot is a mini version of ClawBot/MoltBot with advanced memory management, thought-action-output reasoning, and messaging platform integration.

## Core Components

### 1. Core System (`src/core/`)

#### MiniBotCore
- Central orchestrator that coordinates all components
- Processes incoming messages through the complete pipeline
- Manages user sessions and context

#### AIModelManager
- Handles multiple AI model providers (OpenAI, Anthropic)
- Per-user model selection
- Response generation with context integration

#### ThoughtChain
- Implements thought-action-output reasoning
- Analyzes input, plans response, executes actions, reflects on process
- Provides structured reasoning for complex queries

### 2. Memory System (`src/memory/`)

#### Multi-layered Memory Architecture

**ShortTermMemory (In-Memory)**
- Stores recent conversation history
- Fast access for immediate context
- Automatic cleanup based on limits
- Per-user memory isolation

**LongTermMemory (SQLite)**
- Persistent storage for important conversations
- Importance-based filtering
- Searchable conversation history
- Automatic consolidation from short-term

**RAGMemory (ChromaDB + Embeddings)**
- Vector-based semantic search
- Document storage with embeddings
- Cross-user knowledge base
- Similarity-based retrieval

#### Memory Flow
```
User Message → Short-term → [Important?] → Long-term
                    ↓
            RAG Memory ← Embeddings ← AI Processing
```

### 3. Messaging Platforms (`src/messaging/`)

#### TelegramHandler
- Full Telegram Bot API integration
- Command handling (/start, /help, /model, etc.)
- Inline keyboards for interactive features
- Message chunking for long responses

#### WhatsAppHandler
- WhatsApp Web integration via whatsapp-web.js
- QR code authentication
- Message processing and response handling
- Group message filtering

### 4. MCP Integration (`src/mcp/`)

#### MCPManager
- Coordinates multiple MCP servers
- Action validation and execution
- Result storage and caching
- Multi-action support

#### GitHubMCP
- Repository management
- Issue tracking
- File content access
- Commit and PR information
- Rate limit handling

#### FigmaMCP
- Design file access
- Component and style management
- Comment system integration
- Team collaboration features

## Data Flow

### Message Processing Pipeline

1. **Input Reception**
   - Message received via Telegram/WhatsApp
   - User identification and platform detection

2. **Memory Context Retrieval**
   - Short-term: Recent conversation
   - Long-term: Relevant historical context
   - RAG: Semantic knowledge retrieval

3. **Thought Chain Processing**
   - Analyze: Intent detection, entity extraction
   - Plan: Response strategy, action identification
   - Execute: MCP actions if needed
   - Reflect: Process quality assessment

4. **AI Response Generation**
   - Context-aware prompt construction
   - Model-specific response generation
   - Thought process integration

5. **Memory Storage**
   - Response stored in short-term memory
   - Important conversations moved to long-term
   - RAG memory updated with new knowledge

6. **Response Delivery**
   - Platform-specific formatting
   - Message chunking if needed
   - Error handling and fallbacks

## Memory Management Strategy

### Short-term Memory
- **Capacity**: 50 items per user (configurable)
- **Retention**: Until capacity exceeded
- **Purpose**: Immediate conversation context

### Long-term Memory
- **Triggers**: Important keywords, detailed conversations, Q&A pairs
- **Storage**: SQLite with full-text search
- **Cleanup**: Age-based and importance-based pruning

### RAG Memory
- **Content**: Conversation summaries, external knowledge
- **Indexing**: OpenAI embeddings (text-embedding-3-small)
- **Retrieval**: Semantic similarity search

## Thought-Action-Output Chain

### Analysis Phase
- Intent detection (question, command, greeting, etc.)
- Entity extraction (URLs, mentions, numbers)
- Sentiment analysis
- Complexity assessment
- Context relevance scoring

### Planning Phase
- Response type determination
- MCP action identification
- Resource requirement assessment
- Execution strategy formulation

### Execution Phase
- MCP server action execution
- Error handling and retries
- Result aggregation
- Success/failure tracking

### Reflection Phase
- Process quality assessment
- Confidence scoring
- Improvement identification
- Next steps planning

## MCP Server Integration

### GitHub Operations
- Repository listing and details
- Issue management (list, create)
- File content retrieval
- Commit history access
- Pull request information
- User profile data

### Figma Operations
- File and project access
- Component library browsing
- Style guide retrieval
- Comment system integration
- Team collaboration features
- Asset export capabilities

## Configuration Management

### Environment Variables
- API keys for all services
- Model preferences and limits
- Memory configuration
- Platform-specific settings

### MCP Configuration
- Server enablement flags
- Operation permissions
- Rate limiting settings
- Caching preferences

## Error Handling & Resilience

### API Rate Limiting
- GitHub: Automatic rate limit tracking
- Figma: Request throttling
- OpenAI: Retry with exponential backoff

### Fallback Mechanisms
- Model fallback (GPT-4 → GPT-3.5)
- Memory fallback (RAG → Long-term → Short-term)
- Platform fallback (error messages)

### Monitoring & Logging
- Structured logging with Winston
- Performance metrics tracking
- Memory usage monitoring
- Error aggregation and alerting

## Scalability Considerations

### Memory Optimization
- Automatic cleanup processes
- Configurable retention policies
- Efficient data structures
- Database indexing strategies

### Performance Optimization
- Async/await throughout
- Connection pooling
- Response caching
- Batch processing capabilities

### Resource Management
- Memory usage monitoring
- Database connection limits
- API quota management
- Process lifecycle management

## Security Features

### Data Protection
- User data isolation
- Secure token storage
- Input validation and sanitization
- Rate limiting per user

### Access Control
- Admin user identification
- Operation permissions
- Platform-specific restrictions
- Audit logging

## Future Enhancements

### Planned Features
- Voice message support
- Image analysis capabilities
- Custom MCP server creation
- Advanced analytics dashboard
- Multi-language support

### Scalability Improvements
- Redis for distributed caching
- PostgreSQL for advanced queries
- Microservice architecture
- Container orchestration
- Load balancing strategies