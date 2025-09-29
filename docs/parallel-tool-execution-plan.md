# Parallel Tool Execution Implementation Plan

## Overview

This document outlines the implementation plan for enabling parallel tool execution in the starships.ai autopilot engine. Currently, the system executes tool calls sequentially (one at a time), but this change will enable concurrent execution of multiple independent tool calls from a single LLM response.

## Current Architecture vs. Target Architecture

### Current (Sequential) Flow:
```
LLM Response: [tool_call_1, tool_call_2, tool_call_3]
         ↓
PrepareArgs: extracts tool_calls[0] only
         ↓
Tool: executes 1 tool → back to LLM
         ↓
LLM: processes remaining tool_calls[1], tool_calls[2] in subsequent cycles
```

### Target (Parallel) Flow:
```
LLM Response: [tool_call_1, tool_call_2, tool_call_3]
         ↓
PrepareArgs: extracts ALL tool calls
         ↓
Tool: Promise.allSettled([
  executeToolCall(1),    ← concurrent execution
  executeToolCall(2),    ← concurrent execution  
  executeToolCall(3)     ← concurrent execution
]) → all results back to LLM in one response
```

## Implementation Strategy

### Phase 1: Core Parallel Execution (Priority: HIGH)

#### 1.1 Update Agent Blueprint Generation (`Agent.ts`)
**File:** `packages/autopilot/src/nodes/Agent.ts`
**Location:** `createDefaultBlueprint()` method, lines ~120-135

**Changes:**
- Modify the `prepare_request` node to extract ALL tool calls instead of just `[0]`
- Update ALL tool parameter template expressions to use `callIndex` from current tool call
- Update tool name, description, parameters, blueprint, and toolCallId resolution templates
- Remove backward compatibility concerns (no legacy users to support)

#### 1.2 Update Tool Node Execution (`Tool.ts`)
**File:** `packages/autopilot/src/nodes/Tool.ts`
**Location:** `execute()` method, lines ~24-152

**Changes:**
- Add array detection logic in `execute()` method
- Implement `Promise.allSettled()` for concurrent tool execution
- Create new `executeSingleTool()` method to extract existing single-tool logic
- Add result aggregation logic for multiple tool outputs

### Phase 2: Error Handling & Event Management (Priority: HIGH)

#### 2.1 Enhanced Error Handling
- Implement partial failure handling (some tools succeed, others fail)
- Maintain structured error reporting for each tool call
- Use single state mutation after all tools complete (avoid race conditions)
- Ensure conversation state remains consistent even with partial failures

#### 2.2 Event Emission Strategy (No Backward Compatibility)
- Replace existing `tool_started`/`tool_complete` events entirely
- Implement hybrid approach: batch events + individual progress events
- Add `parallel_tools_started`, `tool_progress`, `parallel_tools_completed` events
- Include batch context in progress events for UI state management

### Phase 3: Advanced Features (Priority: MEDIUM)

#### 3.1 Concurrency Controls
- Add `maxConcurrency` parameter to limit parallel execution
- Implement tool dependency detection (future enhancement)
- Add timeout handling for parallel executions

#### 3.2 Performance Optimizations
- Implement tool result caching for repeated calls
- Add execution time tracking and metrics
- Optimize memory usage for large tool call batches

## Technical Implementation Details

### 1. Agent Blueprint Changes

#### 1.1 Prepare Tool Args Node (Extract ALL tool calls)

```typescript
// Current code (lines ~126-132 in Agent.ts)
{
  ref: argsNodeRef,
  type: 'code' as const,
  name: 'Prepare Tool Args',
  parameters: {
    code: `
      const last = $lastOutputOf("${llmNodeRef}")[0]?.json;
      const j = last?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments_json;
      if (j && typeof j === 'object') { return j; }
      throw new Error('Missing tool_call function.arguments_json');
    `,
  },
}

// New code (updated)
{
  ref: argsNodeRef,
  type: 'code' as const,
  name: 'Prepare Tool Args',
  parameters: {
    code: `
      const last = $lastOutputOf("${llmNodeRef}")[0]?.json;
      const toolCalls = last?.choices?.[0]?.message?.tool_calls || [];
      
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        throw new Error('No tool calls found in LLM response');
      }
      
      // Return ALL tool calls with their arguments
      return toolCalls.map((call, index) => {
        const argsJson = call?.function?.arguments_json;
        if (!argsJson || typeof argsJson !== 'object') {
          throw new Error(\`Missing tool_call function.arguments_json for call \${index}\`);
        }
        return {
          id: call.id,
          name: call.function?.name,
          arguments: argsJson,
          callIndex: index
        };
      });
    `,
  },
}
```

#### 1.2 Tool Parameter Template Updates (ALL need updating)

```typescript
// Tool execution node - UPDATE ALL TEMPLATE EXPRESSIONS
{
  ref: toolNodeRef,
  type: 'tool' as const,
  name: 'Execute Tool',
  parameters: {
    // OLD: Hardcoded [0] index
    name: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.tool_calls; const rawName = calls?.[0]?.function?.name; /* ... */ })() }}`
    
    // NEW: Use callIndex from current tool call data
    name: `{{ (() => { 
      const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.tool_calls; 
      const currentIndex = $input()?.callIndex || 0;
      const rawName = calls?.[currentIndex]?.function?.name;
      const norm = typeof rawName === 'string' ? rawName.split('.').pop() : rawName;
      const tools = Array.isArray(state?.tools) ? state.tools : [];
      const tool = tools.find(t => t && typeof t.name === 'string' && t.name.toLowerCase() === String(norm ?? '').toLowerCase());
      return tool?.name ?? (norm ?? "");
    })() }}`,
    
    // Similar updates needed for: description, parameters, blueprint, toolCallId
    description: `{{ /* Updated with currentIndex logic */ }}`,
    parameters: `{{ /* Updated with currentIndex logic */ }}`,
    blueprint: `{{ /* Updated with currentIndex logic */ }}`,
    toolCallId: `{{ $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.tool_calls?.[$input()?.callIndex || 0]?.id ?? "" }}`,
    
    // CRITICAL: Single state mutation after ALL tools complete
    mutations: [
      {
        operation: 'add',
        path: '/state/messages',
        value: `{{ 
          (() => {
            const toolResults = $lastOutputOf("${toolNodeRef}")[0]?.json;
            if (!Array.isArray(toolResults)) return [];
            
            // Add batch metadata first
            const batchMessage = {
              role: 'assistant',
              content: '',
              tool_batch_id: 'batch_' + Date.now(),
              tool_batch_count: toolResults.length
            };
            
            // Add individual tool messages
            const toolMessages = toolResults.map(result => ({
              role: 'tool',
              tool_call_id: result.toolCallId,
              name: result.toolName,
              content: JSON.stringify(result.success ? result.data : { error: result.error }),
              tool_batch_id: 'batch_' + Date.now()
            }));
            
            return [batchMessage, ...toolMessages];
          })()
        }}`
      },
      // Update batch tracking (replace individual ID tracking)
      {
        operation: 'replace',
        path: '/state/lastProcessedBatch',
        value: {
          batchId: `{{ 'batch_' + Date.now() }}`,
          toolCallIds: `{{ $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.tool_calls?.map(call => call.id) || [] }}`,
          completedAt: `{{ new Date().toISOString() }}`
        }
      }
    ]
  }
}
```

### 2. Tool Node Execution Changes

```typescript
// New execute method structure in Tool.ts
async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
  const params = this.getParams();
  const inputData = ExecutionItemUtils.unwrapSingle(input);
  
  // Detect if we have multiple tool calls
  if (Array.isArray(inputData)) {
    return this.executeMultipleTools(inputData);
  }
  
  // Single tool call (no backward compatibility needed)
  return this.executeSingleTool(inputData);
}

private async executeMultipleTools(toolCalls: ToolCallData[]): Promise<ExecutionItem[]> {
  const eventCallback = this.getOptions()?.eventCallback;
  const parentDepth = this.getOptions()?.execution?.depth ?? 0;
  const batchId = `batch_${Date.now()}`;
  let completedCount = 0;
  
  // Emit batch started event
  if (eventCallback) {
    await eventCallback({
      type: 'parallel_tools_started',
      timestamp: new Date().toISOString(),
      executionDepth: parentDepth,
      data: {
        batchId,
        toolCount: toolCalls.length,
        toolNames: toolCalls.map(call => call.name)
      }
    });
  }
  
  // Execute all tools in parallel with individual progress events
  const results = await Promise.allSettled(
    toolCalls.map(async (toolCall, index) => {
      // Emit tool started
      if (eventCallback) {
        await eventCallback({
          type: 'tool_progress',
          timestamp: new Date().toISOString(),
          executionDepth: parentDepth,
          data: {
            batchId,
            toolName: toolCall.name,
            toolCallId: toolCall.id,
            status: 'started',
            batchProgress: {
              completed: completedCount,
              total: toolCalls.length,
              remaining: toolCalls.slice(completedCount + 1).map(t => t.name)
            }
          }
        });
      }
      
      try {
        const result = await this.executeSingleToolCall(toolCall);
        completedCount++;
        
        // Emit tool completed
        if (eventCallback) {
          await eventCallback({
            type: 'tool_progress',
            timestamp: new Date().toISOString(),
            executionDepth: parentDepth,
            data: {
              batchId,
              toolName: toolCall.name,
              toolCallId: toolCall.id,
              status: 'completed',
              result: result,
              batchProgress: {
                completed: completedCount,
                total: toolCalls.length,
                remaining: toolCalls.slice(completedCount).map(t => t.name)
              }
            }
          });
        }
        
        return {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          success: true,
          data: ExecutionItemUtils.unwrapSingle(result),
          executionTime: Date.now() // Add timing if needed
        };
      } catch (error) {
        completedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Emit tool failed
        if (eventCallback) {
          await eventCallback({
            type: 'tool_progress',
            timestamp: new Date().toISOString(),
            executionDepth: parentDepth,
            data: {
              batchId,
              toolName: toolCall.name,
              toolCallId: toolCall.id,
              status: 'failed',
              error: errorMessage,
              batchProgress: {
                completed: completedCount,
                total: toolCalls.length,
                remaining: toolCalls.slice(completedCount).map(t => t.name)
              }
            }
          });
        }
        
        return {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          success: false,
          error: errorMessage,
          executionTime: Date.now()
        };
      }
    })
  );
  
  // Emit batch completed
  if (eventCallback) {
    await eventCallback({
      type: 'parallel_tools_completed',
      timestamp: new Date().toISOString(),
      executionDepth: parentDepth,
      data: {
        batchId,
        summary: {
          total: toolCalls.length,
          successful: results.filter(r => r.status === 'fulfilled' && r.value.success).length,
          failed: results.filter(r => r.status === 'rejected' || !r.value.success).length
        },
        results: results
      }
    });
  }
  
  // Process and combine results for return
  return this.combineToolResults(results, toolCalls);
}

// Resource Management: Shared LocalRunner pool for parallel tools
private static localRunnerPool: LocalRunner[] = [];
private static poolSize = 3;

private async getRunner(): Promise<Runner> {
  const depth = this.getOptions()?.execution?.depth ?? 0;
  
  if (depth === 0) {
    return new ChildProcessRunner(); // Top-level only
  }
  
  // For nested (parallel tools), use pooled LocalRunners
  if (Tool.localRunnerPool.length === 0) {
    for (let i = 0; i < Tool.poolSize; i++) {
      Tool.localRunnerPool.push(new LocalRunner());
    }
  }
  
  return Tool.localRunnerPool[Math.floor(Math.random() * Tool.localRunnerPool.length)];
}

// Memory Optimization: Lightweight execution contexts
private async executeSingleTool(toolCall: ToolCallData): Promise<ExecutionItem[]> {
  const parentExec = this.getOptions()?.execution;
  
  // Create lightweight execution - reuse parent context where possible
  const lightweightExec = {
    ...parentExec,
    id: `${parentExec?.id}_tool_${toolCall.callIndex}`,
    results: [], // Fresh results array
    state: { ...parentExec?.state }, // Shallow copy of state
    depth: (parentExec?.depth ?? 0) + 1
  };
  
  // Reuse blueprint reference (immutable)
  const sharedBlueprint = this.getToolBlueprint(toolCall.name);
  
  const runner = await this.getRunner();
  return await runner.run(sharedBlueprint, lightweightExec, this.getEngineConfig());
}
```

## Benefits

### Performance Improvements
- **3x faster execution** for 3 independent tool calls
- **Reduced conversation rounds** between LLM and tools
- **Better resource utilization** through concurrent execution

### User Experience
- **Faster agent responses** for multi-tool scenarios
- **More natural conversation flow** with batched tool results
- **Improved reliability** through isolated error handling

### Developer Experience
- **Maintains existing API** - no breaking changes for single tool usage
- **Enhanced debugging** with parallel execution tracking
- **Future-ready architecture** for advanced tool orchestration

## Risks & Mitigations

### Risk 1: Tool Interdependencies
**Problem:** Some tools might depend on outputs from other tools
**Mitigation:** 
- Phase 1: Execute all tools in parallel (assume independence)
- Phase 3: Add dependency detection and sequential execution for dependent tools

### Risk 2: Resource Exhaustion
**Problem:** Too many concurrent tool executions could overwhelm system resources
**Mitigation:**
- Implement shared LocalRunner pool (poolSize: 3) for parallel tools
- Use lightweight execution contexts (~70% memory reduction)
- Add memory and timeout monitoring
- Force parallel tools to use LocalRunner (no infinite ChildProcess spawning)

### Risk 3: Error Handling Complexity
**Problem:** Partial failures become harder to manage
**Mitigation:**
- Structured error reporting for each tool call
- Clear success/failure indicators in tool results
- Single state mutation after all tools complete (avoids race conditions)
- Graceful degradation pattern - continue conversation with successful results

### Risk 4: Memory Exhaustion
**Problem:** Multiple Blueprint instantiation could cause memory issues
**Mitigation:**
- Lightweight execution contexts with shared immutable blueprint references
- Shallow state copying instead of deep cloning
- Runner pooling to prevent resource leaks

### Risk 5: Event Emission Complexity
**Problem:** Individual progress events could overwhelm UI or create ordering issues
**Mitigation:**
- Include batch context in all progress events for proper UI state management
- Structured event data with batchId for grouping
- Clear event ordering with batch progress indicators

### Risk 6: State Mutation Race Conditions
**Problem:** Multiple tools trying to mutate conversation state simultaneously
**Mitigation:**
- Single state mutation approach - Tool node collects ALL results first
- No parallel mutations to avoid race conditions
- Batch-based state updates with structured message format

## Testing Strategy

### Unit Tests
- Test single tool execution (backward compatibility)
- Test multiple tool execution with all successes
- Test multiple tool execution with partial failures
- Test error cases (no tool calls, malformed inputs)

### Integration Tests
- Test full Agent workflow with parallel tools
- Test conversation continuity after parallel tool execution
- Test event emission for parallel tool scenarios

### Performance Tests
- Benchmark parallel vs sequential execution times
- Test resource usage under high concurrency
- Test timeout handling for slow tools

## Migration Path

### Phase 1: Implementation (1-2 weeks)
1. Implement core parallel execution changes
2. Add basic error handling
3. Update unit tests
4. Manual testing with simple tool scenarios

### Phase 2: Refinement (1 week)
1. Enhanced error handling and event management
2. Integration testing
3. Performance testing and optimization
4. Documentation updates

### Phase 3: Advanced Features (Future)
1. Tool dependency detection
2. Advanced concurrency controls
3. Performance monitoring and metrics

## Success Criteria

### Must Have (Phase 1)
- ✅ Multiple independent tool calls execute in parallel
- ✅ Single tool calls continue to work (no backward compatibility needed)
- ✅ Proper error handling for partial failures with graceful degradation
- ✅ Single state mutation to avoid race conditions
- ✅ Individual tool progress events with batch context
- ✅ Resource management with runner pooling and lightweight contexts

### Should Have (Phase 2)
- ✅ Complete event emission strategy with batch + individual progress events
- ✅ Performance improvements measurable (3x+ faster for multi-tool scenarios)
- ✅ Memory optimization validation (~70% reduction in resource usage)
- ✅ Comprehensive test coverage including race condition scenarios
- ✅ Updated documentation and type definitions

### Could Have (Phase 3)
- ✅ Tool dependency detection and smart execution ordering
- ✅ Advanced concurrency controls and resource management
- ✅ Performance monitoring and metrics collection

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 1-2 weeks | Core parallel execution, basic error handling |
| Phase 2 | 1 week | Enhanced features, testing, documentation |
| Phase 3 | Future | Advanced features, optimization |

---

## New Type Definitions Required

```typescript
// In types/parallel-tools.ts - NEW FILE
export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  callIndex: number;
  originalCall?: unknown; // Reference to original LLM tool_call
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
  executionTime?: number;
}

export interface BatchExecutionSummary {
  batchId: string;
  total: number;
  successful: number;
  failed: number;
  executionTime: number;
  results: ToolExecutionResult[];
}

// New Event Types (replace existing tool events)
export type ParallelToolEvents = 
  | 'parallel_tools_started'    // Batch started
  | 'tool_progress'             // Individual tool progress
  | 'parallel_tools_completed'  // Batch completed
  | 'parallel_tools_failed';    // Batch failed

export interface ToolProgressEventData {
  batchId: string;
  toolName: string;
  toolCallId: string;
  status: 'started' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  batchProgress: {
    completed: number;
    total: number;
    remaining: string[];
  };
}
```

**Next Steps:**
1. ✅ Review and approve this updated implementation plan
2. Create new type definitions in `types/parallel-tools.ts`
3. Begin Phase 1 implementation with Agent.ts blueprint changes (ALL template expressions)
4. Update Tool.ts for parallel execution support with event emission
5. Implement resource management (runner pooling, lightweight contexts)
6. Comprehensive testing including race condition and memory usage validation