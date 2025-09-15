# Streaming Integration - Web Worker Implementation

This document explains the client-side streaming implementation using Web Workers to prevent event loop blocking.

## Overview

The client implements real-time streaming for AI agent conversations using Server-Sent Events (SSE) processed in a Web Worker, ensuring the main thread remains completely responsive.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Main Thread (UI)                     │
├─────────────────────────────────────────────────────────┤
│  React Components                                        │
│  ├── ConversationInterface                              │
│  ├── ConversationMessageList                            │
│  └── ConversationMessageInput                           │
├─────────────────────────────────────────────────────────┤
│  useStreamingConversation Hook                          │
│  └── StreamingWorkerManager                             │
└─────────────────────────────────────────────────────────┘
                           │
                    PostMessage API
                           │
┌─────────────────────────────────────────────────────────┐
│                  Web Worker Thread                       │
├─────────────────────────────────────────────────────────┤
│  streaming.worker.js                                     │
│  ├── SSE Connection Management                           │
│  ├── Event Parsing & Buffering                          │
│  ├── Stream Processing                                   │
│  └── Error Handling                                      │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### Web Worker (`public/streaming.worker.js`)

**Responsibilities:**

- Handles all SSE connections in a separate thread
- Parses SSE events and buffers incomplete messages
- Communicates with main thread via postMessage
- Manages multiple concurrent streams

### StreamingWorkerManager (`src/lib/streaming-worker-manager.ts`)

**Responsibilities:**

- Creates and manages the Web Worker instance
- Provides clean API for starting/stopping streams
- Routes messages between React and Worker
- Implements singleton pattern for efficiency

### useStreamingConversation Hook (`src/hooks/useStreamingConversation.ts`)

**Responsibilities:**

- React interface for streaming operations
- Manages streaming state
- Updates TanStack Query cache with streamed data
- Handles conversation-specific logic

## How It Works

1. **User sends a message**: The UI component calls `sendMessageWithStreaming()`
2. **Worker starts streaming**: Request is sent to Web Worker which establishes SSE connection
3. **Worker processes events**: All SSE parsing happens in the worker thread
4. **Main thread updates UI**: Lightweight messages update React state
5. **UI remains responsive**: Main thread is never blocked

## Streaming Flow

```mermaid
sequenceDiagram
    participant User
    participant React as React (Main Thread)
    participant Manager as WorkerManager
    participant Worker as Web Worker
    participant Server as SSE Server

    User->>React: Send message
    React->>Manager: startStream()
    Manager->>Worker: postMessage(START_STREAM)
    Worker->>Server: Fetch SSE stream

    loop Streaming
        Server->>Worker: SSE events
        Worker->>Worker: Parse & buffer
        Worker->>Manager: postMessage(EVENT)
        Manager->>React: onEvent callback
        React->>User: Update UI
    end

    Server->>Worker: Stream complete
    Worker->>Manager: postMessage(COMPLETE)
    Manager->>React: onComplete callback
    React->>User: Show final message
```

## Benefits

1. **True Non-Blocking**: SSE processing in separate thread
2. **Smooth UI**: Main thread free for React rendering
3. **Better Performance**: No event loop blocking
4. **Scalable**: Handles multiple concurrent streams
5. **Error Isolation**: Worker crashes don't affect UI

## Usage

```typescript
// In your React component
const { sendMessageWithStreaming, isStreaming, streamingContent, stopStreaming } = useStreamingConversation(conversationId)

// Send a message with streaming
await sendMessageWithStreaming(message, {
  agentId: agent.id,
  conversationId: conversationId,
})

// Stop streaming if needed
stopStreaming()
```

## Testing

```bash
# Start development server
pnpm dev

# Test streaming
1. Open the conversation interface
2. Send a message to an AI agent
3. Observe real-time streaming without UI blocking
4. Try interacting with other UI elements while streaming
```

## Browser Support

- Modern browsers with Web Worker support (all major browsers)
- SSE support required (polyfilled if needed)
- Falls back gracefully if Workers unavailable

## Security

- JWT tokens included in SSE requests
- Worker runs in isolated context
- No direct DOM access from worker
- Proper error boundaries

---

This implementation ensures complete non-blocking streaming by offloading all SSE processing to a Web Worker thread.
