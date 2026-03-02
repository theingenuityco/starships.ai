---
title: Rooms (Forum-Style Threads + Pins)
slug: rooms
category: conversations
---

## What are rooms?

Rooms are **conversation-backed containers (forum-style)** inside a starship.

- **Room ID**: a room’s identifier is its backing **`conversationId`** (it references `conversations.id`)
- **Purpose**: start **threads** (child conversations) and pin **resources** (views, datasets, task boards, agents, tools)
- **UI location**: `/ship/:starshipSlug/rooms` and `/ship/:starshipSlug/rooms/:roomSlug`

A few stable terms used throughout this doc:

- **room**: the parent conversation + a row in `rooms`
- **thread**: a child conversation whose `parent_conversation_id = room.conversationId`
- **pin**: an ordered reference to another resource, stored in `room_*` tables

## Where this is implemented (source of truth)

If you need to confirm behavior, these files define canonical shapes and rules:

- **Protocol types (API shapes)**: `packages/protocol/dist/domains/room.d.ts`
- **HTTP API + validation/auth**: `packages/server/src/routes/rooms.ts`
- **Private membership enforcement**: `packages/server/src/utils/conversation-membership.ts` (`enforcePrivateRoomMembership`)
- **Repositories (DB access)**:
  - `packages/models/src/repositories/RoomRepository.ts` (`rooms`)
  - `packages/models/src/repositories/RoomViewsRepository.ts` (`room_views`)
  - `packages/models/src/repositories/RoomDatasetsRepository.ts` (`room_datasets`)
  - `packages/models/src/repositories/RoomTaskBoardsRepository.ts` (`room_task_boards`)
  - `packages/models/src/repositories/RoomAgentsRepository.ts` (`room_agents`)
  - `packages/models/src/repositories/RoomToolsRepository.ts` (`room_tools`)

## Documentation map (related concepts)

- **Views (pin targets)**: [Views API and connector actions](./views/api-and-connector-actions.md)
- **Datasets (pin targets)**: [Starship datasets](./data/datasets.md)
- **Task boards (pin targets)**: [Task boards](./tasks/README.md)
- **Connectors**: [Connectors reference](./connectors/README.md)

## Two ways to access rooms

You can interact with rooms via:

- **HTTP API** (documented below)
- **Starships connector actions** via `connector_action` nodes (recommended for agents when available)

Note: unlike datasets/views/channels, **rooms do not currently have Starships connector actions** seeded in the internal `starships` connector template. If you need programmatic room management today, use the HTTP API.

## Quickstart (mental model)

1. **Create a room** (creates a backing conversation, then inserts a `rooms` row).
2. **Start threads** by creating **child conversations** with `parent_conversation_id = room.conversationId`.
3. **Pin resources** to the room to create a curated “Resources” panel.

## Glossary

- **roomId**: the room’s conversation id (`RoomModel.conversationId`)
- **roomConversationId**: same value as `roomId` (used by pins tables + APIs)
- **roomSlug**: human-friendly stable identifier within a starship (`rooms.slug`)
- **threadId**: a child conversation id under the room
- **position**: 0-based ordering within a pin kind (views are ordered separately from datasets, etc.)

## Tips for agents

- **Use `roomId`/`conversationId` for API calls**: the slug is primarily for URLs/UI; the API is keyed by `conversationId`.
- **Private rooms are stricter than “starship access”**: even if you can access the starship, private rooms require membership (unless owner/admin).
- **Pins and membership changes are owner/admin-only today**: if you get `403`, you may need a starship owner (or instance admin) to perform the mutation.

## Privacy & access control

Rooms can be **public** or **private** (`isPrivate: boolean`).

- **Public rooms**: visible to all starship members.
- **Private rooms**: visible only to room members, with two bypasses:
  - **instance admin** can always access
  - **starship owner** can always access (only when the room belongs to that starship)

For private rooms, membership is accepted from either:

- `conversation_participants` (preferred), or
- `conversation_members` (backward/repair compatibility)

Important safety note: server-side checks resolve the room’s authoritative starship via the backing `conversations` row, and **fail closed** on starship mismatches.

## HTTP API (server)

All endpoints below are under the server prefix:

- Base prefix: `/api/v1`
- Auth: `jwtAuthMiddleware` (must be authenticated)

### List rooms in a starship (visibility-filtered)

`GET /api/v1/starships/:starshipId/rooms`

Returns rooms visible to the caller:

- public rooms
- private rooms where the caller is a member/participant
- (starship owner / instance admin) can see all rooms

Response:

```json
{ "rooms": [/* RoomModel[] */] }
```

### Create a room (conversation-backed)

`POST /api/v1/starships/:starshipId/rooms`

Body:

```json
{
  "slug": "example-room",
  "name": "Example room",
  "isPrivate": false,
  "topic": "Optional topic"
}
```

Constraints:

- `slug`: 1–100, lowercase, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, no leading/trailing whitespace
- `name`: 1–100, trimmed (no leading/trailing whitespace)
- `topic`: optional, up to 2000 chars
- `isPrivate`: optional (defaults to false server-side)

Notes:

- Creating a room also creates its backing conversation with `title = name`.
- If `isPrivate` is true, the creator is added as an **admin** in both `conversation_members` and `conversation_participants` (idempotent).

Response:

```json
{
  "room": {/* RoomModel */},
  "conversationId": "same-as-room.conversationId"
}
```

### Fetch a room by id

`GET /api/v1/rooms/:roomId`

- `roomId` is the room’s `conversationId`.
- Enforces private-room membership when `isPrivate` is true.

Response:

```json
{ "room": {/* RoomModel */} }
```

### Update a room (owner/admin only, MVP policy)

`PATCH /api/v1/rooms/:roomId`

Policy (current MVP): **starship owner / instance admin only**.

Body (all optional):

```json
{
  "name": "New name",
  "isPrivate": true,
  "topic": null
}
```

Notes:

- When `name` changes, the backing conversation title is updated best-effort.
- When `isPrivate` becomes true, the updater is added as an **admin** member/participant (best-effort, idempotent).

Response:

```json
{ "room": {/* RoomModel */} }
```

### Delete a room (owner/admin only)

`DELETE /api/v1/rooms/:roomId`

Policy (current MVP): **starship owner / instance admin only**.

Notes:

- Deletion is implemented by deleting the **backing conversation**.
- The DB is expected to cascade-delete the `rooms` row and related pins.

Response:

```json
{ "deleted": true }
```

## Notification level (per-user)

Rooms reuse conversation notification prefs, with levels:

- `all`
- `mentions`
- `mute`

### Get notification level

`GET /api/v1/rooms/:roomId/notification-level`

Response:

```json
{ "level": "mentions" }
```

### Set notification level

`PUT /api/v1/rooms/:roomId/notification-level`

Body:

```json
{ "level": "mute" }
```

Response:

```json
{ "level": "mute" }
```

## Private room membership (owner/admin only)

### Add a member (private rooms only)

`POST /api/v1/rooms/:roomId/members`

Body:

```json
{ "userId": "usr_...", "role": "member" }
```

Notes:

- Only valid for `isPrivate === true` rooms.
- Adds the user to **both** `conversation_members` and `conversation_participants`.

Response:

```json
{ "created": true }
```

### Remove a member (private rooms only)

`DELETE /api/v1/rooms/:roomId/members/:userId`

Notes:

- Removes from `conversation_members` and best-effort removes from `conversation_participants`.

Response:

```json
{ "removed": true }
```

## Pins (room resources)

Pins let a room carry an ordered “resources” panel.

### Pin kinds (protocol)

From protocol:

- `view`
- `dataset`
- `task_board`
- `agent`
- `tool`

Each pin record includes:

- `roomConversationId` (the room’s conversation id)
- a resource id field (e.g. `viewId`)
- `position` (0-based ordering within that kind)
- `createdAt`
- `createdBy` (nullable)

### List all pins for a room (permissioned)

`GET /api/v1/rooms/:roomId/pins`

Returns per-kind arrays:

```json
{
  "views": [],
  "datasets": [],
  "taskBoards": [],
  "agents": [],
  "tools": []
}
```

Access:

- Requires starship access
- Enforces private-room membership when `isPrivate` is true

### Pin / unpin resources (owner/admin only, MVP policy)

All pin mutations are currently enforced as **starship owner / instance admin only**.

Each “pin” endpoint accepts an optional `position` (integer \( \(\ge 0\) \)).
If omitted, the pin is appended (with stable ordering enforced server-side).

- **Agents**
  - `POST /api/v1/rooms/:roomId/pins/agents` body: `{ "agentId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/agents/:agentId`
- **Tools**
  - `POST /api/v1/rooms/:roomId/pins/tools` body: `{ "toolId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/tools/:toolId`
- **Views**
  - `POST /api/v1/rooms/:roomId/pins/views` body: `{ "viewId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/views/:viewId`
- **Datasets**
  - `POST /api/v1/rooms/:roomId/pins/datasets` body: `{ "datasetId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/datasets/:datasetId`
- **Task boards**
  - `POST /api/v1/rooms/:roomId/pins/task-boards` body: `{ "boardId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/task-boards/:boardId`

Validation rules:

- The pinned resource must exist.
- The pinned resource must belong to the **same starship** as the room.

Responses:

- Pin: `{ "pin": {/* RoomPin */} }`
- Unpin: `{ "removed": true }`

### Reorder pins (owner/admin only, MVP policy)

Each reorder endpoint requires providing **exactly the currently pinned ids** for that kind (no duplicates, no missing).
The server rewrites positions to `0..N-1` in the provided order.

- `POST /api/v1/rooms/:roomId/pins/views/reorder` body: `{ "viewIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/datasets/reorder` body: `{ "datasetIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/task-boards/reorder` body: `{ "boardIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/agents/reorder` body: `{ "agentIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/tools/reorder` body: `{ "toolIds": ["..."] }`

Responses return the updated list for that kind, e.g.:

```json
{ "views": [/* RoomPinnedView[] */] }
```

## Threads (room conversations)

Rooms are designed for **threads**, implemented as child conversations:

- **Room conversation**: the parent conversation (`room.conversationId`)
- **Thread conversation**: a conversation where `parent_conversation_id = room.conversationId`

Practical implication:

- The room itself is a container and can have pins + membership rules.
- Messages typically live in the **thread** conversations, not in the room container.

For listing thread history in a room, the UI uses “child conversations” of the room’s conversation id.

## Starships connector actions (rooms)

Unlike datasets/views/channels, there are currently **no** documented Starships connector actions for rooms (for example: no `list-rooms`, `create-room`, `pin-room-view`, etc.).

If you try to use `connector_action` with `connector: "starships"` and a room-related action name, you should expect an error like “unknown connector action”.

When room connector actions are added, this section should mirror the “Connector Actions” docs style used for datasets/views (action list + Blueprint/DSL examples).

