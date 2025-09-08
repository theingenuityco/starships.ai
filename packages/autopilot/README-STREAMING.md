# Streaming Integration - Lean Architecture

This document explains the new lean streaming architecture for `@starships/autopilot`.

## Overview

The autopilot package now provides a **minimal streaming interface** that allows external systems (like servers) to handle streaming conversion and broadcasting, while autopilot focuses purely on workflow execution.

## Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client    │◄──►│ Server           │    │ Autopilot       │
│             │    │ StreamingService │    │ (lean)          │
└─────────────┘    │ StreamingEmitter │◄──►│ Engine          │
                   └──────────────────┘    └─────────────────┘
                            │
                   ┌────────┴────────┐
                   │   Converts      │
                   │ ExecutionEvents │
                   │ to StreamChunks │
                   └─────────────────┘
```

## Key Components

### 1. StreamingEmitter Interface (Autopilot)

```typescript
// packages/autopilot/src/types/streamingEmitter.ts
interface StreamingEmitter {
  emitExecutionEvent(event: ExecutionEvent): Promise<void>;
  isEnabled(): boolean;
}
```

### 2. Engine with Injection Support

```typescript
// Engine now supports external streaming emitters
const engine = new Engine();
engine.setStreamingEmitter(serverStreamingEmitter);
```

### 3. Server Implementation

```typescript
// packages/server/src/services/AutopilotStreamingEmitter.ts
export class AutopilotStreamingEmitter implements StreamingEmitter {
  // Converts ExecutionEvents to server streaming format
  // Handles all streaming-specific logic
}
```

## Usage

### In Server Code

```typescript
import { AutopilotStreamingEmitter } from '@/services/AutopilotStreamingEmitter';
import { StreamingService } from '@/services/StreamingService';

// Create streaming emitter
const streamingEmitter = new AutopilotStreamingEmitter(streamingService, streamId, conversationId, agentId);

// Inject into agent's engine
const agent = await AgentService.getAgent(agentId);
agent.getEngine().setStreamingEmitter(streamingEmitter);

// Execute normally - streaming happens automatically
const result = await agent.execute(execution, eventCallback);
```

## Benefits

### ✅ **Lean Autopilot Package**

- **~764 lines removed** from autopilot
- No streaming-specific dependencies
- Focused on core workflow execution

### ✅ **Server Controls Streaming**

- Multiple streaming formats (SSE, WebSocket, GraphQL)
- Custom conversion logic per client needs
- Rate limiting and connection management

### ✅ **Zero Performance Impact**

- Direct injection - no additional latency
- Real-time event conversion
- Same execution performance

### ✅ **Clean Separation**

- Autopilot: Pure workflow execution
- Server: Presentation and streaming concerns
- Clear package boundaries

## Migration from Old Architecture

### Before (Built-in Streaming)

```typescript
// Old: autopilot had streaming built-in
import { streamingAdapter } from '@starships/autopilot';

streamingAdapter.configure({
  enabled: true,
  streamId: 'stream-123',
});
```

### After (Injection-based)

```typescript
// New: server injects streaming capability
import { StreamingEmitter } from '@starships/autopilot';

const streamingEmitter = new AutopilotStreamingEmitter(/*...*/);
agent.getEngine().setStreamingEmitter(streamingEmitter);
```

## Event Flow

1. **Engine emits ExecutionEvent** (`workflow_started`, `node_completed`, etc.)
2. **StreamingEmitter receives event** via `emitExecutionEvent()`
3. **Server converts to streaming format** (SSE chunks, WebSocket messages)
4. **StreamingService broadcasts** to connected clients
5. **Client receives real-time updates**

## Supported Event Types

- `workflow_started` → `node_start` chunk
- `node_started` → `node_start` chunk
- `node_completed` → `node_complete` chunk
- `node_failed` → `error` chunk
- `workflow_completed` → `complete` chunk
- `workflow_failed` → `error` broadcast
- `workflow_paused` → `thinking` chunk
- `workflow_resumed` → `thinking` chunk

## No Feature Loss

- **✅ Real-time streaming** - Same performance
- **✅ Token-by-token LLM streaming** - Preserved
- **✅ Node execution updates** - Real-time
- **✅ Error handling** - Comprehensive
- **✅ Metadata context** - Full preservation

The new architecture maintains all streaming capabilities while dramatically simplifying the autopilot package and giving servers full control over streaming behavior.
