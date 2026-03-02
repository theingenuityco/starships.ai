---
title: Rooms (Forum-Style Threads + Pins)
slug: conversations/rooms
category: conversations
---

## What are rooms?

Rooms are **conversation-backed containers (forum-style)** inside a starship.

- **Room ID**: the backing **`conversationId`** (references `conversations.id`)
- **Purpose**: start **threads** (child conversations) and pin **resources** (views, datasets, task boards, agents, tools)
- **UI location**: `/ship/:starshipSlug/rooms` and `/ship/:starshipSlug/rooms/:roomSlug`

Stable terms used below:

- **room**: the parent conversation + a row in `rooms`
- **thread**: a child conversation whose `parent_conversation_id = room.conversationId`
- **pin**: an ordered reference to another resource, stored in `room_*` tables

## Where this is implemented (source of truth)

- **Protocol types**: `packages/protocol/dist/domains/room.d.ts`
- **HTTP API**: `packages/server/src/routes/rooms.ts`
- **Private membership enforcement**: `packages/server/src/utils/conversation-membership.ts` (`enforcePrivateRoomMembership`)
- **Repositories (DB access)**:
  - `packages/models/src/repositories/RoomRepository.ts` (`rooms`)
  - `packages/models/src/repositories/RoomViewsRepository.ts` (`room_views`)
  - `packages/models/src/repositories/RoomDatasetsRepository.ts` (`room_datasets`)
  - `packages/models/src/repositories/RoomTaskBoardsRepository.ts` (`room_task_boards`)
  - `packages/models/src/repositories/RoomAgentsRepository.ts` (`room_agents`)
  - `packages/models/src/repositories/RoomToolsRepository.ts` (`room_tools`)

## Two ways to access rooms

- **HTTP API** (documented below)
- **Starships connector actions** via `connector_action` (recommended when available)

Note: unlike channels/views/datasets, **rooms currently do not have Starships connector actions** seeded in the internal `starships` connector template. Room CRUD and pins are **HTTP-only** today.

## Room vs channel (theory)

- **Room**: a forum-style index for starting many threads and pinning resources.
- **Channel**: a single chat timeline that may optionally have message-linked threads.

Rooms are best when you want:

- many independent threads (each is its own child conversation)
- a curated “Resources” panel (pins)

Channels are best when you want:

- one continuous timeline (messages live directly in the channel conversation)

## Pins (theory)

Pins are **per-kind ordered lists** attached to a room.
Each pin kind has its own ordered list (so “views position 0” and “datasets position 0” are different lists).

Pin kinds:

- `view`
- `dataset`
- `task_board`
- `agent`
- `tool`

## Tips for agents

- **Rooms are HTTP-only today**: without a seeded connector action (or a custom tool wrapping these routes), an agent cannot call the rooms APIs via `connector_action`.
- **Prefer pinning to teach context**: pins are the intended way to make “room context” discoverable (dashboards, datasets, task boards, etc.).
- **Thread notification level**: thread notification-level endpoints are currently channel-thread only; do not rely on them for room threads.

## Privacy & access control

Rooms can be **public** or **private** (`isPrivate: boolean`).

- **Public rooms**: visible to all starship members.
- **Private rooms**: visible only to room members, with bypasses:
  - **instance admin** can always access
  - **starship owner** can always access (only when the room belongs to that starship)

For private rooms, membership is accepted from either:

- `conversation_participants` (preferred), or
- `conversation_members` (backward/repair compatibility)

## HTTP API (server)

All endpoints below are under `/api/v1` and require auth (`jwtAuthMiddleware`).

### List rooms in a starship (visibility-filtered)

`GET /api/v1/starships/:starshipId/rooms`

Response:

```json
{ "rooms": [/* RoomModel[] */] }
```

### Create a room

`POST /api/v1/starships/:starshipId/rooms`

Body (conceptual):

```json
{ "slug": "example", "name": "Example", "isPrivate": false, "topic": "Optional" }
```

Notes:

- Creates backing conversation then creates the `rooms` row.
- If private, the creator is added as `admin` member/participant (idempotent).

### Get a room by id

`GET /api/v1/rooms/:roomId`

### Update a room (owner/admin only, MVP policy)

`PATCH /api/v1/rooms/:roomId`

Body supports partial updates:

- `name`
- `isPrivate`
- `topic`

### Delete a room (owner/admin only, MVP policy)

`DELETE /api/v1/rooms/:roomId`

Notes:

- Implemented by deleting the backing conversation (expected to cascade-delete room row + pins).

## Notification level (per-user)

Rooms use conversation notification prefs (`all`, `mentions`, `mute`).

- `GET /api/v1/rooms/:roomId/notification-level`
- `PUT /api/v1/rooms/:roomId/notification-level` body: `{ "level": "mentions" }`

## Private room membership (owner/admin only, MVP policy)

- `POST /api/v1/rooms/:roomId/members` body: `{ "userId": "...", "role": "member" }`
- `DELETE /api/v1/rooms/:roomId/members/:userId`

## Pins (room resources)

Pins are stored per-kind and ordered by `position` within that kind.

### List pins

`GET /api/v1/rooms/:roomId/pins`

Response:

```json
{ "views": [], "datasets": [], "taskBoards": [], "agents": [], "tools": [] }
```

### Pin / unpin (owner/admin only, MVP policy)

- Agents:
  - `POST /api/v1/rooms/:roomId/pins/agents` body: `{ "agentId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/agents/:agentId`
- Tools:
  - `POST /api/v1/rooms/:roomId/pins/tools` body: `{ "toolId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/tools/:toolId`
- Views:
  - `POST /api/v1/rooms/:roomId/pins/views` body: `{ "viewId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/views/:viewId`
- Datasets:
  - `POST /api/v1/rooms/:roomId/pins/datasets` body: `{ "datasetId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/datasets/:datasetId`
- Task boards:
  - `POST /api/v1/rooms/:roomId/pins/task-boards` body: `{ "boardId": "...", "position"?: 0 }`
  - `DELETE /api/v1/rooms/:roomId/pins/task-boards/:boardId`

Validation / invariants:

- The pinned resource must exist.
- The pinned resource must belong to the **same starship** as the room.
- Pin mutations are owner/admin-only today (MVP policy).

Ordering semantics:

- `position` is 0-based **within the pin kind**.
- If `position` is omitted, the pin is appended.
- The server maintains a stable order by shifting positions under concurrency.

### Reorder pins (owner/admin only, MVP policy)

Reorder endpoints require providing exactly the currently pinned ids for that kind:

- `POST /api/v1/rooms/:roomId/pins/views/reorder` body: `{ "viewIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/datasets/reorder` body: `{ "datasetIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/task-boards/reorder` body: `{ "boardIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/agents/reorder` body: `{ "agentIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/tools/reorder` body: `{ "toolIds": ["..."] }`

## Threads in rooms

Rooms are designed for threads implemented as **child conversations**:

- **Room conversation**: the parent (`room.conversationId`)
- **Thread conversation**: a conversation where `parent_conversation_id = room.conversationId`

See [Threads](./threads.md) for the child conversation APIs.

