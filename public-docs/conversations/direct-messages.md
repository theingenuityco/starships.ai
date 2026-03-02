---
title: Direct Messages (DMs)
slug: conversations/direct-messages
category: conversations
---

## What are direct messages?

Direct messages (DMs) are **conversation-backed** private conversations in a starship.

Two DM types exist:

- **user↔agent** (`dmType: "user_agent"`)
- **user↔user** (`dmType: "user_user"`)

DMs are always treated as **restricted**: access is membership-based (not just “starship access”).

## Where this is implemented (source of truth)

- **HTTP API**: `packages/server/src/routes/direct-messages.ts`
- **Membership enforcement**: `packages/server/src/utils/conversation-membership.ts` (`enforceDirectMessageMembership`)
- **Repo**: `packages/models/src/repositories/DirectMessageRepository.ts`

## Mental model (important behavior)

### DMs are reused (idempotent creation)

Creating a DM is not “always create a new conversation”.

- **user↔agent**: there is effectively one DM per `(starshipId, userId, agentId)`
- **user↔user**: there is effectively one DM per `(starshipId, userAId, userBId)` (normalized pair)

So `POST /direct-messages` can return an existing DM with `200` instead of creating a new one.

### DMs are conversation-backed

The DM “id” used by downstream message APIs is the **backing `conversationId`**.

That means:

- To fetch messages: use `GET /api/v1/conversations/:conversationId/messages`
- To send a message: use `POST /api/v1/conversations/:conversationId/messages`

## HTTP API (server)

All endpoints below are under `/api/v1` and require auth (`jwtAuthMiddleware`).

### List DMs visible to the current user

`GET /api/v1/starships/:starshipId/direct-messages`

Returns DMs visible to the caller (membership-based) plus helpful context:

- `dm`: the DM model
- `conversation`: the backing conversation (may be null if missing)
- `agent`: for user↔agent DMs
- `peerUser`: for user↔user DMs (the “other user”)

Response:

```json
{ "directMessages": [/* { dm, conversation, agent, peerUser }[] */] }
```

### Create (or return existing) DM

`POST /api/v1/starships/:starshipId/direct-messages`

Body rules:

- Provide **either** `agentId/agentSlug` **or** `peerUserId` (exactly one target).

Body (user↔agent):

```json
{ "agentId": "agent_123", "title": "Optional title override" }
```

Body (user↔user):

```json
{ "peerUserId": "usr_456", "title": "Optional title override" }
```

Constraints:

- For user↔agent: agent must belong to the same starship.
- For user↔user: the peer user must be a member of the starship (or the starship owner).

Response:

```json
{ "dm": {/* DirectMessageModel */}, "conversationId": "conversation_..." }
```

Status codes:

- `200`: returned an existing DM
- `201`: created a new DM

## Relationship to `POST /conversations`

There is an additional DM convenience path:

- `POST /api/v1/conversations` with an `agentId`/`agentSlug` and **no** `parentConversationId`
  may create/reuse a user↔agent DM rather than creating an arbitrary top-level conversation.

If you are building a DM-specific feature, prefer the **DM endpoints** above.

## Starships connector actions (DMs)

There are currently **no** Starships connector actions seeded for direct-message endpoints.

Use the HTTP API:

- list/create DMs via `/starships/:starshipId/direct-messages`
- read/send messages via the backing `conversationId` on the conversations message endpoints

