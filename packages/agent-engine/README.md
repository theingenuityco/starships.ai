# @starships/agent-engine

Core AI chat engine for the Starships platform. Handles conversation processing, memory management, and LLM integration with context-aware responses.

## 🚀 Features

- **Multi-Provider LLM Support**: OpenAI and Anthropic integration via LangChain
- **Intelligent Memory Management**: Semantic search and context retrieval
- **Dynamic Prompt Building**: Context-aware prompt construction
- **Vector Storage**: FAISS-based embedding storage for semantic search
- **Memory Persistence**: Long-term conversation memory with relevance scoring

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Development mode
pnpm dev
```

## 🏗️ Architecture

### Core Components

```
src/
├── index.ts                    # Main chat processing function
├── llm/
│   ├── provider-factory.ts    # LLM provider management
│   └── langchain-provider.ts  # LangChain integration
├── memory/
│   └── langchain-memory.ts    # Memory store with semantic search
└── prompt/
    └── builder.ts             # Dynamic prompt construction
```

## 🔧 Usage

### Basic Chat Processing

```typescript
import { chat, LangChainMemoryStore } from '@starships/agent-engine';

// Initialize memory store
const memoryStore = new LangChainMemoryStore();

// Process chat request
const response = await chat({
  agent_id: 'agent-123',
  user_id: 'user-456',
  channel_id: 'channel-789',
  message: 'Hello, how are you?',
  stream: false
}, memoryStore);

console.log(response.reply);
```

### Memory Management

```typescript
// Get conversation history
const sessionKey = memoryStore.makeKey('agent-123', 'user-456', 'channel-789');
const history = await memoryStore.get(sessionKey);

// Semantic search in conversation
const searchResults = await memoryStore.semanticSearch(
  sessionKey, 
  'previous discussion about AI',
  5 // top 5 results
);

// Clear conversation memory
await memoryStore.clear(sessionKey);
```

## 🧠 Memory System

### Semantic Search
- **Vector Embeddings**: Automatic embedding generation for all messages
- **Relevance Scoring**: Context-aware message retrieval
- **Context Window**: Smart context selection for long conversations
- **Memory Pruning**: Automatic cleanup of old, irrelevant messages

### Memory Entry Structure
```typescript
interface MemoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

interface EnhancedMemoryEntry extends MemoryEntry {
  embedding?: number[];
  importance?: number;
  summary?: string;
}
```

## 🔌 LLM Providers

### Supported Providers
- **OpenAI**: GPT-3.5, GPT-4, GPT-4-turbo
- **Anthropic**: Claude-3-haiku, Claude-3-sonnet, Claude-3-opus

### Provider Configuration
```typescript
// Automatic provider selection based on agent configuration
const provider = await ProviderFactory.getProvider('agent-id');

// Manual provider configuration
const result = await provider.complete(prompt, {
  stream: false,
  temperature: 0.7,
  maxTokens: 1000
});
```

## 📊 Prompt Engineering

### Dynamic Prompt Construction
```typescript
import { buildPrompt } from '@starships/agent-engine';

const prompt = buildPrompt(
  systemPrompt,     // Agent's system instructions
  memory,           // Conversation history
  userMessage,      // Current user input
  relevantContext   // Semantic search results
);
```

### Prompt Structure
1. **System Context**: Agent personality and instructions
2. **Relevant History**: Semantically similar past conversations
3. **Recent Context**: Last N messages for continuity
4. **Current Message**: User's current input

## 🔧 Configuration

### Environment Variables
```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_key

# Anthropic Configuration  
ANTHROPIC_API_KEY=your_anthropic_key

# Memory Configuration
MEMORY_VECTOR_SIZE=1536
MEMORY_MAX_ENTRIES=1000
```

### Agent Configuration
```typescript
interface AgentConfig {
  id: string;
  name: string;
  model: string;                    // Model identifier
  provider?: 'openai' | 'anthropic';
  systemPrompt?: string;            // Custom system instructions
}
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Lint code
pnpm lint
```

## 📚 Dependencies

### Core Dependencies
- **LangChain**: LLM orchestration and memory management
- **FAISS**: Vector similarity search
- **@starships/models**: Database layer integration
- **@starships/protocol**: Shared type definitions

### LLM Providers
- **@langchain/openai**: OpenAI integration
- **@langchain/anthropic**: Anthropic integration
- **@langchain/community**: Community providers and tools

## 🚀 Performance

### Memory Optimization
- **Lazy Loading**: Embeddings generated on-demand
- **Batch Processing**: Efficient vector operations
- **Context Pruning**: Automatic memory cleanup
- **Caching**: Provider and model caching

### Benchmarks
- **Response Time**: < 500ms for cached contexts
- **Memory Usage**: < 100MB for 1000 conversations
- **Throughput**: 100+ concurrent conversations

## 🔍 Troubleshooting

### Common Issues

1. **Provider Authentication**
   ```bash
   # Check API keys
   echo $OPENAI_API_KEY
   echo $ANTHROPIC_API_KEY
   ```

2. **Memory Store Issues**
   ```typescript
   // Reset memory store
   await memoryStore.clear(sessionKey);
   
   // Check memory store health
   const stats = await memoryStore.getStats();
   ```

3. **Model Loading Errors**
   ```typescript
   // Verify model availability
   const provider = await ProviderFactory.getProvider(agentId);
   const models = await provider.listModels();
   ```

## 📄 License

Private package - Part of the Starships AI platform. 