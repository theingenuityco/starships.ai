---
title: Threads (Child Conversations)
slug: conversations/threads
category: conversations
---

## What is a thread?

A thread is a **child conversation** under a parent conversation:

- **Thread conversation**: `conversations.id = threadId`
- **Parent**: `conversations.parent_conversation_id = parentConversationId`

Threads are used in two primary places:

- **Under channels**: channel threads (often linked from a message)
- **Under rooms**: room threads (forum-style “start a new thread”)

## Where this is implemented (source of truth)

- **Child conversation APIs + thread notification level**: `packages/server/src/routes/conversations.ts`
  - `GET /conversations/:conversationId/children`
  - `GET /conversations/:conversationId/children/pending-approvals`
  - `GET /conversations/:conversationId/linked-message`
  - `GET/PUT /conversations/:conversationId/notification-level` (thread-only, channels-only)
- **Message linking to threads**: `packages/server/src/routes/messages.ts` (`linkedConversationId` on message update)

## Creating threads

Threads are created by creating a conversation with `parentConversationId` set:

- **HTTP**: `POST /api/v1/conversations` with `{ parentConversationId: "<parentConversationId>" }`
- **Connector action**: `create-conversation` supports `parentConversationId`

Notes:

- This is allowed for nested threads.
- Top-level conversations (no parent) are restricted for external callers (channels/DMs/rooms have their own APIs).

## Child conversation APIs (HTTP)

### List child conversations for a parent

`GET /api/v1/conversations/:conversationId/children`

Supports pagination:

- `limit`
- cursor: `beforeUpdatedAt` + `beforeId` (must be provided together)

Response includes:

- `conversations` (children page)
- `hasMoreBefore`
- `oldestCursor`

### List child conversations that have pending tool approvals

`GET /api/v1/conversations/:conversationId/children/pending-approvals`

Returns a compact list of children that currently have pending tool-call approvals, newest first.

### Find the message that links to a child conversation

`GET /api/v1/conversations/:conversationId/linked-message?linkedConversationId=<threadId>`

Use this when you have a thread id and want to discover which parent message linked to it.

## Thread notification level (per-user)

Threads reuse conversation notification prefs (`all`, `mentions`, `mute`) but with an important constraint:

- `GET/PUT /api/v1/conversations/:conversationId/notification-level` is **only supported for threads whose parent is a channel**.

If the parent conversation is not a channel (e.g. a room), the endpoint returns a validation error.

## Linking a parent message to a thread

Threads are commonly linked from a parent message by setting `linkedConversationId` on a message.

- HTTP: `PUT /api/v1/messages/:messageId` with `{ "linkedConversationId": "<threadId>" }`

When a message becomes linked to a thread, the server best-effort ensures the child thread has participants:

- the **linked message author** (user or agent), and
- the **thread starter** (the authenticated user who performed the link)

## Starships connector actions (threads)

There are currently **no** Starships connector actions seeded specifically for thread-only endpoints:

- children listing
- linked-message lookup
- thread notification-level
- message linking

Use the HTTP APIs above for thread-specific operations.

