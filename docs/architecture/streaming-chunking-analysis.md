# Streaming & Chunking Architecture Analysis

## Overview

This document analyzes how messages and chunks are streamed through the system, from Autopilot LLM nodes through the Conversation Service to the client.

## Architecture Flow

### 1. Autopilot LLM Node (`packages/autopilot/src/nodes/LLM.ts`)

The LLM node processes streaming responses from OpenAI-compatible providers:

- **Stream Processing**: Uses `processOpenAIStream()` to iterate over chunks from the provider
- **Content Accumulation**: 
  - Accumulates `content` incrementally from `choice.delta.content`
  - Accumulates `reasoning` using `computeNonOverlappingAppend()` to handle overlapping chunks
  - Accumulates `toolCalls` with safe JSON parsing boundaries
- **Event Emission**: Emits `content_chunk` events via `eventCallback` for each chunk received
- **Normalization**: Normalizes chunks (e.g., `tool_calls` → `toolCalls`) before emitting

**Key Code** (lines 518-738):
```typescript
for await (const chunk of stream) {
  // Accumulate content
  if (choice.delta?.content) {
    content += piece;
  }
  
  // Emit chunk event
  await eventCallback({
    type: 'content_chunk',
    data: { chunk: normalizedChunk }
  });
}
```

### 2. Conversation Service (`packages/server/src/services/ConversationService.ts`)

The Conversation Service receives Autopilot events and manages streaming state:

#### State Management

**Per-Conversation State Maps:**
- `streamingContent`: Accumulated content string
- `nextChunkPosition`: Atomic position counter for chunks (prevents race conditions)
- `chunkProcessingLock`: Promise chain to serialize chunk processing
- `streamingToolCalls`: Accumulated tool calls during streaming
- `streamingReasoning`: Accumulated reasoning text
- `ringBuffer`: Recent chunks for resume/replay (max 200)
- `generationId`: Unique ID for each generation turn

#### Chunk Processing Flow (`content_chunk` event handler, lines 1375-1836)

1. **Serialization**: Uses promise chaining to serialize chunk processing:
   ```typescript
   const previousLock = this.chunkProcessingLock.get(conversationId) || Promise.resolve();
   const currentLock = previousLock.then(() => processThisChunk());
   this.chunkProcessingLock.set(conversationId, currentLock);
   ```

2. **Placeholder Creation**: Creates assistant message placeholder on first chunk:
   - Emits `/messages/-` delta operation
   - Initializes `streamingContent`, `nextChunkPosition = 0`
   - Sets `streaming: true` flag

3. **Content Processing** (lines 1594-1669):
   - Extracts content from `delta.content` (incremental) or `message.content` (snapshot)
   - Uses `computeNonOverlappingAppend()` to handle overlapping chunks
   - **Position Calculation**: Atomically reads and increments position:
     ```typescript
     const chunkPosition = this.nextChunkPosition.get(conversationId) || 0;
     this.nextChunkPosition.set(conversationId, chunkPosition + normalized.length);
     ```
   - Updates `streamingContent` accumulator
   - Adds to ring buffer for resume support
   - Broadcasts delta: `{ op: 'add', path: '/messages/-1/chunks/-', value: { content, position, timestamp } }`

4. **Reasoning Processing** (lines 1672-1706):
   - Similar to content, but streams to `reasoningChunks` array
   - Uses separate accumulator `streamingReasoning`

5. **Tool Calls Processing** (lines 1708-1821):
   - Accumulates tool call arguments as strings
   - Uses `parsePartialJSONObject()` for incremental parsing
   - Broadcasts replace operation: `{ op: 'replace', path: '/messages/-1/toolCalls', value: [...] }`

#### Non-Overlapping Append Logic (lines 110-120)

Critical for handling providers that send overlapping chunks:
```typescript
private static computeNonOverlappingAppend(base: string, fragment: string): string {
  if (!fragment) return '';
  const maxCheck = Math.min(base.length, fragment.length);
  for (let k = maxCheck; k > 0; k--) {
    if (base.endsWith(fragment.slice(0, k))) {
      return fragment.slice(k); // Return only new portion
    }
  }
  return fragment; // No overlap
}
```

### 3. Streaming Service (`packages/server/src/services/StreamingService.ts`)

Manages SSE connections and delta normalization:

#### Connection Management
- Supports multiple concurrent connections per conversation
- Tracks per-connection state: `baseLength`, `runningAdds`, `placeholderStack`
- Maintains event buffer (max 300 events) for replay on reconnection

#### Delta Normalization (lines 270-335)

Converts logical paths to concrete numeric indexes:
- `/messages/-` → `/messages/{baseLength + runningAdds}`
- `/messages/-1` → `/messages/{topPlaceholderIndex}`
- Tracks placeholder stack to handle nested/overlapping placeholders

#### Event Broadcasting
- Buffers logical events before normalization
- Normalizes per-connection before sending
- Supports replay via `replayBufferedEvents()` and `replayCurrentTurn()`

### 4. Client-Side Processing (`packages/client/src/hooks/useConversations.ts`)

#### SSE Connection (`makeSSEAsyncIterable`, lines 399-648)

- Establishes SSE connection with `baselineLength` query param
- Parses incoming events:
  - `message`: Complete message append
  - `delta`: JSON Patch operations
  - `resume_token`: Resume hints
  - `turn_started`/`turn_completed`: Turn lifecycle

#### Delta Parsing (lines 480-612)

Handles various delta operations:
- `add /messages/-1/chunks/-`: Content chunk append
- `add /messages/-1/reasoningChunks/-`: Reasoning chunk append
- `replace /messages/-1/toolCalls`: Tool calls update
- `replace /messages/-1/content`: Final content replacement
- `replace /messages/-1/streaming`: Streaming flag update

#### Message Reduction (`reduceMessages`, lines 651-801)

Folds streamed chunks into message array:
- `append_chunk`: Adds chunk to `chunks` or `reasoningChunks` array
  - Calculates position if not provided: `chunks[last].position + content.length`
  - Maintains `streaming: true` flag
- `replace_content`: Replaces final content, clears chunks
- `replace_tool_calls`: Updates tool calls array
- `mark_last_assistant_streaming`: Sets `streaming: false`

**Key Logic** (lines 716-719):
```typescript
const nextPosition = typeof chunk.position === 'number' 
  ? chunk.position 
  : chunks.length > 0 
    ? chunks[chunks.length - 1].position + chunk.content.length 
    : 0;
```

## Critical Race Condition Fixes

### 1. Atomic Position Tracking

**Problem**: Concurrent chunks could read the same position, causing duplicates.

**Solution**: Atomic read-increment in one line:
```typescript
const chunkPosition = this.nextChunkPosition.get(conversationId) || 0;
this.nextChunkPosition.set(conversationId, chunkPosition + normalized.length);
```

### 2. Chunk Processing Serialization

**Problem**: Parallel `content_chunk` events could process out of order.

**Solution**: Promise chain per conversation:
```typescript
const previousLock = this.chunkProcessingLock.get(conversationId) || Promise.resolve();
const currentLock = previousLock.then(() => processThisChunk());
this.chunkProcessingLock.set(conversationId, currentLock);
await currentLock;
```

## Data Structures

### Chunk Format
```typescript
{
  content: string;        // The text content
  position: number;       // Byte offset in final message
  timestamp: number;      // When chunk was received
}
```

### Message Structure (Streaming)
```typescript
{
  id: string;
  role: 'assistant';
  content: string;              // Final content (when complete)
  chunks?: Array<Chunk>;        // Streaming chunks (during streaming)
  reasoningChunks?: Array<Chunk>; // Reasoning chunks
  toolCalls?: Array<ToolCall>;
  streaming: boolean;           // true during streaming
}
```

## Resume/Replay Mechanism

1. **Ring Buffer**: Stores last 200 chunks per conversation
2. **Resume Tokens**: Signed JWT with generation ID and position
3. **Event Replay**: On reconnection, replays buffered events after last `complete`
4. **Baseline Length**: Client sends `baselineLength` to server for proper index calculation

## Potential Issues & Observations

### 1. Position Calculation Mismatch

**Server** (ConversationService.ts:1619-1620):
- Uses atomic counter: `nextChunkPosition`
- Position = cumulative byte offset from start

**Client** (useConversations.ts:717):
- Falls back to: `chunks[last].position + chunk.content.length`
- This could diverge if chunks arrive out of order or are replayed

**Recommendation**: Always trust server-provided `position`; fallback should only be used for initial chunk.

### 2. Chunk Deduplication

The `computeNonOverlappingAppend()` handles overlapping chunks, but:
- Only checks suffix/prefix overlap
- Doesn't handle duplicate identical chunks
- Could append same chunk twice if provider sends exact duplicates

### 3. Reasoning Chunk Position

Reasoning chunks use `currentRLength` (line 1678) instead of a separate position counter:
```typescript
position: currentRLength,  // Uses accumulated length, not atomic counter
```
This is less robust than content chunk position tracking.

### 4. Client-Side Position Fallback

Client calculates position if missing (line 717), but this assumes:
- Chunks arrive in order
- No gaps in positions
- Previous chunk exists

This could cause issues on reconnection or out-of-order delivery.

## Recommendations

1. **Always Include Position**: Server should always include `position` in chunk deltas
2. **Separate Reasoning Position Counter**: Use atomic counter for reasoning chunks like content
3. **Chunk Deduplication**: Add ID-based deduplication for chunks
4. **Position Validation**: Client should validate position monotonicity and log warnings
5. **Resume Token Position**: Include chunk position in resume tokens for precise resume

