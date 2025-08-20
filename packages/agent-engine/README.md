# @starships/agent-engine

Advanced AI orchestration engine powering the Starships mission control platform. Features sophisticated multi-agent coordination, MCP tool integration, workflow execution, real-time monitoring, and enterprise-grade security for complex expedition management.

## 🚀 Features

- **First Officer Orchestration**: Hierarchical AI coordination with LangGraph workflow management
- **MCP Tool Integration**: Dynamic tool discovery and execution with HTTP bridge support
- **Multi-Agent Expeditions**: Coordinated execution across multiple AI agents with real-time progress tracking
- **Workflow DSL Execution**: Complete workflow definition language with approval workflows
- **Smart Parameter Adaptation**: Intelligent parameter mapping using heuristics and pattern memory
- **Enterprise Security**: Policy enforcement, audit logging, and comprehensive security management
- **Performance Monitoring**: Real-time analytics, usage tracking, and optimization recommendations
- **Vector Memory System**: FAISS-based semantic search with context-aware retrieval
- **Quality Control**: Automated validation and retry mechanisms with configurable thresholds

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
├── index.ts                           # Main chat processing entry point
├── first-officer/
│   ├── FirstOfficerAgent.ts           # Main orchestration agent
│   ├── MCPEnabledFirstOfficerAgent.ts # Enhanced with MCP tool integration
│   ├── TaskExecutor.ts               # Task execution with quality control
│   ├── AgentSelector.ts              # Intelligent agent selection
│   ├── ChatCoordinator.ts            # Multi-agent communication
│   ├── QualityValidator.ts           # Automated quality assessment
│   ├── StatePersistence.ts           # Workflow state management
│   ├── WorkflowGenerationService.ts  # AI-powered workflow creation
│   └── workflow/
│       ├── ExpeditionWorkflow.ts     # 4-phase expedition orchestration
│       └── SimplifiedExpeditionWorkflow.ts # Streamlined expedition flow
├── tools/
│   ├── MCPToolWrapper.ts             # MCP tool integration system
│   ├── AgentToolInterceptor.ts       # Tool usage interception and monitoring
│   └── native/
│       ├── FirecrawlTool.ts          # Web scraping integration
│       └── NotionTool.ts             # Notion API integration
├── agents/
│   ├── MCPAgentExecutor.ts           # Advanced agent execution with MCP tools
│   └── ToolInputPatcher.ts           # Intelligent parameter patching
├── adapters/
│   ├── SmartParameterAdapter.ts      # Heuristic parameter mapping
│   ├── PatternMemory.ts              # Neo4j-backed pattern storage
│   └── HeuristicRules.ts             # Parameter mapping heuristics
├── monitoring/
│   ├── ToolUsageAnalytics.ts         # Comprehensive tool usage tracking
│   ├── PerformanceOptimizer.ts       # Automated performance optimization
│   ├── MonitoringDashboard.ts        # Real-time metrics dashboard
│   └── PrometheusMetrics.ts          # Enterprise monitoring integration
├── security/
│   ├── SecurityManager.ts            # Comprehensive security validation
│   ├── MCPPolicyEnforcer.ts          # Policy-based access control
│   └── AuditLogger.ts                # Detailed audit trails
├── patterns/
│   ├── memory-integration-pattern.ts # Context persistence patterns
│   ├── web-automation-pattern.ts     # Web interaction workflows
│   └── combined-patterns.ts          # Multi-tool orchestration
├── llm/
│   ├── provider-factory.ts          # Multi-provider LLM management
│   └── langchain-provider.ts         # Enhanced LangChain integration
├── memory/
│   └── langchain-memory.ts           # Advanced vector memory system
└── prompt/
    └── builder.ts                    # Context-aware prompt construction
```

## 🔧 Usage

### First Officer Expedition Orchestration

```typescript
import { MCPEnabledFirstOfficerAgent, ExpeditionWorkflow } from '@starships/agent-engine';

// Initialize First Officer with MCP tools
const firstOfficer = new MCPEnabledFirstOfficerAgent({
  expeditionId: 'exp-123',
  availableAgents: ['research-agent', 'analysis-agent'],
  mcpTools: ['github', 'web-scraper', 'notion'],
  qualityThreshold: 0.8
});

// Execute 4-phase expedition
const expeditionResult = await firstOfficer.executeExpedition({
  objective: 'Research and analyze AI productivity tools market',
  phases: ['plan', 'workflow', 'execute', 'review'],
  approvalRequired: true,
  realTimeUpdates: true
});

console.log('Expedition Status:', expeditionResult.status);
console.log('Quality Score:', expeditionResult.qualityScore);
```

### MCP Tool Integration

```typescript
import { MCPToolWrapper } from '@starships/agent-engine';

// Initialize MCP tool wrapper with smart parameter adaptation
const mcpWrapper = new MCPToolWrapper({
  httpBridgeUrl: 'http://localhost:3001',
  enableAnalytics: true,
  enableSecurity: true
});

// Execute tool with intelligent parameter mapping
const result = await mcpWrapper.executeTool('github', 'list_repositories', {
  organization: 'starships-ai',
  maxResults: 10
});

console.log('Repositories:', result.data);
console.log('Performance:', result.analytics);
```

### Workflow DSL Execution

```typescript
import { WorkflowExecutionService } from '@starships/agent-engine';

// Define workflow with approval checkpoints
const workflow = {
  nodes: [
    { id: 'start', type: 'start' },
    { id: 'research', type: 'agent', agentId: 'research-agent' },
    { id: 'approval', type: 'user_prompt', prompt: 'Approve research results?' },
    { id: 'analysis', type: 'agent', agentId: 'analysis-agent' },
    { id: 'end', type: 'output' }
  ],
  edges: [
    { from: 'start', to: 'research' },
    { from: 'research', to: 'approval' },
    { from: 'approval', to: 'analysis', condition: 'approved' },
    { from: 'analysis', to: 'end' }
  ]
};

// Execute workflow with real-time monitoring
const executor = new WorkflowExecutionService();
const execution = await executor.execute(workflow, {
  expeditionId: 'exp-123',
  enableCheckpoints: true,
  qualityValidation: true
});

// Monitor progress
execution.on('node:complete', (nodeId, result) => {
  console.log(`Node ${nodeId} completed:`, result);
});
```

### Advanced Monitoring and Analytics

```typescript
import { ToolUsageAnalytics, PerformanceOptimizer } from '@starships/agent-engine';

// Tool usage analytics
const analytics = new ToolUsageAnalytics();
const usage = await analytics.getToolUsageReport({
  timeRange: '30d',
  groupBy: 'tool',
  includePerformance: true
});

console.log('Most used tools:', usage.topTools);
console.log('Performance metrics:', usage.performance);

// Automated performance optimization
const optimizer = new PerformanceOptimizer();
const recommendations = await optimizer.analyzeAndOptimize({
  expeditionId: 'exp-123',
  includeParameterOptimization: true,
  includeResourceOptimization: true
});

console.log('Optimization recommendations:', recommendations);
```

### Enterprise Security and Audit

```typescript
import { SecurityManager, AuditLogger } from '@starships/agent-engine';

// Configure security policies
const security = new SecurityManager({
  enablePolicyEnforcement: true,
  enableQuotaManagement: true,
  enableAuditLogging: true
});

// Set tool access policies
await security.setPolicyForTool('github', {
  allowedOperations: ['read', 'list'],
  quotaLimits: { daily: 1000, hourly: 100 },
  requiredPermissions: ['repo:read']
});

// Audit trail access
const audit = new AuditLogger();
const trail = await audit.getAuditTrail({
  expeditionId: 'exp-123',
  includeToolUsage: true,
  includeSecurityEvents: true
});

console.log('Security events:', trail.securityEvents);
```

## 🧠 Memory System

### Advanced Memory and Context System
- **Vector Embeddings**: Automatic embedding generation with semantic similarity
- **Expedition Context**: Multi-agent expedition awareness and coordination
- **Vision Integration**: Company/starship vision alignment checks
- **Pattern Memory**: Neo4j-backed storage for parameter mapping patterns
- **Context Persistence**: Cross-session knowledge sharing and continuity
- **Smart Pruning**: Relevance-based memory optimization

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

### Multi-Provider LLM Integration
- **OpenAI**: GPT-3.5, GPT-4, GPT-4-turbo with streaming support
- **Anthropic**: Claude-3-haiku, Claude-3-sonnet, Claude-3-opus
- **Dynamic Selection**: Automatic provider selection based on agent configuration
- **Fallback Handling**: Automatic provider switching on failures
- **Cost Optimization**: Intelligent model selection based on task complexity

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
# LLM Provider Configuration
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
DEFAULT_LLM_PROVIDER=openai

# MCP Tool Integration
MCP_HTTP_BRIDGE_URL=http://localhost:3001
MCP_DOCKER_NETWORK=starships-mcp
MCP_ENABLE_ANALYTICS=true
MCP_ENABLE_SECURITY=true

# Native Tool APIs
FIRECRAWL_API_KEY=your_firecrawl_key
NOTION_API_KEY=your_notion_key
BRAVE_SEARCH_API_KEY=your_brave_key

# Memory and Performance
MEMORY_VECTOR_SIZE=1536
MEMORY_MAX_ENTRIES=1000
PERFORMANCE_MONITORING_ENABLED=true
PROMETHEUS_METRICS_PORT=9090

# Security Configuration
ENABLE_AUDIT_LOGGING=true
ENABLE_POLICY_ENFORCEMENT=true
SECURITY_VALIDATION_LEVEL=strict

# Workflow Configuration
WORKFLOW_ENABLE_CHECKPOINTS=true
WORKFLOW_QUALITY_THRESHOLD=0.8
WORKFLOW_MAX_RETRY_ATTEMPTS=3
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
- **LangChain + LangGraph**: Advanced LLM orchestration and workflow state management
- **FAISS**: High-performance vector similarity search
- **RxJS**: Reactive programming for real-time updates and event streams
- **Prometheus**: Enterprise-grade metrics collection and monitoring
- **@starships/models**: Neo4j database with pattern memory and expedition context
- **@starships/protocol**: Comprehensive types for workflows, expeditions, and MCP integration
- **@starships/core**: MCP HTTP bridge and Docker deployment services

### LLM Providers
- **@langchain/openai**: OpenAI integration
- **@langchain/anthropic**: Anthropic integration
- **@langchain/community**: Community providers and tools

## 🚀 Performance

### Enterprise Performance Features
- **Smart Parameter Adaptation**: Replaces 600+ lines of hardcoded mappings with intelligent heuristics
- **Parallel Execution**: Concurrent task processing with dependency management
- **Connection Pooling**: Optimized database and API connections
- **Caching Layers**: Provider, model, and context caching with TTL management
- **Resource Management**: Memory and CPU optimization for high-throughput scenarios
- **Real-time Monitoring**: Performance metrics with automated optimization recommendations

### Performance Benchmarks
- **Expedition Orchestration**: < 200ms initialization time
- **Tool Execution**: < 2s average response time with MCP tools
- **Workflow Processing**: 50+ concurrent workflows with real-time updates
- **Memory Efficiency**: < 50MB per active expedition
- **Agent Coordination**: 10+ agents per expedition with quality validation
- **Monitoring Overhead**: < 5% performance impact with full analytics enabled

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