# Parallel Tool Execution - Native JS Implementation Plan (Final)

## Executive Summary

This document outlines the implementation plan for parallel tool execution in the Starships.ai autopilot system. After thorough analysis, we've determined that:
1. **Tool nodes CAN correctly find their own arguments** from shared tool_calls
2. **No mock data hack is needed** - we misunderstood the Tool node's capabilities
3. **Native JS still provides significant benefits** over JSONata for cleaner implementation

## Corrected Understanding

### What We Initially Thought (WRONG ❌)
- Tool nodes couldn't differentiate between multiple tool_calls
- We needed to create mock LLM results for each tool
- This was a "hacky" workaround

### What Actually Happens (CORRECT ✅)
```javascript
// Tool node's getArgsFromExecutionContext DOES filter correctly:
const match = toolCalls.find((tc) => tc?.function?.name === toolName);
// Each tool finds its OWN arguments by name!
```

When multiple tools execute:
- Calculator tool searches for `name === "calculator"` → finds its arguments
- Time tool searches for `name === "get_current_time"` → finds its arguments
- Each tool correctly extracts only what it needs

## Why We're Still Waiting for Native JS

While mock data isn't needed, Native JS still provides major improvements:

### 1. JSONata Template Complexity
**Current JSONata Approach:**
```javascript
// Complex template string that needs parsing
const toolCallsPath = '{{ $lastOutputOf("llm")[0].json.choices[0].message.tool_calls }}';
const toolCalls = await this.eval.resolveTemplates(toolCallsPath, execution, input);
```

**Native JS Approach:**
```javascript
// Direct, readable access
const toolCalls = context.getToolCalls();
```

### 2. Conditional Logic Complexity
**Current JSONata:**
```javascript
condition: '{{ $count($lastOutputOf("llm")[0].json.choices[0].message.tool_calls) > 1 ? "true" : "false" }}'
// Hard to read, debug, and maintain
```

**Native JS:**
```javascript
condition: (context) => context.getToolCalls().length > 1 ? 'parallel' : 'single'
// Clear, type-safe, debuggable
```

### 3. Better Architecture Options
With Native JS, we can choose between:

**Option A: Multiple Tool Instances (Simple)**
```javascript
class Parallel extends BaseNode {
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Direct access to tool_calls
    const toolCalls = this.context.getToolCalls();
    
    // Create Tool instances - they'll find their own args
    const results = await Promise.all(
      toolCalls.map(tc => {
        const tool = new Tool(
          { name: tc.function.name },
          { execution: this.options.execution }
        );
        return tool.execute(input);
      })
    );
    
    return this.formatResults(results);
  }
}
```

**Option B: Shared ToolExecutor (Cleaner)**
```javascript
class Parallel extends BaseNode {
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const toolCalls = this.context.getToolCalls();
    
    // Direct execution without Tool node overhead
    const results = await Promise.all(
      toolCalls.map(tc => 
        this.toolExecutor.execute(
          tc.function.name,
          JSON.parse(tc.function.arguments),
          tc.id
        )
      )
    );
    
    return this.formatResults(results);
  }
}
```

## Implementation Plan

### Phase 0: Prerequisites (WAITING)
- [ ] Native JS implementation completed by colleague
- [ ] JSONata removal from codebase
- [ ] New execution context API available

### Phase 1: Parallel Node Implementation (2 days)
```typescript
// packages/autopilot/src/nodes/Parallel.ts
import { BaseNode } from './BaseNode';
import { Tool } from './Tool';
import { ParallelParams } from '@/types/node-parameters';
import { ExecutionItem, ValidationResult } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Parallel extends BaseNode<ParallelParams> {
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    try {
      // 1. Extract tool_calls with Native JS
      const context = this.options.context;
      const toolCalls = context.getToolCalls();
      
      if (!toolCalls || toolCalls.length === 0) {
        throw new Error('No tool calls found for parallel execution');
      }
      
      // 2. Execute tools in parallel
      const toolPromises = toolCalls.map(async (toolCall) => {
        const startTime = Date.now();
        
        try {
          // Create Tool instance with current execution context
          const tool = new Tool(
            { name: toolCall.function.name },
            { 
              execution: this.options.execution,
              eventCallback: this.options.eventCallback
            }
          );
          
          // Tool will find its own arguments via getArgsFromExecutionContext
          const result = await tool.execute(input);
          
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            result: result[0]?.json,
            executionTime: Date.now() - startTime,
            status: 'success'
          };
        } catch (error) {
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            error: error.message,
            status: 'failed'
          };
        }
      });
      
      // 3. Strategy-based execution
      const strategy = this.params.strategy || 'allSettled';
      let results;
      
      if (strategy === 'all') {
        results = await Promise.all(toolPromises);
      } else if (strategy === 'race') {
        const winner = await Promise.race(toolPromises);
        results = [winner];
      } else {
        const settled = await Promise.allSettled(toolPromises);
        results = settled.map(r => r.status === 'fulfilled' ? r.value : r.reason);
      }
      
      // 4. Format results for next node
      const output = {
        totalTools: toolCalls.length,
        successfulTools: results.filter(r => r.status === 'success').length,
        failedTools: results.filter(r => r.status === 'failed').length,
        results: results,
        tool_responses: results.map(r => ({
          tool_call_id: r.toolCallId,
          role: 'tool',
          name: r.toolName,
          content: r.status === 'success' ? 
            JSON.stringify(r.result) : 
            `Error: ${r.error}`
        }))
      };
      
      return ExecutionItemUtils.wrapSingle(output, input?.[0]);
    } catch (error) {
      this.handleExecutionError(error, 'Parallel node execution failed');
    }
  }
  
  validate(): ValidationResult {
    const errors = [];
    
    if (this.params.strategy && 
        !['all', 'allSettled', 'race'].includes(this.params.strategy)) {
      errors.push({
        field: 'strategy',
        message: 'Strategy must be one of: all, allSettled, race'
      });
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

### Phase 2: Conditional Node Integration (1 day)
```javascript
// Blueprint with Native JS conditions
{
  nodes: [
    {
      ref: "llm_with_tools",
      type: "llm",
      parameters: {
        model: "gpt-4",
        messages: (context) => context.state.messages,
        tools: [...],
        parallel_tool_calls: true  // OpenRouter supports this!
      }
    },
    {
      ref: "check_multiple_tools",
      type: "conditional",
      parameters: {
        // Clean Native JS condition
        condition: (context) => {
          const toolCalls = context.getToolCalls();
          if (!toolCalls || toolCalls.length === 0) return 'none';
          if (toolCalls.length === 1) return 'single';
          return 'parallel';
        }
      }
    },
    {
      ref: "parallel_execution",
      type: "parallel",
      parameters: {
        strategy: "allSettled"
      }
    },
    {
      ref: "single_tool",
      type: "tool",
      parameters: {
        name: (context) => context.getToolCalls()[0]?.function.name
      }
    }
  ],
  edges: [
    { from: "llm_with_tools", to: "check_multiple_tools" },
    { from: "check_multiple_tools", to: "parallel_execution", condition: "parallel" },
    { from: "check_multiple_tools", to: "single_tool", condition: "single" },
    { from: "check_multiple_tools", to: "end", condition: "none" }
  ]
}
```

### Phase 3: Testing (1-2 days)
- Unit tests for Parallel node
- Integration tests with real Tool nodes
- Performance benchmarking (parallel vs sequential)

## Key Benefits of This Approach

### 1. No Fake Data ✅
- Tool nodes correctly find their arguments
- No mock LLM results needed
- Clean execution flow

### 2. Native JS Advantages ✅
- **Readability**: Clear function calls vs JSONata strings
- **Debugging**: Standard JS debugging tools
- **Type Safety**: Full TypeScript support
- **Performance**: No template parsing overhead
- **LLM Friendly**: AI models generate better JavaScript

### 3. Flexibility ✅
- Can use existing Tool nodes (Option A)
- Or optimize with shared ToolExecutor (Option B)
- Easy to extend for custom tools

## Comparison: JSONata vs Native JS

### Tool Call Extraction
```javascript
// JSONata (current)
'{{ $lastOutputOf("llm")[0].json.choices[0].message.tool_calls }}'
// Complex, string-based, no IDE support

// Native JS (new)
context.getToolCalls()
// Simple, type-safe, with autocomplete
```

### Conditional Logic
```javascript
// JSONata (current)
'{{ $count($lastOutputOf("llm")[0].json.choices[0].message.tool_calls) > 1 ? "true" : "false" }}'
// Hard to read and debug

// Native JS (new)  
(context) => context.getToolCalls().length > 1
// Clear and debuggable
```

### Error Handling
```javascript
// JSONata (current)
// Template parsing errors are strings, hard to trace

// Native JS (new)
try {
  const toolCalls = context.getToolCalls();
} catch (error) {
  // Proper stack traces and error types
}
```

## Timeline

**Total: 4-5 days after Native JS is available**

1. **Day 1-2**: Implement Parallel node
2. **Day 3**: Integrate with Conditional node  
3. **Day 4-5**: Testing and optimization

## Success Criteria

- [ ] Multiple tools execute concurrently
- [ ] 60-75% latency reduction for multi-tool operations
- [ ] No JSONata template strings in implementation
- [ ] Full TypeScript type coverage
- [ ] Clean, maintainable code without workarounds

## Conclusion

While our initial analysis incorrectly identified a need for mock data, the investigation revealed that:
1. Tool nodes are smarter than we thought - they can find their own arguments
2. Native JS still provides significant benefits in code clarity and maintainability
3. The implementation is actually simpler than anticipated

By waiting for Native JS, we get:
- Cleaner, more maintainable code
- Better developer experience
- Type safety and proper debugging
- No JSONata complexity

The implementation will be straightforward: create a Parallel node that manages multiple Tool instances or uses a shared executor, with Native JS providing clean access to tool_calls without template parsing.