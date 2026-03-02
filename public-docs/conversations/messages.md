---
title: Messages (CRUD, Reactions, Linking)
slug: conversations/messages
category: conversations
---

## What is a message?

A message is a persisted record in a conversation history (channel, DM, thread, or other conversation-backed surface).

Messages can represent:

- user input
- assistant/agent output
- tool results
- system context / instructions

## Where this is implemented (source of truth)

- **HTTP API**: `packages/server/src/routes/messages.ts`
- **Conversation send/stream APIs**: `packages/server/src/routes/conversations.ts`
- **Membership enforcement**: `packages/server/src/utils/conversation-membership.ts`

## Two message write paths (important distinction)

### 1) Persist-only insert (no agent processing)

`POST /api/v1/messages`

This endpoint **only persists** a message. It does not trigger agent execution.

It is used for:

- hidden system context insertion
- “persist-only” thread messages
- creating messages with attachments in a controlled way

### 2) Send a user message to a conversation (may trigger an agent turn)

`POST /api/v1/conversations/:conversationId/messages`

This endpoint persists the message and may trigger agent execution and streaming.

See:

- `public-docs/conversations/conversations.md` (messages + turns)
- `public-docs/conversations/streaming-and-notifications.md` (SSE)

## HTTP API (server)

All endpoints below are under `/api/v1` and require auth (`jwtAuthMiddleware`).

### Create message (persist-only)

`POST /api/v1/messages`

Key fields (conceptual):

```json
{
  "conversationId": "conversation_...",
  "starshipId": "starship_...",
  "role": "user",
  "content": "Hello",
  "attachmentIds": ["att_1"],
  "linkedConversationId": "optional-thread-id"
}
```

Notes:

- Requires `conversationId` and `starshipId`, and the server validates they match the conversation’s starship.
- Enforces membership restrictions for private channels and DMs (and any other restricted conversation types enforced by the membership utilities).

### Get a message by id

`GET /api/v1/messages/:messageId`

Returns a single message record.

### Update a message

`PUT /api/v1/messages/:messageId`

Important rules:

- **Only the author can edit message content**:
  - must be a `role: "user"` message
  - message author user id must match the authenticated user
  - deleted messages cannot be edited

#### Linking a message to a thread

One common update is setting `linkedConversationId` on a message so the UI can treat that message as the “thread entry point”.

When `linkedConversationId` is set, the server best-effort ensures participants exist on the linked thread:

- the linked message author (user or agent)
- the thread starter (the authenticated user who performed the link)

The server also broadcasts a realtime update to the parent conversation stream so connected clients can update in-place.

### Toggle a reaction

`POST /api/v1/messages/:messageId/reactions`

Body:

```json
{ "emoji": "👍" }
```

Notes:

- Produces a realtime stream update (`message.reactions`) to the conversation.
- Best-effort creates a durable notification for the message author when someone reacts (channel/DM scope).

### Delete a message

`DELETE /api/v1/messages/:messageId`

Important rules:

- Only the author of a `role: "user"` message can delete it.
- Deletes are implemented as a **soft delete** (the server replaces content with a deleted marker).
- The server broadcasts the updated message via the conversation stream (`message.append`) so clients update without refresh.

## Starships connector actions (messages)

There are currently **no** Starships connector actions seeded for message CRUD/reactions/linking.

What *is* available:

- `send-message` connector action (conversation message send; not this CRUD surface)
- `get-conversation-messages` connector action (conversation message list; not this CRUD surface)

For message editing/deleting/reactions/linking, use the HTTP APIs above.

