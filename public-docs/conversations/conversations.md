---
title: Conversations API & Connector Actions
slug: conversations/conversations
category: conversations
---

## What is a conversation?

A **conversation** is the core container for messages + agent turns.

Most user-facing “places you chat” in Starships are conversation-backed (channels, rooms, DMs, threads).

## Documentation map

- **Concepts (theory)**: `public-docs/conversations/concepts.md`
- **Streaming + notifications (SSE)**: `public-docs/conversations/streaming-and-notifications.md`
- **Messages (CRUD/reactions/linking)**: `public-docs/conversations/messages.md`
- **Threads (child conversations)**: `public-docs/conversations/threads.md`
- **Channels**: `public-docs/conversations/channels.md`
- **Rooms**: `public-docs/conversations/rooms.md`
- **Direct messages**: `public-docs/conversations/direct-messages.md`

## Where this is implemented (source of truth)

- **HTTP API**: `packages/server/src/routes/conversations.ts`
- **Streaming bus (SSE/Redis streams)**: `packages/server/src/services/ConversationStreamBus.ts`
- **Conversation membership enforcement**:
  - `packages/server/src/utils/conversation-membership.ts` (`enforcePrivateChannelMembership`, `enforceDirectMessageMembership`, `enforcePrivateRoomMembership`)
- **Starships connector action catalog (conversations subset)**:
  - `packages/models/src/migrations/052_expand_starships_connector_endpoints.ts` (`create-conversation`, `send-message`, `authorize-and-maybe-execute-tool`)
  - `packages/models/src/migrations/098_starships_connector_get_conversation_messages.ts` (`get-conversation-messages`)

## Mental model (important concepts)

- **conversationId**: the identifier used by most conversation APIs.
- **parentConversationId**: when set, the conversation is a **child conversation** (thread) under a parent.
- **Top-level conversation constraint**: external callers cannot create arbitrary top-level conversations; they must be created as a **channel** or **DM** (rooms have their own API).
- **Turns**: sending a message may create an agent turn; turns can stream deltas and can end in `waiting_for_tools` during tool approval flows.

## HTTP API (server)

All endpoints below are under `/api/v1` and require auth (`jwtAuthMiddleware`) unless noted.

### Get conversation by id

`GET /api/v1/conversations/:conversationId`

- Enforces starship access.
- Enforces membership for restricted conversations (private channels, DMs).

### Get agents linked to a conversation

`GET /api/v1/conversations/:conversationId/agents`

Returns agents linked to the conversation (used as a lightweight alternative to fetching the full message history).

### List conversations for a starship

`GET /api/v1/starships/:starshipId/conversations`

Notes:

- This returns a paginated slice of the full list returned by the service.
- This is not the only way the client navigates; channels/rooms have their own listing APIs.

### Create a conversation

`POST /api/v1/conversations`

Body (conceptual):

```json
{
  "starshipId": "starship_123",
  "title": "New Conversation",
  "agentId": "agent_123",
  "agentSlug": "optional-slug-alternative",
  "parentConversationId": "optional-parent-id"
}
```

Important constraints (external callers):

- **Nested** conversations are allowed by setting `parentConversationId` (used for threads).
- **Top-level** conversations must be created as either:
  - a **channel** (use `POST /api/v1/starships/:starshipId/channels`), or
  - a **direct message** (use `POST /api/v1/starships/:starshipId/direct-messages`)

If you send `agentId/agentSlug` and omit `parentConversationId`, the server will create/reuse a **DM** instead of a raw top-level conversation.

### Update conversation details

`PATCH /api/v1/conversations/:conversationId`

Supports updating:

- `title`
- `state` (json)

### Update conversation status

`PATCH /api/v1/conversations/:conversationId/status`

Body:

```json
{ "status": "active" }
```

Supported status values:

- `active`
- `paused`
- `completed`
- `archived`

### Stop a conversation turn

`POST /api/v1/conversations/:conversationId/stop`

Stops an in-progress conversation (guarded by access checks).

### Delete a conversation

`DELETE /api/v1/conversations/:conversationId`

Notes:

- The server blocks deleting the starship’s **default channel** conversation when that invariant is available.

## Messages in conversations

There are two primary message surfaces:

### Get messages (with optional SSE streaming)

`GET /api/v1/conversations/:conversationId/messages`

Supports streaming when:

- `Accept: text/event-stream`, or
- `?stream=true`

Non-stream response supports pagination, and the streaming response sends a snapshot then incremental events.

For SSE details, cursors, and event types, see:

- `public-docs/conversations/streaming-and-notifications.md`

### Send a user message (may trigger agent turn)

`POST /api/v1/conversations/:conversationId/messages`

Body (conceptual):

```json
{ "content": "Hello", "agentId": "optional", "sync": false }
```

Notes:

- This endpoint **persists** the message and may **trigger agent execution** depending on routing logic.
- When `sync: true`, the server waits for completion (or waiting-for-tools) and returns a bounded message history snapshot.

### Persist-only message insert (no agent processing)

`POST /api/v1/messages`

This endpoint persists a message only (used for system context and “persist-only” thread messages).

## Threads / child conversations

See the dedicated thread reference for the full set of thread endpoints and semantics:

- [Threads](./threads.md)

At a glance, thread-related conversation routes include:

- `GET /api/v1/conversations/:conversationId/children`
- `GET /api/v1/conversations/:conversationId/children/pending-approvals`
- `GET /api/v1/conversations/:conversationId/linked-message?linkedConversationId=<threadId>`
- `GET /api/v1/conversations/:conversationId/notification-level` (thread-only; channel threads only)
- `PUT /api/v1/conversations/:conversationId/notification-level` (thread-only; channel threads only)

## Tool approvals + authorization (tool-call loop)

These endpoints power the “tools need approval” flow and server-tools mode.

### Tool-call authorization endpoint (always-200 contract)

`POST /api/v1/conversations/:conversationId/tool-calls/authorize-and-maybe-execute`

This is the internal endpoint used by server-tools mode / approval loops.

Important behavior:

- It **always returns 200** and wraps errors in `{ success:false, error:{...} }` so the `http_request` node doesn’t throw on non-2xx.

### List pending tool approvals for a conversation

`GET /api/v1/conversations/:conversationId/tool-approvals/pending`

### Approve a tool approval (continue the turn)

`POST /api/v1/conversations/:conversationId/tool-approvals/:approvalId/approve`

### Deny a tool approval (continue the turn)

`POST /api/v1/conversations/:conversationId/tool-approvals/:approvalId/deny`

## Starships connector actions (conversations)

Agents can use `connector_action` with `connector: "starships"` to call some conversation endpoints.

### Key actions

- `create-conversation` → `POST /conversations`
- `send-message` → `POST /conversations/{conversationId}/messages`
- `get-conversation-messages` → `GET /conversations/{conversationId}/messages` (pagination support)
- `authorize-and-maybe-execute-tool` → `POST /conversations/{conversationId}/tool-calls/authorize-and-maybe-execute`

Notes:

- `get-conversation-messages` is defined via the Starships connector endpoint catalog and supports `limit`, `offset`, and keyset cursor fields.
- Thread-related endpoints (children, linked-message, thread notification-level) are **HTTP-only** today (no Starships connector actions seeded for them).

## Examples (Blueprint / DSL)

### Example: create a child conversation (thread) and send a message

This uses Starships connector actions (`create-conversation` + `send-message`).

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "create",
      "type": "connector_action",
      "name": "Create thread conversation",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "create-conversation",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "title": "Thread",
          "parentConversationId": "{{ env('CONVERSATION_ID') }}"
        }
      }
    },
    {
      "ref": "send",
      "type": "connector_action",
      "name": "Send message",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "send-message",
        "failOnNon2xx": true,
        "args": {
          "conversationId": "{{ lastOutputOf('create').body.data.id }}",
          "content": "Hello from a child conversation"
        }
      }
    },
    { "ref": "endNode", "type": "end", "name": "End", "description": "", "parameters": { "output": "{{ lastOutputOf('send').body.data }}" } }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "create" },
    { "ref": "e2", "from": "create", "to": "send" },
    { "ref": "e3", "from": "send", "to": "endNode" }
  ],
  "metadata": {}
}
```

