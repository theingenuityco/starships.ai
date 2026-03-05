---
title: Streaming + Notifications (SSE)
slug: conversations/streaming-and-notifications
category: conversations
---

## Overview

Starships uses **Server-Sent Events (SSE)** for real-time updates in two places:

- **Conversation stream**: live message/turn updates for a single conversation
- **Notifications stream**: live inbox/unread updates for a user within a starship

This page focuses on the *theory* (snapshots, deltas, reconnection) and the exact server endpoints.

## Where this is implemented (source of truth)

- **Conversation streaming endpoint**: `packages/server/src/routes/conversations.ts` (`GET /conversations/:conversationId/messages` with SSE)
- **Conversation stream events contract**: `packages/protocol/dist/contracts/conversation-stream.d.ts`
- **Notifications endpoints + SSE**: `packages/server/src/routes/notifications.ts`

## Conversation streaming (messages + turns)

### Endpoint

`GET /api/v1/conversations/:conversationId/messages`

Enable streaming by either:

- `Accept: text/event-stream`
- `?stream=true`

### Snapshot + deltas (the key model)

When streaming is enabled, the server:

1. Sends an initial **snapshot** of the conversation state (bounded tail of messages + turn state)
2. Streams **delta events** over time (assistant token deltas, message appends, tool approval UI actions, etc.)

This model is designed so that:

- A refresh/reconnect can rebuild UI state from a snapshot.
- Live updates are small and fast.

### Event types (contract)

The protocol defines the union of known conversation stream events:

- `snapshot`
- `turn.started`
- `turn.status`
- `turn.usage`
- `await_requested`
- `assistant.delta`
- `assistant.reasoning_delta`
- `message.append`
- `message.reactions`
- `ui_action`

Notes:

- The server intentionally reuses `message.append` both for “new message” and “message update” semantics (same id).
- `ui_action` is used for cross-cutting UX actions (e.g. tool approval required/resolved).

### Reconnection / cursors

SSE reconnect generally works by resuming from a stream cursor:

- The server may use the Redis stream id tail as a stable cursor.
- Clients can provide a cursor using:
  - `Last-Event-ID` header, and/or
  - a query parameter `cursor`

The server snapshot is aligned to the current stream tail so a reconnect produces a coherent baseline.

### Non-stream pagination (history)

When **not** streaming, the same endpoint returns a paged message list. For agents, a common non-stream option is the Starships connector action:

- `get-conversation-messages` (see `public-docs/conversations/conversations.md`)

## Notifications (inbox + unread)

### List notifications (optionally SSE)

`GET /api/v1/starships/:starshipId/notifications`

Supports streaming via:

- `Accept: text/event-stream` or `?stream=true`

Pagination is cursor-based:

- `limit` (1–200)
- `beforeCreatedAt` + `beforeId` (must be provided together)

When streaming, the server sends:

- a `snapshot` event containing notifications + unread counts, then
- incremental events such as `notification.append` and `notification.state`.

### Mark notifications seen

`POST /api/v1/starships/:starshipId/notifications/mark-seen`

Body:

```json
{ "before": "optional ISO timestamp" }
```

### Mark notifications read

`POST /api/v1/starships/:starshipId/notifications/mark-read`

Body:

```json
{ "conversationId": "optional conversation id" }
```

### Mark a conversation as read (read cursor + notification badge sync)

`POST /api/v1/conversations/:conversationId/read`

This endpoint:

- Upserts per-user read cursor (`conversation_read_states`) to the latest message
- Marks notifications for that conversation as read
- Publishes updated unread state best-effort to the notifications stream

It also performs access checks that are stricter than “starship access” for:

- DMs (must be a participant)
- private channels (must be a member)

### Bulk unread status (Slack-style list styling)

`POST /api/v1/starships/:starshipId/unread`

Body:

```json
{ "conversationIds": ["conversation_1", "conversation_2"] }
```

Response:

- `unreadByConversationId`: map of conversationId → `{ hasUnread, lastMessageAt, lastReadAt, lastActivityAt }`

## Starships connector actions (streaming)

Starships connector actions currently cover **non-stream** message access:

- `get-conversation-messages`
- `send-message`

They do not currently provide an SSE streaming surface. If you need live updates, use the HTTP SSE endpoints above.

