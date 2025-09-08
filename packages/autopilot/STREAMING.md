# Streaming Integration Guide

This document explains how to use the streaming functionality that integrates the `@starships/autopilot` package with the server's `StreamingService` using Server-Sent Events (SSE).

## Overview

The streaming integration allows real-time communication between autopilot executions (LLM, Agent, Workflow) and the server's streaming infrastructure. This enables:

- **Real-time LLM responses** with token-by-token streaming
- **Live workflow execution updates** showing node progress
- **Agent thinking processes** exposed as streaming events
- **Error handling** with recoverable error streams

## Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client    │◄──►│ Server           │◄──►│ Autopilot       │
│             │    │ StreamingService │    │ StreamingAdapter│
└─────────────┘    └──────────────────┘    └─────────────────┘
                            │                        │
                            └──── SSE Events ────────┘
```

## Key Components

### 1. StreamingAdapter

The `StreamingAdapter` is the bridge between autopilot and the server's `StreamingService`.

```typescript
import { streamingAdapter } from '@starships/autopilot';

// Configure streaming
streamingAdapter.configure({
  enabled: true,
  streamId: 'unique-stream-id',
  conversationId: 'conversation-123',
  agentId: 'agent-456',
});
```

### 2. Streaming Types

#### AutopilotStreamChunk

```typescript
interface AutopilotStreamChunk {
  type: 'content' | 'thinking' | 'node_start' | 'node_complete' | 'error' | 'complete';
  content: string;
  metadata?: {
    nodeRef?: string;
    tokenCount?: number;
    model?: string;
    processingTimeMs?: number;
  };
}
```

#### StreamingOptions

```typescript
interface StreamingOptions {
  enabled: boolean;
  streamId?: string;
  conversationId?: string;
  agentId?: string;
}
```

## Usage Examples

### 1. LLM Streaming

```typescript
import { LLM, streamingAdapter, autopilot } from '@starships/autopilot';

// Configure API key
autopilot.setCredentials({
  openrouterApiKey: process.env.OPENROUTER_API_KEY,
});

// Configure streaming
streamingAdapter.configure({
  enabled: true,
  streamId: 'llm-stream-123',
  conversationId: 'conv-456',
  agentId: 'llm-agent',
});

// Create LLM with streaming enabled
const llm = new LLM({
  model: 'anthropic/claude-3-haiku',
  prompt: 'Explain quantum computing',
  stream: true, // Enable streaming
  maxTokens: 500,
});

// Add local streaming callback
streamingAdapter.onChunk((chunk) => {
  console.log('Streaming chunk:', chunk.type, chunk.content);
});

// Execute with streaming
const result = await llm.execute();
```

### 2. Agent Streaming

```typescript
import { Agent } from '@starships/autopilot';

const agent = new Agent({
  name: 'Streaming Agent',
  model: 'anthropic/claude-3-haiku',
  memory: {
    /* agent memory config */
  },
  blueprint: {
    /* agent blueprint */
  },
});

// Execute with streaming
const result = await agent.executeWithStreaming({
  enabled: true,
  streamId: 'agent-stream-789',
  conversationId: 'conv-456',
  agentId: 'streaming-agent',
});
```

### 3. Workflow Streaming

```typescript
import { Workflow } from '@starships/autopilot';

const workflow = new Workflow({
  blueprint: {
    /* workflow blueprint */
  },
});

// Execute with streaming
const result = await workflow.executeWithStreaming({
  enabled: true,
  streamId: 'workflow-stream-101',
  conversationId: 'conv-456',
});
```

## Server Integration

### Setting up StreamingService

In your server code:

```typescript
import { StreamingService } from '@/services/StreamingService';
import { streamingAdapter } from '@starships/autopilot';

// Create streaming service instance
const streamingService = new StreamingService();

// Configure autopilot to use server's streaming service
streamingAdapter.setStreamingService(streamingService);
```

### Handling Streaming Requests

```typescript
// In your conversation route (e.g., POST /conversations/:id/messages)
router.post('/conversations/:conversationId/messages', async (req, res) => {
  const { conversationId } = req.params;
  const { agentId, message, stream = false } = req.body;

  if (stream) {
    // Generate unique stream ID
    const streamId = StreamingService.generateStreamId();

    // Set up SSE connection
    streamingService.addConnection(streamId, res);

    // Configure autopilot streaming
    streamingAdapter.configure({
      enabled: true,
      streamId,
      conversationId,
      agentId,
    });

    // Execute agent with streaming
    const agent = await getAgent(agentId);
    const result = await agent.executeWithStreaming({
      enabled: true,
      streamId,
      conversationId,
      agentId,
    });
  } else {
    // Regular non-streaming execution
    // ... handle regular request
  }
});
```

## Stream Event Types

### Content Events

- **Type**: `content`
- **When**: LLM generates text tokens
- **Content**: The actual text being generated

### Thinking Events

- **Type**: `thinking`
- **When**: Agent is processing or planning
- **Content**: Description of what the agent is thinking

### Node Events

- **Type**: `node_start` / `node_complete`
- **When**: Workflow nodes start/complete execution
- **Content**: Node execution status
- **Metadata**: `nodeRef` with node reference

### Error Events

- **Type**: `error`
- **When**: Execution errors occur
- **Content**: Error message
- **Metadata**: Error details and recovery information

### Completion Events

- **Type**: `complete`
- **When**: Full execution completes
- **Content**: Completion message
- **Metadata**: Final execution results

## Error Handling

The streaming system handles errors gracefully:

```typescript
// Streaming adapter handles recoverable errors
await streamingAdapter.emitError({
  code: 'LLM_TIMEOUT',
  message: 'Request timed out',
  recoverable: true,
  context: { model: 'claude-3-haiku' },
});
```

Errors are automatically broadcast to connected clients and logged appropriately.

## Performance Considerations

1. **Connection Management**: The StreamingService automatically manages connection lifecycle
2. **Heartbeats**: Connections receive heartbeat events every 30 seconds
3. **Cleanup**: Inactive connections are automatically cleaned up
4. **Buffering**: Use `X-Accel-Buffering: no` header to disable nginx buffering

## Debugging

Enable debug logging:

```typescript
// The streaming adapter logs all events to console
streamingAdapter.getStatus(); // Get current streaming status
```

## Client-Side Integration

On the client side, connect to the SSE stream:

```typescript
const eventSource = new EventSource(`/api/conversations/${conversationId}/stream/${streamId}`);

eventSource.addEventListener('chunk', (event) => {
  const chunk = JSON.parse(event.data);
  console.log('Received chunk:', chunk);
});

eventSource.addEventListener('complete', (event) => {
  const result = JSON.parse(event.data);
  console.log('Execution completed:', result);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  const error = JSON.parse(event.data);
  console.error('Stream error:', error);
});
```

## Migration Guide

If you're upgrading from non-streaming to streaming:

1. **Add streaming parameters** to your execution calls
2. **Configure StreamingService** in your server setup
3. **Update client code** to handle SSE events
4. **Test thoroughly** with different execution scenarios

## Troubleshooting

### Common Issues

1. **"streamingAdapter is not defined"**
   - Ensure you're importing from the correct path: `import { streamingAdapter } from '@starships/autopilot'`

2. **"No streaming events received"**
   - Check that `streamingOptions.enabled = true`
   - Verify StreamingService is configured properly
   - Ensure stream IDs match between client and server

3. **"Connection drops immediately"**
   - Check SSE headers are set correctly
   - Verify nginx configuration if using reverse proxy
   - Check for firewall/network issues

### Debug Checklist

- [ ] StreamingService is instantiated and configured
- [ ] streamingAdapter.configure() called with correct parameters
- [ ] Stream ID is unique and properly generated
- [ ] SSE connection established successfully
- [ ] Event listeners are properly attached
- [ ] Error handling is implemented

For additional support, check the integration example in `src/streaming/integration-example.ts`.
