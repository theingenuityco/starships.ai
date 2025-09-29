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
- Update tool parameter resolution to handle arrays of tool calls
- Maintain backward compatibility for single tool calls

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
- Ensure conversation state remains consistent even with partial failures

#### 2.2 Event Emission Updates
- Update `tool_started` events to handle multiple concurrent tools
- Modify `tool_complete` events for batch completion
- Add new `tools_batch_started` and `tools_batch_completed` events

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

// New code (proposed)
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
  
  // Single tool call (backward compatibility)
  return this.executeSingleTool(inputData);
}

private async executeMultipleTools(toolCalls: ToolCallData[]): Promise<ExecutionItem[]> {
  const eventCallback = this.getOptions()?.eventCallback;
  const parentDepth = this.getOptions()?.execution?.depth ?? 0;
  
  // Emit batch started event
  if (eventCallback) {
    await eventCallback({
      type: 'tools_batch_started',
      timestamp: new Date().toISOString(),
      executionDepth: parentDepth,
      data: {
        toolCount: toolCalls.length,
        toolNames: toolCalls.map(call => call.name)
      }
    });
  }
  
  // Execute all tools in parallel
  const results = await Promise.allSettled(
    toolCalls.map(async (toolCall) => {
      try {
        return await this.executeSingleToolCall(toolCall);
      } catch (error) {
        return {
          toolCall,
          error: error instanceof Error ? error.message : 'Unknown error',
          success: false
        };
      }
    })
  );
  
  // Process and combine results
  return this.combineToolResults(results, toolCalls);
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
- Add `maxConcurrency` parameter (default: 5)
- Implement tool execution queuing for large batches
- Add memory and timeout monitoring

### Risk 3: Error Handling Complexity
**Problem:** Partial failures become harder to manage
**Mitigation:**
- Structured error reporting for each tool call
- Clear success/failure indicators in tool results
- Maintain conversation context even with partial failures

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
- ✅ Single tool calls continue to work (backward compatibility)
- ✅ Proper error handling for partial failures
- ✅ All existing tests pass

### Should Have (Phase 2)
- ✅ Enhanced event emission for parallel execution tracking
- ✅ Performance improvements measurable (2x+ faster for multi-tool scenarios)
- ✅ Comprehensive test coverage
- ✅ Updated documentation

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

**Next Steps:**
1. Review and approve this implementation plan
2. Begin Phase 1 implementation with Agent.ts blueprint changes
3. Update Tool.ts for parallel execution support
4. Comprehensive testing and validation