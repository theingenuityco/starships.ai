# Delta Encoder - RFC6902 JSON Patch Streaming

This document explains the Delta Encoder implementation that uses RFC6902 JSON Patch for incremental streaming updates in starships.ai.

## Overview

The Delta Encoder replaces the previous rudimentary chunking logic with a sophisticated RFC6902 JSON Patch system. Instead of streaming individual content chunks, the system now builds complete message arrays incrementally using JSON patches.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Autopilot     │    │ AutopilotStream │    │   Streaming     │
│   Engine        │───▶│    Service      │───▶│    Service      │
│                 │    │                 │    │                 │
│ ExecutionEvents │    │  DeltaEncoder   │    │ Broadcast Patch │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ JSON Patch Ops  │
                       │ RFC6902 Format  │
                       └─────────────────┘
```

## Key Components

### 1. DeltaEncoder (`/packages/server/src/utils/DeltaEncoder.ts`)

Generic utility class for applying RFC6902 JSON Patch operations:

```typescript
// Basic usage
const encoder = new DeltaEncoder<MessageModel[]>([]);

// Add new message
const result = encoder.add('/0', newMessage);
// result.patch: [{ op: 'add', path: '/0', value: newMessage }]
// result.state: [newMessage]
// result.version: 1

// Update existing message content
const contentUpdate = encoder.replace('/0/content', updatedContent);
// Generates patch for incremental update
```

**Specialized Classes:**

- `ArrayDeltaEncoder<T>`: Optimized for array operations
- `ObjectDeltaEncoder<T>`: Optimized for object operations

### 2. AutopilotStreamService (`/packages/server/src/services/AutopilotStreamService.ts`)

Updated to use delta encoding for all streaming events:

- **Content Streaming**: Builds assistant messages incrementally
- **Event Messages**: Adds system messages via patches
- **State Management**: Maintains complete message array state
- **Version Control**: Tracks patch versions for synchronization

### 3. StreamingChunk Protocol (`/packages/protocol/src/contracts/streaming.ts`)

Extended to support JSON patches:

```typescript
interface StreamingChunk {
  // ... existing fields
  type: 'content' | 'thinking' | 'node_start' | 'node_complete' | 'error' | 'complete' | 'patch';

  // New JSON Patch support
  patch?: JsonPatchOperation[];
  version?: number;
}

interface DeltaStreamingChunk {
  type: 'patch';
  patch: JsonPatchOperation[];
  version: number;
  content: ''; // Empty for patch operations
}
```

### 4. Client-Side JSON Patch (`/packages/client/src/lib/jsonPatch.ts`)

Client utility for applying patches received from the server:

```typescript
import { safeApplyPatch } from '@/lib/jsonPatch';

// Apply patch safely with error handling
const result = safeApplyPatch(currentMessages, patch);
if (result.success) {
  setMessages(result.result);
}
```

### 5. Updated useConversations Hook (`/packages/client/src/hooks/useConversations.ts`)

Now handles both legacy content chunks and new patch events:

```typescript
// Handle patch events
if (data.type === 'patch' && data.patch) {
  const patchResult = safeApplyPatch(old.messages, data.patch);
  if (patchResult.success) {
    return { ...old, messages: patchResult.result };
  }
}

// Legacy content chunks still supported
if (data.type === 'content') {
  // ... existing logic
}
```

## Benefits

### ✅ **True Delta Streaming**

- **Content chunks sent as deltas, not accumulated values**
- Server tracks position and sends only new content chunks
- Client builds content incrementally from individual deltas
- Dramatically reduces bandwidth usage for long responses

### ✅ **Unified Response Format**

- `/api/v1/conversations/xxx/messages` always returns the same structure
- Streaming and non-streaming responses are identical
- No special handling needed for different response types

### ✅ **Incremental Building**

- Complete message arrays built piece by piece
- Supports complex message structures
- Real-time updates to any message field
- Content chunks accumulated client-side for optimal performance

### ✅ **Backward Compatibility**

- Legacy content chunk streaming still works
- Gradual migration path available
- No breaking changes for existing clients

### ✅ **State Synchronization**

- Version tracking prevents race conditions
- Client and server state always in sync
- Patch ordering guaranteed

### ✅ **Performance Optimized**

- **Only sends deltas, not full accumulated state**
- **Each content chunk sent once with position metadata**
- Efficient for large conversation histories
- **Significant bandwidth reduction for streaming responses**

## Usage Examples

### Server-Side Streaming

```typescript
// In ConversationService - Delta Content Streaming
case 'content_chunk': {
  const content = String(chunkContent.choices[0].delta.content);

  // Track accumulated content server-side for completion
  const currentContent = this.streamingContent.get(conversationId) || '';
  const currentLength = currentContent.length;
  const newContent = currentContent + content;
  this.streamingContent.set(conversationId, newContent);

  // Send ONLY the delta chunk with position metadata
  const delta: Operation = {
    op: 'add',
    path: '/messages/-1/chunks/-',
    value: {
      content: content,        // ✅ Only the new chunk
      position: currentLength, // ✅ Position for ordering
      timestamp: Date.now(),   // ✅ Timing info
    },
  };
  await this.streamingService.broadcastDelta(conversationId, delta);
}

// Initialize streaming message with chunks array
const delta: Operation = {
  op: 'add',
  path: '/messages/-',
  value: { ...assistantMessage, streaming: true, chunks: [] },
};
```

**Key Improvement**: Instead of sending accumulated content (`"Hello" → "Hello world" → "Hello world!"`), we send individual chunks (`"Hello" → " world" → "!"`) with position metadata.

### Client-Side Consumption

```typescript
// In useConversations hook - Content chunk accumulation
const processChunk = (data: any) => {
  const processedMessages = data.messages.map((message: ClientMessage) => {
    // If message has chunks, build the streamed content
    if (message.chunks && Array.isArray(message.chunks)) {
      // Sort chunks by position to ensure correct order
      const sortedChunks = [...message.chunks].sort((a, b) => a.position - b.position);

      // Build content from individual delta chunks
      let streamedContent = '';
      for (const chunk of sortedChunks) {
        streamedContent += chunk.content; // ✅ Accumulate deltas client-side
      }

      return {
        ...message,
        content: message.streaming ? streamedContent : message.content,
        streamedContent: streamedContent,
      };
    }
    return message;
  });
  return { ...data, messages: processedMessages };
};

// In MessageContent component - Display delta-built content
const displayContent = useMemo(() => {
  if (!isStreaming || !chunks.length) return content;

  // Build from sorted delta chunks
  const sortedChunks = [...chunks].sort((a, b) => a.position - b.position);
  return sortedChunks.reduce((acc, chunk) => acc + chunk.content, '');
}, [content, chunks, isStreaming]);
```

**Key Improvement**: Client efficiently accumulates individual content deltas, eliminating redundant data transmission.

## Migration Guide

### For Existing Implementations

1. **Server-Side**: AutopilotStreamService automatically uses delta encoding
2. **Client-Side**: useConversations hook handles both formats
3. **Protocol**: StreamingChunk extended, backward compatible

### For New Implementations

1. Use `ArrayDeltaEncoder` for message arrays
2. Use `ObjectDeltaEncoder` for single objects
3. Always broadcast patches via streaming service
4. Handle patch events on client-side

## RFC6902 Operations Supported

- ✅ **add**: Add new array items or object properties
- ✅ **remove**: Remove array items or object properties
- ✅ **replace**: Update existing values
- ✅ **move**: Move values between paths
- ✅ **copy**: Copy values between paths
- ✅ **test**: Validate values before operations

## Error Handling

### Server-Side

- Patch generation is atomic
- State rollback on failures
- Version consistency maintained

### Client-Side

- `safeApplyPatch` with error recovery
- Validation before applying patches
- Fallback to previous state on errors

## Performance Considerations

### Memory Usage

- Each encoder instance maintains one state copy
- Patches are lightweight JSON operations
- No state accumulation over time

### Network Efficiency

- Only sends changed data
- Batch multiple operations in single patch
- Compressible JSON patch format

### Processing Speed

- O(1) for most patch operations
- O(n) only for array shifts/insertions
- Client-side patching is synchronous

## Debugging

Enable detailed logging:

```typescript
// Server-side
console.log('[STREAMING] Patch generated:', result.patch);

// Client-side
console.log('[STREAMING] Received patch:', data.patch);
console.log('[STREAMING] Applied result:', patchResult);
```

## Future Enhancements

- **Patch Compression**: Gzip patches for large updates
- **Batch Operations**: Group related patches together
- **Conflict Resolution**: Handle concurrent updates
- **Undo/Redo**: Reverse patch operations
- **Persistent Patches**: Store patches for replay

## Related Documentation

- [AutopilotStreamService API](../services/AutopilotStreamService.ts)
- [Streaming Protocol](../../../protocol/src/contracts/streaming.ts)
- [Client JSON Patch Utility](../../../client/src/lib/jsonPatch.ts)
- [RFC6902 JSON Patch Specification](https://tools.ietf.org/html/rfc6902)
