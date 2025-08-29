# @starships/agent-engine

Simple AI chat engine with tool calling capabilities for the Starships platform.

## 🚀 Features

- **Agent Chat**: LLM-powered conversations with database-backed memory
- **Native Tools**: Web search (Brave/Tavily), scraping (Firecrawl), and API integrations (Notion)
- **Multi-Provider**: OpenAI and Anthropic support with automatic model resolution
- **Vision Context**: Company vision alignment for mission-focused interactions
- **Database Memory**: Persistent chat sessions with conversation history

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

```
src/
├── llm/                      # LLM provider management
├── memory/                   # Database-backed chat memory
├── tools/                    # Tool wrapper + native integrations
├── chat.ts                   # Main chat processing logic
├── vision.ts                 # Company vision context loading
├── llm-resolver.ts           # Centralized model resolution
├── prompt.ts                 # Dynamic prompt construction
└── index.ts                  # Main exports
```

## 🔧 Usage

### Basic Chat

```typescript
import { chat, DatabaseMemoryStore } from '@starships/agent-engine';

const store = new DatabaseMemoryStore();

const response = await chat({
  agent_id: 'agent-123',
  user_id: 'user-456',
  message: 'Hello, can you help me research AI tools?'
}, store);

console.log(response.content);
```

### With Native Tools

The engine automatically loads available tools based on the starship's API keys:

```typescript
// Tools are loaded automatically if API keys exist for:
// - Brave Search (web search)
// - Tavily Search (research)
// - Firecrawl (web scraping)
// - Notion (knowledge base)

const response = await chat({
  agent_id: 'agent-with-tools',
  user_id: 'user-456',
  message: 'Search for recent developments in AI safety'
}, store);
```

## 🔌 Available Tools

- **Brave Search**: Fast web search with real-time results
- **Tavily Search**: Research-focused search with citations
- **Firecrawl**: Website content extraction and scraping
- **Notion**: Access to Notion pages and databases

## 🧠 Memory System

- **Database Storage**: Persistent chat sessions in PostgreSQL
- **Conversation History**: Maintains context across interactions
- **Session Management**: Automatic session creation and cleanup
- **Memory Limits**: Configurable message history (default: last 10 messages)

## 🔌 LLM Providers

- **OpenAI**: GPT-3.5, GPT-4, GPT-4-turbo
- **Anthropic**: Claude-3-haiku, Claude-3-sonnet, Claude-3-opus
- **Auto-Resolution**: Flexible model ID/name resolution
- **Temperature Control**: Per-model temperature configuration

## 👁️ Vision Context

Automatically loads company/starship vision statements to ensure AI agents stay aligned with business objectives:

```typescript
// Vision context is automatically loaded and enforced
// Agents will refuse work that doesn't align with company vision
// Users are guided to adjust requests or update vision via Vision Chamber
```

## 📊 Configuration

### Environment Variables

```env
# LLM Provider Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Native Tool APIs (configured per starship)
FIRECRAWL_API_KEY=your_firecrawl_key
NOTION_API_KEY=your_notion_key
BRAVE_SEARCH_API_KEY=your_brave_key
```

## 🚀 Dependencies

### Core
- **LangChain**: Agent orchestration and tool calling
- **@starships/models**: Database repositories and types  
- **@starships/protocol**: Shared type definitions

### LLM Providers
- **@langchain/openai**: OpenAI integration
- **@langchain/anthropic**: Anthropic integration
- **@langchain/community**: Community tools (Brave, Tavily)

### Tools
- **axios + axios-retry**: HTTP client with retries
- **@notionhq/client**: Notion API integration

## 📄 License

Private package - Part of the Starships AI platform.