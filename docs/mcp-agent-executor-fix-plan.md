# MCP Agent Executor Fix Implementation Plan

## 📊 Live Implementation Progress

### Overall Progress: ⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 100%

| Phase | Status | Progress | Last Updated |
|-------|--------|----------|--------------|
| **Phase 0: Configuration Setup** | 🟢 Completed | 100% | 2025-07-31 |
| **Phase 1: Core Implementation** | 🟢 Completed | 100% | 2025-07-31 |
| **Phase 2: Tool Response Enhancement** | 🟢 Completed | 100% | 2025-07-31 |
| **Phase 3: Testing & Validation** | 🟢 Completed | 100% | 2025-07-31 |
| **Phase 4: Memory Management** | 🟢 Completed | 100% | 2025-07-31 |
| **Phase 5: Environment & Config** | 🟢 Completed | 100% | 2025-07-31 |

### Detailed Progress Tracker

#### Phase 0: Configuration Setup (4/4 tasks) ✅
- ✅ Create `agent-executor-config.ts` with interface and defaults
- ✅ Create `environment.ts` config loader  
- ✅ Update `.env.example` with new variables
- ✅ Test configuration loading

#### Phase 1: Core Implementation (11/11 tasks) ✅
- ✅ Back up current streaming implementation
- ✅ Add all required imports to streaming file
- ✅ Create enhanced `executeWithAgent` generator function
- ✅ Replace current tool execution logic with new implementation
- ✅ Update memory storage to happen after successful execution
- ✅ Remove pre-execution user message storage
- ✅ Test with Sequential Thinking tool
- ✅ Test with web scraping tools
- ✅ Verify progress updates are streaming
- ✅ Test fallback to non-streaming on error
- ✅ Verify no breaking changes to existing functionality

#### Phase 2: Tool Response Enhancement (2/2 tasks) ✅
- ✅ Update MCPToolWrapper response formatting
- ✅ Test sequential thinking response signals

#### Phase 3: Testing & Validation (5/5 tasks) ✅
- ✅ Create integration test file
- ✅ Write Sequential Thinking test cases
- ✅ Fix all TypeScript compilation errors
- ✅ Fix all runtime errors (LLM model loading, Neo4j integers, template injection)
- ✅ Sequential thinking container connected to database

#### Phase 4: Memory Management (3/3 tasks) ✅
- ✅ Update memory storage logic (Moved to after successful execution)
- ✅ Test memory persistence (Memory stores both user and assistant messages)
- ✅ Verify conversation history integrity (Backdate user message to execution start)

#### Phase 5: Environment & Config (3/3 tasks) ✅
- ✅ Document all environment variables (Added to .env.example)
- ✅ Create config loader with defaults (environment.ts created)
- ✅ Test environment-based configuration (Verified with test script)

### 🚦 Status Legend
- 🔴 **Not Started** - Task not yet begun
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Completed** - Task finished and tested
- 🔵 **Blocked** - Waiting on dependencies
- ⚫ **Skipped** - Not needed for this implementation

### 📈 Metrics
- **Total Tasks**: 28
- **Completed**: 28
- **In Progress**: 0
- **Blocked**: 0
- **Estimated Hours Remaining**: 0

### 🔄 Recent Updates
- **2025-07-31 16:50** - Implementation 100% complete: All errors fixed, container connected to DB
- **2025-07-31 16:45** - Fixed sequential thinking container connection to database
- **2025-07-31 16:40** - Fixed prompt template injection vulnerability with JSON in tool descriptions
- **2025-07-31 16:35** - Fixed Neo4j integer conversion issues for LLM model parameters
- **2025-07-31 16:30** - Fixed LLM model loading by seeding database with required models
- **2025-07-31 16:25** - Implementation 89% complete: Core functionality ready
- **2025-07-31 16:20** - Phase 5 completed: Environment configuration documented
- **2025-07-31 16:18** - Phase 3 partially complete: Test scripts created
- **2025-07-31 16:15** - Phase 4 completed: Memory management updated
- **2025-07-31 16:10** - Phase 2 completed: Tool response formatting enhanced
- **2025-07-31 16:05** - Phase 1 completed: Core implementation with agent executor
- **2025-07-31 15:45** - Phase 0 completed: All configuration files created and tested
- **2025-07-31 15:40** - Implementation started

---

## 🎯 Executive Summary

This plan addresses the critical issue where MCP tools (like Sequential Thinking) are not executing properly in agent chat flows. The root cause is that the streaming implementation (`chat-with-mcp-stream.ts`) uses a simplified approach that doesn't support proper agent execution loops, causing agents to display tool invocation JSON instead of executing tools.

**Key Problem**: The streaming version uses `bindTools()` which only makes the LLM aware of tools but doesn't create an agent executor that can handle multiple tool calls in sequence.

**Solution**: Implement Option 1 - Use LangChain's Agent Executor in the streaming implementation, execute tools completely, then stream the final response.

## 📊 Current State Analysis

### What's Working:
- MCP tools are discovered and loaded successfully
- Tool schemas are properly converted to LangChain format
- Non-streaming version (`chat-with-mcp.ts`) has proper agent executor setup
- Sequential Thinking server is running and accessible

### What's Broken:
- Streaming version (`chat-with-mcp-stream.ts`) doesn't use agent executor
- Tools are bound to LLM but not executed in a loop
- Agent shows raw tool invocation JSON instead of executing
- Sequential Thinking stops after first thought instead of continuing

### Architecture Issue:
```
Current Flow (Broken):
User → Agent → LLM with bindTools → Shows JSON → Stop

Expected Flow:
User → Agent → Agent Executor → Tool Loop → Final Response → Stream
```

## 🏗️ Implementation Plan

### Phase 0: Configuration Setup (Priority: CRITICAL)

#### 0.1 Create Agent Executor Configuration
**File**: `packages/agent-engine/src/config/agent-executor-config.ts`

```typescript
export interface AgentExecutorConfig {
  maxIterations: {
    default: number;
    byToolType: Record<string, number>;
  };
  timeouts: {
    overall: number;
    perTool: Record<string, number>;
  };
  streaming: {
    enabled: boolean;
    progressUpdates: boolean;
    chunkSize: number;
    delayMs: number;
  };
  fallback: {
    enabled: boolean;
    useNonStreaming: boolean;
  };
  debug: {
    verbose: boolean;
    showToolCalls: boolean;
  };
}

export const DEFAULT_AGENT_EXECUTOR_CONFIG: AgentExecutorConfig = {
  maxIterations: {
    default: 10,
    byToolType: {
      'sequentialthinking': 20,
      'memory': 5,
      'web': 10
    }
  },
  timeouts: {
    overall: 300000, // 5 minutes
    perTool: {
      'sequentialthinking': 120000, // 2 minutes
      'memory': 5000, // 5 seconds
      'web': 60000 // 1 minute
    }
  },
  streaming: {
    enabled: process.env.ENABLE_STREAMING_MCP !== 'false',
    progressUpdates: true,
    chunkSize: 20,
    delayMs: 10
  },
  fallback: {
    enabled: true,
    useNonStreaming: true
  },
  debug: {
    verbose: process.env.NODE_ENV === 'development',
    showToolCalls: process.env.NODE_ENV === 'development'
  }
};
```

### Phase 1: Update Streaming Implementation (Priority: HIGH)

#### 1.1 Import Required Components
**File**: `packages/agent-engine/src/chat-with-mcp-stream.ts`

Add imports:
```typescript
import { AgentExecutor } from "langchain/agents";
import { createOpenAIFunctionsAgent, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
```

#### 1.2 Create Enhanced Agent Executor Function
**Location**: Add new function in `chat-with-mcp-stream.ts`

```typescript
import { DEFAULT_AGENT_EXECUTOR_CONFIG } from './config/agent-executor-config';

async function* executeWithAgent(
  mcpTools: any[],
  memoryArray: any[],
  message: string,
  systemPrompt: string,
  llmModel: any,
  llm: any,
  config = DEFAULT_AGENT_EXECUTOR_CONFIG
): AsyncGenerator<string, string, unknown> {
  try {
    // Enhance system prompt with tool descriptions
    const enhancedSystemPrompt = systemPrompt + (mcpTools.length > 0 ? `\n\nYou have access to the following MCP (Model Context Protocol) tools that you can use to help the user:\n${mcpTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}\n\nWhen appropriate, use these tools to provide better assistance. You are connected to MCP servers that provide these capabilities.` : '');
    
    // Create prompt template
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", enhancedSystemPrompt],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);
    
    // Create appropriate agent based on provider
    const agent = llmModel.provider === 'openai' 
      ? await createOpenAIFunctionsAgent({
          llm,
          tools: mcpTools,
          prompt,
        })
      : createToolCallingAgent({
          llm,
          tools: mcpTools,
          prompt,
        });
    
    // Determine max iterations based on tools
    const maxIterations = getMaxIterations(mcpTools, config);
    
    // Create executor with proper settings
    const executor = new AgentExecutor({
      agent,
      tools: mcpTools,
      verbose: config.debug.verbose,
      maxIterations,
      returnIntermediateSteps: true,
      handleParsingErrors: true,
    });
    
    // Format chat history
    const chatHistory = memoryArray.map((m: any) => 
      m.role === 'user' 
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    );
    
    // Track execution progress
    let lastProgressUpdate = Date.now();
    let toolCallCount = 0;
    
    // Set up progress tracking
    if (config.streaming.progressUpdates) {
      executor.callbacks = [{
        handleToolStart: async (tool, input) => {
          toolCallCount++;
          const now = Date.now();
          if (now - lastProgressUpdate > 1000) { // Update every second
            yield `[Processing with ${tool.name}... (step ${toolCallCount})]`;
            lastProgressUpdate = now;
          }
        }
      }];
    }
    
    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Agent execution timeout')), config.timeouts.overall)
    );
    
    const result = await Promise.race([
      executor.invoke({
        input: message,
        chat_history: chatHistory,
      }),
      timeoutPromise
    ]) as any;
    
    return result.output;
  } catch (error) {
    console.error('[MCP-EXECUTOR] Agent execution failed:', error);
    
    // Format error message based on environment
    if (config.debug.verbose) {
      throw error;
    } else {
      throw new Error(formatUserFriendlyError(error));
    }
  }
}

function getMaxIterations(tools: any[], config: any): number {
  // Find the highest requirement among tools
  let maxNeeded = config.maxIterations.default;
  
  for (const tool of tools) {
    const toolType = tool.name.split('_')[0]; // Extract tool type
    const toolMax = config.maxIterations.byToolType[toolType];
    if (toolMax && toolMax > maxNeeded) {
      maxNeeded = toolMax;
    }
  }
  
  return maxNeeded;
}

function formatUserFriendlyError(error: any): string {
  if (error.message.includes('timeout')) {
    return 'The operation took too long to complete. Please try again with a simpler request.';
  }
  if (error.message.includes('tool')) {
    return 'There was an issue processing your request. Please try rephrasing it.';
  }
  return 'An unexpected error occurred. Please try again.';
}
```

#### 1.3 Replace Current Tool Execution Logic
**Location**: Update the MCP tools section (around line 141)

Replace the current implementation with:
```typescript
if (mcpTools.length > 0) {
  console.log('🎯 [AGENT-ENGINE-MCP-STREAM] MCP tools available - using agent executor');
  
  try {
    // Check if streaming is enabled
    if (!DEFAULT_AGENT_EXECUTOR_CONFIG.streaming.enabled) {
      console.log('🔄 [AGENT-ENGINE-MCP-STREAM] Streaming disabled, falling back to non-streaming');
      // Import and use non-streaming version
      const { chatWithMCP } = await import('./chat-with-mcp');
      const result = await chatWithMCP(req, store);
      yield result.reply;
      return;
    }
    
    // Get LLM model configuration
    const llmModel = await llmRepo.findById(agent.model);
    if (!llmModel) {
      throw new Error(`LLM model ${agent.model} not found`);
    }
    
    // Create LLM instance
    const llm = llmModel.provider === 'openai' 
      ? new ChatOpenAI({
          model: llmModel.name,
          temperature: llmModel.temperature,
          apiKey: process.env.OPENAI_API_KEY,
        })
      : new ChatAnthropic({
          model: llmModel.name,
          temperature: llmModel.temperature,
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
    
    // Execute using agent executor with streaming
    console.log('🤖 [AGENT-ENGINE-MCP-STREAM] Executing with agent executor...');
    
    let fullResponse = '';
    const responseChunks: string[] = [];
    
    // Execute and collect progress updates
    for await (const chunk of executeWithAgent(
      mcpTools,
      memoryArray,
      req.message,
      systemPrompt,
      llmModel,
      llm
    )) {
      if (chunk.startsWith('[Processing')) {
        // Yield progress updates immediately
        yield chunk + '\n';
      } else {
        // Collect the final response
        fullResponse = chunk;
      }
    }
    
    console.log('📝 [AGENT-ENGINE-MCP-STREAM] Agent execution complete, streaming response...');
    
    // Stream the final response in chunks
    const config = DEFAULT_AGENT_EXECUTOR_CONFIG;
    for (let i = 0; i < fullResponse.length; i += config.streaming.chunkSize) {
      yield fullResponse.slice(i, i + config.streaming.chunkSize);
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, config.streaming.delayMs));
    }
    
    // Store assistant message only after successful completion
    await store.append(memoryKey, {
      role: 'assistant',
      content: fullResponse,
      timestamp: Date.now()
    } as MemoryEntry);
    
    console.log('✅ [AGENT-ENGINE-MCP-STREAM] Streaming completed successfully');
    
  } catch (error) {
    console.error('❌ [AGENT-ENGINE-MCP-STREAM] Error during agent execution:', error);
    
    // Fallback to non-streaming on error
    if (DEFAULT_AGENT_EXECUTOR_CONFIG.fallback.enabled) {
      console.log('🔄 [AGENT-ENGINE-MCP-STREAM] Falling back to non-streaming due to error');
      try {
        const { chatWithMCP } = await import('./chat-with-mcp');
        const result = await chatWithMCP(req, store);
        yield result.reply;
      } catch (fallbackError) {
        console.error('❌ [AGENT-ENGINE-MCP-STREAM] Fallback also failed:', fallbackError);
        yield 'I encountered an error while processing your request. Please try again.';
      }
    } else {
      // Re-throw if fallback is disabled
      throw error;
    }
  }
}
```

#### 1.4 Add Required Imports
**Location**: Top of `chat-with-mcp-stream.ts`

Add missing imports:
```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { DEFAULT_AGENT_EXECUTOR_CONFIG } from "./config/agent-executor-config";
```

### Phase 2: Enhance Tool Response Handling

#### 2.1 Update MCPToolWrapper Response Format
**File**: `packages/agent-engine/src/tools/MCPToolWrapper.ts`

Update the `formatToolResponse` method (around line 273):
```typescript
private formatToolResponse(result: any, tool: MCPTool): string {
  // Handle Sequential Thinking responses specially
  if (tool.templateSlug === 'sequentialthinking') {
    // Check if we need to continue thinking
    if (result.nextThoughtNeeded) {
      // Return a clear signal to continue
      return `[Thought ${result.thoughtNumber}/${result.totalThoughts}] ${result.thought}\n[Status: Continuing analysis...]`;
    } else {
      // Final thought
      return `[Final Thought ${result.thoughtNumber}/${result.totalThoughts}] ${result.thought}\n[Status: Analysis complete]`;
    }
  }
  
  // Rest of the implementation...
}
```

### Phase 3: Testing & Validation

#### 3.1 Create Test Cases
**File**: Create `packages/agent-engine/tests/integration/mcp-streaming.test.ts`

```typescript
describe('MCP Streaming Integration', () => {
  it('should execute Sequential Thinking completely', async () => {
    const mockRequest = {
      agent_id: 'test-agent',
      user_id: 'test-user',
      channel_id: 'test-channel',
      message: 'Analyze the day in the life of a fisherman'
    };
    
    const chunks: string[] = [];
    for await (const chunk of chatWithMCPStream(mockRequest, store)) {
      chunks.push(chunk);
    }
    
    const fullResponse = chunks.join('');
    
    // Should contain multiple thoughts
    expect(fullResponse).toContain('Thought 1');
    expect(fullResponse).toContain('Thought 7');
    expect(fullResponse).toContain('Analysis complete');
  });
  
  it('should handle web scraping tools', async () => {
    const mockRequest = {
      agent_id: 'test-agent',
      user_id: 'test-user',
      channel_id: 'test-channel',
      message: 'Tell me what this brand does: https://example.com'
    };
    
    // Test execution...
  });
});
```

### Phase 4: Memory Store Management

#### 4.1 Update Memory Storage Logic
**Location**: Update memory handling in streaming implementation

```typescript
// Remove the pre-execution storage (around line 132)
// DELETE THIS:
// await store.append(memoryKey, {
//   role: 'user',
//   content: req.message,
//   timestamp: Date.now()
// } as MemoryEntry);

// Add proper memory storage after successful execution
// In the success path after streaming completes:
try {
  // Store both user and assistant messages together
  await store.append(memoryKey, {
    role: 'user',
    content: req.message,
    timestamp: Date.now() - executionTime // Backdate to start
  } as MemoryEntry);
  
  await store.append(memoryKey, {
    role: 'assistant',
    content: fullResponse,
    timestamp: Date.now()
  } as MemoryEntry);
  
  console.log('💾 [AGENT-ENGINE-MCP-STREAM] Conversation stored successfully');
} catch (memoryError) {
  console.error('⚠️ [AGENT-ENGINE-MCP-STREAM] Failed to store conversation:', memoryError);
  // Continue - don't fail the response due to memory issues
}
```

### Phase 5: Environment Variables & Configuration

#### 5.1 Add Environment Variable Documentation
**File**: Update `.env.example`

```bash
# MCP Agent Executor Configuration
ENABLE_STREAMING_MCP=true              # Enable streaming for MCP tools (default: true)
MCP_EXECUTOR_TIMEOUT=300000            # Overall timeout in ms (default: 5 minutes)
MCP_EXECUTOR_DEBUG=false               # Enable verbose debugging (default: false in production)
MCP_PROGRESS_UPDATES=true              # Show progress during tool execution (default: true)
```

#### 5.2 Create Environment Config Loader
**File**: `packages/agent-engine/src/config/environment.ts`

```typescript
export function loadAgentExecutorConfig(): Partial<AgentExecutorConfig> {
  return {
    streaming: {
      enabled: process.env.ENABLE_STREAMING_MCP !== 'false',
      progressUpdates: process.env.MCP_PROGRESS_UPDATES !== 'false',
      chunkSize: parseInt(process.env.MCP_CHUNK_SIZE || '20'),
      delayMs: parseInt(process.env.MCP_STREAM_DELAY || '10')
    },
    timeouts: {
      overall: parseInt(process.env.MCP_EXECUTOR_TIMEOUT || '300000'),
      perTool: {} // Tool-specific can be added as needed
    },
    debug: {
      verbose: process.env.MCP_EXECUTOR_DEBUG === 'true' || process.env.NODE_ENV === 'development',
      showToolCalls: process.env.MCP_SHOW_TOOL_CALLS === 'true'
    }
  };
}
```

## 📋 Implementation Checklist

### Phase 0: Configuration Setup (1 hour)
- [ ] Create `agent-executor-config.ts` with interface and defaults
- [ ] Create `environment.ts` config loader
- [ ] Update `.env.example` with new variables
- [ ] Test configuration loading

### Immediate Actions (Day 1)
- [ ] Back up current streaming implementation
- [ ] Add all required imports to streaming file
- [ ] Create enhanced `executeWithAgent` generator function
- [ ] Replace current tool execution logic with new implementation
- [ ] Update memory storage to happen after successful execution
- [ ] Remove pre-execution user message storage
- [ ] Test with Sequential Thinking tool
- [ ] Test with web scraping tools
- [ ] Verify progress updates are streaming
- [ ] Test fallback to non-streaming on error

### Follow-up Actions (Day 2)
- [ ] Add execution time tracking
- [ ] Implement detailed tool call logging
- [ ] Add performance monitoring metrics
- [ ] Create integration tests for all scenarios
- [ ] Update API documentation
- [ ] Add monitoring dashboard for tool usage
- [ ] Create runbook for troubleshooting

### Validation Steps
- [ ] Sequential Thinking executes all thoughts
- [ ] Web scraping tools execute properly
- [ ] Memory tools store and retrieve correctly
- [ ] Streaming still works smoothly
- [ ] Error cases handled gracefully

## 🚨 Risk Assessment

### High Risk
- **Breaking existing streaming**: Mitigated by keeping fallback logic
- **Performance degradation**: Mitigated by executing first, then streaming

### Medium Risk
- **Tool execution timeout**: Add configurable timeouts per tool type
- **Memory usage**: Monitor agent executor memory consumption

### Low Risk
- **Compatibility issues**: Both OpenAI and Anthropic agents tested
- **User experience**: Streaming delay minimal with chunk optimization

## 📊 Success Metrics

1. **Functional Success**
   - Sequential Thinking completes all thoughts automatically
   - Web scraping tools execute and return results
   - No more raw JSON shown to users

2. **Performance Metrics**
   - Initial response time < 2 seconds
   - Streaming smoothness maintained
   - Tool execution time within limits

3. **Reliability Metrics**
   - 99% successful tool executions
   - Graceful fallback for failures
   - No impact on non-tool conversations

## 🔄 Rollback Plan

### Immediate Rollback (< 5 minutes)
1. Set `ENABLE_STREAMING_MCP=false` in environment
2. This automatically routes to non-streaming implementation
3. No code changes needed

### Code Rollback (if needed)
1. Revert `chat-with-mcp-stream.ts` to previous version
2. Revert configuration files
3. Re-deploy previous version
4. Investigate issues offline

### Gradual Rollback
1. Enable fallback for specific agents only
2. Use feature flags per starship
3. Monitor and fix issues incrementally

## 📝 Key Code Locations

1. **Main File to Update**: `packages/agent-engine/src/chat-with-mcp-stream.ts`
2. **New Configuration Files**:
   - `packages/agent-engine/src/config/agent-executor-config.ts`
   - `packages/agent-engine/src/config/environment.ts`
3. **Supporting File**: `packages/agent-engine/src/tools/MCPToolWrapper.ts`
4. **Test Location**: `packages/agent-engine/tests/integration/`
5. **Related Files**:
   - `packages/agent-engine/src/chat-with-mcp.ts` (fallback implementation)
   - `packages/agent-engine/src/llm/langchain-provider.ts`
   - `.env.example` (root directory)

## 🎯 Expected Outcome

### Sequential Thinking Example
**User**: "Analyze day in life of fisherman"
**Agent Response Flow**:
1. `[Processing with sequentialthinking_sequentialthinking... (step 1)]`
2. `[Processing with sequentialthinking_sequentialthinking... (step 3)]`
3. `[Processing with sequentialthinking_sequentialthinking... (step 5)]`
4. *Streams final comprehensive analysis based on all 7 thoughts*

### Web Scraping Example
**User**: "Tell me what this brand does: https://theingenuity.co/"
**Agent Response Flow**:
1. `[Processing with webscraper_fetch... (step 1)]`
2. *Streams analysis of the website content*

### Key Improvements
- No more raw JSON shown to users
- Progress updates during long operations
- Automatic fallback on errors
- Consistent memory storage
- Better error messages

## 📅 Timeline

**Day 1 (4-6 hours)**
- Morning: Implement core changes
- Afternoon: Test and debug
- Evening: Deploy to development

**Day 2 (2-4 hours)**
- Morning: Monitor and fix issues
- Afternoon: Add enhancements
- Evening: Documentation update

**Total Estimate**: 6-10 hours of focused work

## 🔗 Dependencies

- No new package dependencies required
- Uses existing LangChain agent executor
- Compatible with current MCP tool infrastructure
- No database schema changes needed

## 📚 Additional Resources

- [LangChain Agent Executor Docs](https://js.langchain.com/docs/modules/agents/agent_types/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- Internal MCP Integration Guide: `docs/agent-mcp-integration-plan.md`

## ✅ Definition of Done

### Functional Requirements
- [ ] Sequential Thinking executes all thoughts automatically
- [ ] Progress updates show during tool execution
- [ ] Web scraping tools work properly
- [ ] Memory tools store and retrieve correctly
- [ ] Streaming remains smooth for users
- [ ] Fallback to non-streaming works on error
- [ ] Error messages are user-friendly

### Technical Requirements
- [ ] All configuration options work as expected
- [ ] Environment variables properly loaded
- [ ] Timeout handling works correctly
- [ ] Memory storage only happens on success
- [ ] All tests pass (unit + integration)
- [ ] No performance regression

### Process Requirements
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Deployment runbook created
- [ ] Monitoring alerts configured
- [ ] Deployed to staging and tested
- [ ] Deployed to production with feature flag

## 🚀 Post-Implementation Monitoring

### Metrics to Track
1. **Tool Execution Success Rate**: Target > 95%
2. **Average Execution Time**: Sequential Thinking < 30s
3. **Fallback Frequency**: Target < 5%
4. **User Satisfaction**: No increase in error reports

### Alerts to Configure
- Tool execution timeout (> 2 min)
- High fallback rate (> 10%)
- Memory storage failures
- Agent executor errors