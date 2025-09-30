# Parallel Tool Execution Implementation Plan (v2 - Smart Tool Node Pattern)

## Overview

This document outlines the revised implementation plan for enabling parallel tool execution in the starships.ai autopilot engine using the **"Smart Tool Node"** architectural pattern. This approach minimizes blueprint complexity while maximizing parallel execution capabilities.

## Architecture Pattern: Smart Tool Node

### Core Principle
**Keep Agent blueprint simple, let Tool node handle all parallel execution complexity internally.**

```
Agent: "Here's an array of tool calls"
Tool: "I'll handle the parallel execution, progress tracking, and error recovery"  
Agent: "Great, I'll just wait for the combined results"
```

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
PrepareArgs: extracts ALL tool calls as array
         ↓
Tool: Smart orchestration with Promise.allSettled([...])
         ↓
All results back to LLM in one response
```

## Implementation Strategy (Revised)

### Phase 1: Core Parallel Execution (Priority: HIGH)

#### 1.1 Update Agent Blueprint Generation (`Agent.ts`)
**File:** `packages/autopilot/src/nodes/Agent.ts`
**Location:** `createDefaultBlueprint()` method, lines ~120-175

**Changes:**
- **SIMPLIFIED**: Modify `prepare_args` node to extract ALL tool calls
- **ELIMINATED**: Remove ALL dynamic template expressions
- **STATIC**: Use universal tool executor configuration
- **UNCHANGED**: Keep existing edge structure

#### 1.2 Update Tool Node Execution (`Tool.ts`)
**File:** `packages/autopilot/src/nodes/Tool.ts`  
**Location:** `execute()` method, lines ~24-152

**Changes:**
- Implement smart routing in `execute()` method
- Add complete missing method implementations
- Implement thread-safe progress tracking
- Add pre-resolution for tool blueprints

### Phase 2: Error Handling & Event Management (Priority: HIGH)

#### 2.1 Enhanced Error Handling
- Hierarchical error recovery with `nodeError` flag
- Graceful degradation for complete Tool node failures
- Atomic batch operations to prevent race conditions

#### 2.2 Event Emission Strategy (No Backward Compatibility)
- Replace existing events entirely
- Implement atomic progress tracking with Set operations
- Single batch ID generation for consistency

### Phase 3: Advanced Features (Priority: MEDIUM)
- Tool dependency detection
- Advanced concurrency controls
- Performance monitoring and metrics

## Technical Implementation Details (Revised)

### 1. Agent Blueprint Changes - SIMPLIFIED

#### 1.1 Prepare Tool Args Node (Extract ALL tool calls)

```typescript
// SIMPLIFIED - Let Tool node handle complexity
{
  ref: argsNodeRef,
  type: 'code' as const,
  name: 'Prepare Tool Args',
  parameters: {
    code: `
      const last = $lastOutputOf("${llmNodeRef}")[0]?.json;
      const toolCalls = last?.choices?.[0]?.message?.tool_calls || [];
      
      // Handle empty tool calls gracefully (return empty array instead of error)
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        // Return empty array - Tool node will handle appropriately
        return [];
      }
      
      // Return the WHOLE array - Tool node handles distribution
      return toolCalls.map((call, index) => ({
        id: call.id,
        name: call.function?.name || '',
        arguments: call.function?.arguments_json || {},
        callIndex: index,
        toolCallId: call.id
      }));
    `,
  },
}
```

#### 1.2 Tool Execution Node - STATIC Configuration

```typescript
// SIMPLIFIED - No complex template expressions
{
  ref: toolNodeRef,
  type: 'tool' as const,
  name: 'Execute Tools',
  parameters: {
    // Static configuration - Tool.execute() handles everything
    name: 'universal_tool_executor',
    description: 'Execute tools based on input data',
    parameters: {
      type: 'object',
      properties: {
        toolCalls: {
          type: 'array',
          items: { type: 'object' }
        }
      }
    },
    blueprint: null, // Tool node builds blueprints dynamically
    
    // Single state mutation after ALL tools complete
    mutations: [
      {
        operation: 'add',
        path: '/state/messages',
        value: `{{ 
          (() => {
            const results = $lastOutputOf("${toolNodeRef}")[0]?.json;
            if (!results) return [];
            
            const batchId = results.batchId;
            const timestamp = results.timestamp;
            
            // Add batch metadata first  
            const messages = [{
              role: 'assistant',
              content: '',
              tool_batch_id: batchId,
              tool_batch_timestamp: timestamp,
              tool_batch_count: results.successful?.length + results.failed?.length || 0
            }];
            
            // Add successful tool messages
            if (results.successful) {
              messages.push(...results.successful.map(result => ({
                role: 'tool',
                tool_call_id: result.toolCallId,
                name: result.toolName,
                content: JSON.stringify(result.data),
                tool_batch_id: batchId
              })));
            }
            
            // Add failed tool messages  
            if (results.failed) {
              messages.push(...results.failed.map(result => ({
                role: 'tool',
                tool_call_id: result.toolCallId,
                name: result.toolName,
                content: JSON.stringify({ error: result.error }),
                tool_batch_id: batchId,
                tool_failed: true
              })));
            }
            
            return messages;
          })()
        }}`
      },
      // Update batch tracking
      {
        operation: 'replace',
        path: '/state/lastProcessedBatch',
        value: `{{ 
          (() => {
            const results = $lastOutputOf("${toolNodeRef}")[0]?.json;
            return {
              batchId: results?.batchId,
              toolCallIds: results?.processedIds || [],
              completedAt: new Date().toISOString()
            };
          })()
        }}`
      }
    ]
  }
}
```

#### 1.3 Conditional Node - UPDATED for Batch Processing

```typescript
{
  ref: conditionalNodeRef,
  type: 'conditional',
  name: 'Check Tool Calls',
  parameters: {
    condition: `{{(() => {
      const last = $input();
      const fr = last?.choices?.[0]?.finish_reason;
      
      // Check for tool node errors
      if (last?.nodeError) {
        return "continue"; // Skip tool execution, continue conversation
      }
      
      // Handle length (continue generation)
      if (fr === "length") return "continue";
      
      // Check for tool calls
      const calls = last?.choices?.[0]?.message?.tool_calls;
      if (!Array.isArray(calls) || calls.length === 0) return "complete";
      
      // Check if already processed (avoid reprocessing)
      const batchState = state?.lastProcessedBatch;
      const currentCallIds = calls.map(c => c.id).sort().join(',');
      const processedCallIds = batchState?.toolCallIds?.sort()?.join(',') || '';
      
      if (currentCallIds === processedCallIds) {
        return "complete"; // Already processed this batch
      }
      
      return "call_tool"; // Process tool calls (single or multiple)
    })()}` 
  }
}
```

### 2. Tool Node Implementation - COMPLETE

```typescript
// Tool.ts - Complete implementation with all missing methods

import { BaseNode } from './BaseNode';
import type { ToolParams } from '@/types/node-parameters';
import { ValidationResult, ExecutionItem, Execution } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { EngineConfig } from '@/engine/Engine';
import { Blueprint } from '@/types/blueprint';
import { LocalRunner } from '@/runner/LocalRunner';
import { ChildProcessRunner } from '@/runner/ChildProcessRunner';
import type { Runner } from '@/runner/Runner';

export class Tool extends BaseNode<ToolParams> {
  // Resource Management
  private static localRunnerPool: LocalRunner[] = [];
  private static poolSize = 3;
  
  /**
   * Smart execute method - routes based on input type and node configuration
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    try {
      const params = this.getParams();
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      
      // Check if this is the universal tool executor for parallel execution
      const isUniversalExecutor = params.name === 'universal_tool_executor';
      
      // Smart routing based on input and configuration
      if (isUniversalExecutor && Array.isArray(inputData)) {
        // Universal executor mode - handle array of tool calls
        if (inputData.length > 1) {
          return await this.executeMultipleTools(inputData);
        } else if (inputData.length === 1) {
          return await this.executeSingleToolCall(inputData[0]);
        } else {
          // Empty array - no tools to execute, return empty result
          return ExecutionItemUtils.wrapSingle({
            batchId: this.generateBatchId(),
            timestamp: new Date().toISOString(),
            successful: [],
            failed: [],
            processedIds: [],
            summary: { total: 0, successful: 0, failed: 0, successRate: '0%' }
          });
        }
      } else {
        // Legacy single tool call mode (for backward compatibility)
        return await this.executeLegacyToolExecution(input);
      }
    } catch (toolNodeError) {
      // Hierarchical error recovery
      return [{
        json: {
          batchId: this.generateBatchId(),
          successful: [],
          failed: [{
            error: 'Tool node execution failed',
            details: toolNodeError.message,
            recovery: 'Continue conversation without tool results'
          }],
          summary: { total: 0, successful: 0, failed: 1 },
          nodeError: true // Flag for Agent to handle gracefully
        },
        error: toolNodeError.message,
        pairedItem: input?.[0]?.pairedItem || { item: 0 }
      }];
    }
  }
  
  /**
   * Execute multiple tools in parallel with atomic progress tracking
   */
  private async executeMultipleTools(toolCalls: ToolCallData[]): Promise<ExecutionItem[]> {
    const batchId = this.generateBatchId();
    const timestamp = new Date().toISOString();
    
    // Pre-resolve ALL tools upfront (once)
    const toolRegistry = await this.buildToolRegistry();
    
    // Validate all tools exist before starting
    for (const call of toolCalls) {
      if (!toolRegistry.has(call.name.toLowerCase())) {
        throw new Error(`Tool '${call.name}' not found in registry`);
      }
    }
    
    // Atomic progress tracker
    const progressTracker = {
      completed: new Set<string>(),
      failed: new Set<string>(),
      getProgress: () => ({
        completed: progressTracker.completed.size,
        failed: progressTracker.failed.size,
        total: toolCalls.length,
        remaining: toolCalls.filter(call => 
          !progressTracker.completed.has(call.id) && 
          !progressTracker.failed.has(call.id)
        ).map(call => call.name)
      })
    };
    
    // Emit batch started
    await this.emitEvent('parallel_tools_started', {
      batchId,
      timestamp,
      toolCount: toolCalls.length,
      toolNames: toolCalls.map(call => call.name)
    });
    
    // Execute all tools in parallel
    const results = await Promise.allSettled(
      toolCalls.map(async (toolCall) => {
        const toolConfig = toolRegistry.get(toolCall.name.toLowerCase())!;
        
        // Emit progress started
        await this.emitProgress(batchId, toolCall, 'started', progressTracker.getProgress());
        
        try {
          const result = await this.executeWithToolConfig(toolCall, toolConfig);
          progressTracker.completed.add(toolCall.id);
          await this.emitProgress(batchId, toolCall, 'completed', progressTracker.getProgress(), result);
          
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: true,
            data: ExecutionItemUtils.unwrapSingle(result)
          };
        } catch (error) {
          progressTracker.failed.add(toolCall.id);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await this.emitProgress(batchId, toolCall, 'failed', progressTracker.getProgress(), null, errorMessage);
          
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: false,
            error: errorMessage
          };
        }
      })
    );
    
    // Emit batch completed
    await this.emitEvent('parallel_tools_completed', {
      batchId,
      timestamp,
      summary: progressTracker.getProgress()
    });
    
    return this.combineResults(results, batchId, timestamp, toolCalls);
  }
  
  /**
   * Execute single tool call
   */
  private async executeSingleToolCall(toolCall: ToolCallData): Promise<ExecutionItem[]> {
    const toolRegistry = await this.buildToolRegistry();
    const toolConfig = toolRegistry.get(toolCall.name.toLowerCase());
    
    if (!toolConfig) {
      throw new Error(`Tool '${toolCall.name}' not found`);
    }
    
    return await this.executeWithToolConfig(toolCall, toolConfig);
  }
  
  /**
   * Execute legacy single tool (backward compatibility)
   */
  private async executeLegacyToolExecution(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // This handles the existing single tool execution pattern
    // where Tool node has its own blueprint parameter
    const params = this.getParams();
    
    if (!params.blueprint) {
      throw new Error(`Tool '${params.name}' missing blueprint parameter`);
    }
    
    const inputData = ExecutionItemUtils.unwrapSingle(input);
    const parentExec = this.getOptions()?.execution;
    const toolExecution = ExecutionItemUtils.createExecution(
      ExecutionItemUtils.wrapSingle(inputData),
      parentExec
    );
    
    const runner = await this.getRunner();
    const engineConfig = this.getEngineConfig();
    
    return await runner.run(params.blueprint, toolExecution, engineConfig);
  }
  
  /**
   * Execute tool with pre-resolved config
   */
  private async executeWithToolConfig(
    toolCall: ToolCallData, 
    toolConfig: ToolConfig
  ): Promise<ExecutionItem[]> {
    const parentExec = this.getOptions()?.execution;
    
    // Create lightweight execution context
    const toolExecution = {
      ...parentExec,
      id: `${parentExec?.id}_tool_${toolCall.callIndex}`,
      results: [], // Fresh results array
      state: { ...parentExec?.state }, // Shallow copy
      depth: (parentExec?.depth ?? 0) + 1
    };
    
    // Add tool arguments to execution
    const executionWithArgs = ExecutionItemUtils.createExecution(
      ExecutionItemUtils.wrapSingle(toolCall.arguments),
      toolExecution
    );
    
    const runner = await this.getRunner();
    return await runner.run(toolConfig.blueprint, executionWithArgs, this.getEngineConfig());
  }
  
  /**
   * Build tool registry with pre-resolved blueprints
   */
  private async buildToolRegistry(): Promise<Map<string, ToolConfig>> {
    const state = this.getOptions()?.execution?.state as any;
    const tools = Array.isArray(state?.tools) ? state.tools : [];
    const registry = new Map<string, ToolConfig>();
    
    tools.forEach(tool => {
      if (tool?.name && tool?.blueprint) {
        registry.set(tool.name.toLowerCase(), {
          name: tool.name,
          description: tool.description,
          blueprint: tool.blueprint,
          parameters: tool.parameters
        });
      }
    });
    
    return registry;
  }
  
  /**
   * Combine parallel execution results
   */
  private combineResults(
    results: PromiseSettledResult<any>[], 
    batchId: string,
    timestamp: string,
    toolCalls: ToolCallData[]
  ): ExecutionItem[] {
    const successful = [];
    const failed = [];
    const processedIds = [];
    
    results.forEach((result, index) => {
      processedIds.push(toolCalls[index].id);
      
      if (result.status === 'fulfilled' && result.value.success) {
        successful.push(result.value);
      } else {
        failed.push(
          result.status === 'fulfilled' 
            ? result.value 
            : {
                toolCallId: toolCalls[index].id,
                toolName: toolCalls[index].name,
                success: false,
                error: result.reason?.message || 'Unknown error'
              }
        );
      }
    });
    
    return ExecutionItemUtils.wrapSingle({
      batchId,
      timestamp,
      successful,
      failed,
      processedIds,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        successRate: `${(successful.length / results.length * 100).toFixed(1)}%`
      }
    });
  }
  
  /**
   * Get runner with pooling for parallel tools
   */
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
  
  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get engine configuration
   */
  private getEngineConfig(): EngineConfig {
    return {
      eventCallback: this.getEventCallback(),
      failOnNodeError: false, // Continue with partial failures
      secureEnv: this.getOptions()?.secureEnv
    };
  }
  
  /**
   * Emit progress event with batch context
   */
  private async emitProgress(
    batchId: string,
    toolCall: ToolCallData,
    status: 'started' | 'completed' | 'failed',
    progress: any,
    result?: any,
    error?: string
  ): Promise<void> {
    const eventCallback = this.getEventCallback();
    if (!eventCallback) return;
    
    await eventCallback({
      type: 'tool_progress',
      timestamp: new Date().toISOString(),
      executionDepth: this.getOptions()?.execution?.depth ?? 0,
      data: {
        batchId,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        status,
        ...(result && { result }),
        ...(error && { error }),
        batchProgress: progress
      }
    });
  }
  
  /**
   * Emit generic event
   */
  private async emitEvent(type: string, data: any): Promise<void> {
    const eventCallback = this.getEventCallback();
    if (!eventCallback) return;
    
    await eventCallback({
      type,
      timestamp: new Date().toISOString(),
      executionDepth: this.getOptions()?.execution?.depth ?? 0,
      data
    });
  }
}

// Type definitions
interface ToolConfig {
  name: string;
  description?: string;
  blueprint: Blueprint;
  parameters?: any;
}

interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  callIndex: number;
  toolCallId: string;
}
```

## Benefits of Smart Tool Node Pattern

### Simplicity
- **Minimal blueprint changes** - Agent blueprint stays simple
- **No template complexity** - Static configuration only
- **Clean separation of concerns** - Each component has one job

### Performance
- **3x faster execution** for independent tool calls
- **Pre-resolved tool registry** - O(1) lookups
- **Resource pooling** - Efficient runner management
- **~70% memory reduction** - Lightweight execution contexts

### Reliability
- **Thread-safe operations** - Atomic Set operations
- **Graceful degradation** - Hierarchical error recovery
- **No race conditions** - Single state mutation
- **Type safety** - Clear contracts throughout

## Risks & Mitigations (Updated)

### Risk 1: Implementation Complexity
**Problem:** Smart Tool node has complex internal logic
**Mitigation:** 
- Well-defined method boundaries
- Complete error handling at each level
- Comprehensive unit tests

### Risk 2: Resource Management
**Problem:** Multiple parallel executions could overwhelm system
**Mitigation:**
- LocalRunner pooling (poolSize: 3)
- Lightweight execution contexts
- Pre-resolved tool registry

### Risk 3: Progress Tracking Accuracy
**Problem:** Concurrent updates to progress state
**Mitigation:**
- Atomic Set operations
- No manual counting
- Immutable progress snapshots

## Testing Strategy

### Unit Tests
- Single tool execution
- Multiple tool parallel execution
- Partial failure scenarios
- Complete Tool node failure
- Progress tracking accuracy

### Integration Tests
- Full Agent workflow with parallel tools
- Conversation continuity after failures
- Event emission ordering
- State mutation consistency

### Performance Tests
- Benchmark parallel vs sequential (expect 3x improvement)
- Memory usage validation (expect ~70% reduction)
- Resource pool efficiency

## Type Definitions

```typescript
// types/parallel-tools.ts
export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  callIndex: number;
  toolCallId: string; // Same as id for consistency
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BatchExecutionResult {
  batchId: string;
  timestamp: string;
  successful: ToolExecutionResult[];
  failed: ToolExecutionResult[];
  processedIds: string[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    successRate: string;
  };
}

export type ParallelToolEvents = 
  | 'parallel_tools_started'
  | 'tool_progress'
  | 'parallel_tools_completed';

export interface ToolProgressEventData {
  batchId: string;
  toolName: string;
  toolCallId: string;
  status: 'started' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  batchProgress: {
    completed: number;
    failed: number;
    total: number;
    remaining: string[];
  };
}
```

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 3-4 days | Core parallel execution with Smart Tool Node |
| Phase 2 | 2-3 days | Error handling, event management, testing |
| Phase 3 | Future | Advanced features, optimization |

## 📊 Live Implementation Status Tracker

### **Phase 1: Core Parallel Execution** (Priority: HIGH)
**Status**: 🟡 **PLANNING** | **Target**: 3-4 days | **Started**: 2025-01-30 | **Deadline**: 2025-02-03

| Task | Status | Progress | Est. Time | Assignee | Last Updated | Notes |
|------|--------|----------|-----------|----------|--------------|-------|
| **1.1** Create Type Definitions | 🔴 **TODO** | 0% | 2h | - | - | Create `types/parallel-tools.ts` |
| **1.2** Update Agent Blueprint - Prepare Args | 🔴 **TODO** | 0% | 4h | - | - | Simplified array extraction logic |
| **1.3** Update Agent Blueprint - Tool Config | 🔴 **TODO** | 0% | 3h | - | - | Static universal executor config |
| **1.4** Update Agent Blueprint - Conditional | 🔴 **TODO** | 0% | 3h | - | - | Smart batch detection logic |
| **1.5** Implement Tool.execute() routing | 🔴 **TODO** | 0% | 6h | - | - | Smart input detection & routing |
| **1.6** Implement parallel execution | 🔴 **TODO** | 0% | 8h | - | - | Promise.allSettled with progress |
| **1.7** Implement missing methods | 🔴 **TODO** | 0% | 4h | - | - | All helper & utility methods |
| **1.8** Basic Unit Tests | 🔴 **TODO** | 0% | 6h | - | - | Core functionality validation |

**Phase 1 Overall Progress**: **0%** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ | **Total Estimated**: 36 hours | **Remaining**: 36h

#### Phase 1 Dependencies & Blockers
- 🔗 **Dependency**: Task 1.1 must complete before 1.5-1.7
- 🔗 **Dependency**: Tasks 1.2-1.4 must complete before 1.8
- ⚠️ **Risk**: Type definitions may need iteration based on implementation discoveries

---

### **Phase 2: Error Handling & Events** (Priority: HIGH)
**Status**: 🔴 **WAITING** | **Target**: 2-3 days | **Starts After**: Phase 1 | **Deadline**: 2025-02-06

| Task | Status | Progress | Est. Time | Assignee | Last Updated | Notes |
|------|--------|----------|-----------|----------|--------------|-------|
| **2.1** Hierarchical error recovery | 🔴 **WAITING** | 0% | 4h | - | - | nodeError flag handling & graceful degradation |
| **2.2** Event emission implementation | 🔴 **WAITING** | 0% | 6h | - | - | Replace old events with atomic progress |
| **2.3** Integration tests | 🔴 **WAITING** | 0% | 8h | - | - | Full Agent workflow testing |
| **2.4** Performance validation | 🔴 **WAITING** | 0% | 4h | - | - | 3x speed & 70% memory reduction validation |

**Phase 2 Overall Progress**: **0%** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ | **Total Estimated**: 22 hours | **Remaining**: 22h

#### Phase 2 Dependencies & Blockers
- 🔗 **Dependency**: Requires Phase 1 completion (100%)
- 🔗 **Dependency**: Task 2.1 must complete before 2.3
- ⚠️ **Risk**: Performance targets may require optimization iterations

---

### **Phase 3: Advanced Features** (Priority: MEDIUM)
**Status**: 🔴 **PLANNED** | **Target**: Future Release | **Starts After**: Phase 2

| Task | Status | Progress | Est. Time | Priority | Notes |
|------|--------|----------|-----------|----------|-------|
| **3.1** Tool dependency detection | 🔴 **PLANNED** | 0% | 12h | P2 | Smart dependency resolution |
| **3.2** Advanced concurrency controls | 🔴 **PLANNED** | 0% | 8h | P2 | Rate limiting, resource management |
| **3.3** Performance monitoring & metrics | 🔴 **PLANNED** | 0% | 6h | P3 | Real-time performance dashboard |
| **3.4** Auto-scaling runner pools | 🔴 **PLANNED** | 0% | 10h | P3 | Dynamic resource allocation |

**Phase 3 Overall Progress**: **0%** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ | **Total Estimated**: 36 hours | **Status**: Not started

---

## 📈 Progress Summary

| Phase | Status | Progress | Completion Date | Risk Level |
|-------|--------|----------|-----------------|------------|
| **Phase 1** | 🟡 Planning | 0% | TBD | 🟡 Medium |
| **Phase 2** | 🔴 Waiting | 0% | TBD | 🟡 Medium |
| **Phase 3** | 🔴 Planned | 0% | TBD | 🟢 Low |

**Overall Project Progress**: **0%** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜

### 🎯 Current Sprint Focus
- **Primary**: Phase 1 Type Definitions & Blueprint Updates
- **Secondary**: Tool.execute() routing implementation
- **Blocked**: Waiting for Phase 1 completion

### ⚡ Quick Actions Needed
1. 🔴 **URGENT**: Assign Phase 1 tasks to developers
2. 🟡 **HIGH**: Set up development environment for parallel tools testing
3. 🟡 **HIGH**: Create test data for parallel execution scenarios

### 📊 Key Metrics to Track
- **Performance**: Target 3x execution speed improvement
- **Memory**: Target 70% memory usage reduction  
- **Reliability**: Target 99.9% success rate for parallel executions
- **Compatibility**: 100% backward compatibility maintained

## Key Differences from Original Plan

| Aspect | Original Plan | Smart Tool Node Pattern |
|--------|--------------|------------------------|
| Blueprint Complexity | Complex template expressions | Simple static configuration |
| Tool Resolution | Each parallel execution searches | Pre-resolved once with Map |
| Progress Tracking | Manual counting (race conditions) | Atomic Set operations |
| Error Recovery | Basic error handling | Hierarchical with nodeError flag |
| Batch ID | Multiple Date.now() calls | Single generation, propagated |
| Memory Usage | Heavy blueprint instances | Lightweight contexts, pooling |
| Empty Tool Calls | Throws error | Returns empty result gracefully |
| Backward Compatibility | Complex migration | Clean dual-mode execution |

## Next Immediate Steps

1. ✅ Review and approve Smart Tool Node pattern
2. 🔴 Create type definitions in `types/parallel-tools.ts`
3. 🔴 Implement simplified Agent blueprint changes
4. 🔴 Implement complete Tool.ts with all methods
5. 🔴 Comprehensive testing

## Summary of Minor Refinements (Addressed)

### ✅ Missing Import Statements
**Solution**: Added complete import statements at the top of Tool.ts implementation, including all required types and runner classes.

### ✅ Tool Parameters Usage
**Solution**: Added intelligent detection of `universal_tool_executor` mode in the execute() method. The Tool node now checks its configuration and routes accordingly:
- If `name === 'universal_tool_executor'` → Use parallel execution mode
- Otherwise → Use legacy single tool execution for backward compatibility

### ✅ Edge Case: No Tool Calls
**Solution**: Changed error throwing to graceful handling:
- Empty tool calls array now returns an empty result with proper structure
- No errors thrown for legitimate empty cases
- Clean summary object with zero counts

### ✅ Backward Compatibility
**Solution**: Added `executeLegacyToolExecution()` method to handle existing single tool patterns, ensuring smooth migration path.

**📝 Last Updated**: 2024-01-30 | **👤 Updated By**: Development Team