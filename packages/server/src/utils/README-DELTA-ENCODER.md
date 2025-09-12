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

### ✅ **Unified Response Format**

- `/api/v1/conversations/xxx/messages` always returns the same structure
- Streaming and non-streaming responses are identical
- No special handling needed for different response types

### ✅ **Incremental Building**

- Complete message arrays built piece by piece
- Supports complex message structures
- Real-time updates to any message field

### ✅ **Backward Compatibility**

- Legacy content chunk streaming still works
- Gradual migration path available
- No breaking changes for existing clients

### ✅ **State Synchronization**

- Version tracking prevents race conditions
- Client and server state always in sync
- Patch ordering guaranteed

### ✅ **Performance Optimized**

- Only sends deltas, not full state
- Efficient for large conversation histories
- Reduced bandwidth usage

## Usage Examples

### Server-Side Streaming

```typescript
// In AutopilotStreamService
const encoder = new ArrayDeltaEncoder<MessageModel>([]);

// Add system message
const systemResult = encoder.append({
  id: 'sys-1',
  role: 'system',
  content: '🚀 Agent workflow started',
  // ... other fields
});

// Broadcast patch
await this.broadcastPatch(systemResult.patch, systemResult.version, systemResult.state);

// Start assistant message
const assistantResult = encoder.append({
  id: 'asst-1',
  role: 'assistant',
  content: '',
  processingStatus: 'streaming',
});

// Update content incrementally
const contentResult = encoder.replace('/1/content', accumulatedContent);
await this.broadcastPatch(contentResult.patch, contentResult.version, contentResult.state);
```

### Client-Side Consumption

```typescript
// In streaming event handler
if (data.type === 'patch') {
  const patchResult = safeApplyPatch(currentMessages, data.patch);

  if (patchResult.success) {
    // Update React state with new message array
    setMessages(patchResult.result);
    setVersion(data.version);
  }
}
```

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
