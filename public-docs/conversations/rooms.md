---
title: Rooms (Forum-Style Threads + Resources)
slug: conversations/rooms
category: conversations
---

## What are rooms?

Rooms are **conversation-backed containers (forum-style)** inside a starship.

- **Room ID**: the backing **`conversationId`** (references `conversations.id`)
- **Purpose**: start **threads** (child conversations), pin **resources** (views, datasets, task boards), and **assign tools** to rooms
- **UI location**: `/ship/:starshipSlug/rooms` and `/ship/:starshipSlug/rooms/:roomSlug`

Stable terms used below:

- **room**: the parent conversation + a row in `rooms`
- **thread**: a child conversation whose `parent_conversation_id = room.conversationId`
- **pin**: an ordered reference to another resource, stored in `room_*` tables
- **tool assignment**: an unordered room↔tool relationship (with optional room-scoped permission), stored in `room_tools`

## Where this is implemented (source of truth)

- **Protocol types**: `packages/protocol/dist/domains/room.d.ts`
- **HTTP API**: `packages/server/src/routes/rooms.ts`
- **Private membership enforcement**: `packages/server/src/utils/conversation-membership.ts` (`enforcePrivateRoomMembership`)
- **Repositories (DB access)**:
  - `packages/models/src/repositories/RoomRepository.ts` (`rooms`)
  - `packages/models/src/repositories/RoomViewsRepository.ts` (`room_views`)
  - `packages/models/src/repositories/RoomDatasetsRepository.ts` (`room_datasets`)
  - `packages/models/src/repositories/RoomTaskBoardsRepository.ts` (`room_task_boards`)
  - `packages/models/src/repositories/RoomToolsRepository.ts` (`room_tools`)

## Two ways to access rooms

- **HTTP API** (documented below)
- **Starships connector actions** via `connector_action` (recommended when available)

Rooms now have Starships connector actions seeded in the internal `starships` connector template (Room CRUD, notification level, membership, pins, and tool assignments).

### Starships connector actions (rooms)

When using `connector_action` with `connector: "starships"`, the following room-related actions exist:

- `list-rooms`
- `create-room`
- `get-room`
- `update-room`
- `delete-room`
- `get-room-notification-level`
- `update-room-notification-level`
- `add-room-member`
- `remove-room-member`
- `get-room-pins`
- `get-room-resources` (combined resolved resources + assigned tools)
- `get-room-pins-views`
- `get-room-pins-datasets`
- `get-room-pins-task-boards`
- `get-room-tools`
- `assign-room-tool` / `unassign-room-tool`
- `pin-room-view` / `unpin-room-view`
- `pin-room-dataset` / `unpin-room-dataset`
- `pin-room-task-board` / `unpin-room-task-board`
- `reorder-room-pins-views`
- `reorder-room-pins-datasets`
- `reorder-room-pins-task-boards`

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

## Room tool assignments (theory)

Room tools are **assigned** (not pinned). This means:

- The assignment list is **unordered** (no `position` / reorder).
- Each assignment can carry a room-scoped `permission` (`allow|ask|deny`) that overrides starship defaults for agent execution in that room.

## Tips for agents

- **Prefer Starships connector actions when available**: rooms, pins, resolved resources, and room tool assignments are available via `connector_action` on the `starships` connector template.
- **Prefer pinning to teach context**: pins are the intended way to make “room context” discoverable (dashboards, datasets, task boards, etc.).
- **Thread notification level**: thread notification-level endpoints are currently channel-thread only; do not rely on them for room threads.

## Privacy & access control

Rooms can be **public** or **private** (`isPrivate: boolean`).

- **Public rooms**: visible to all starship members.
- **Private rooms**: visible only to room members, with bypasses:
  - **instance admin** can always access
  - **starship owner** can always access (only when the room belongs to that starship)

For private rooms, membership is enforced via `conversation_participants`.

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
{ "views": [], "datasets": [], "taskBoards": [] }
```

### View room resources (resolved objects)

To avoid fetching “all starship resources” just to render room resources, you can fetch resolved room resources:

- `GET /api/v1/rooms/:roomId/resources` (combined; returns pinned resources + assigned tools)
- `GET /api/v1/rooms/:roomId/pins/views`
- `GET /api/v1/rooms/:roomId/pins/datasets`
- `GET /api/v1/rooms/:roomId/pins/task-boards`
- `GET /api/v1/rooms/:roomId/tools`

Combined response shape:

```json
{ "views": [], "datasets": [], "taskBoards": [], "tools": [], "participants": { "users": [], "agents": [] } }
```

Pinned-kind endpoints return an `items` array of `{ pin, <resource> }` objects (e.g. `{ pin, view }`).\n\nRoom tools are returned as `{ assignment, tool }` objects.
Participants are returned as:

- `participants.users[]`: `{ id, slug: "u:<userId>", displayName, avatar, role }`
- `participants.agents[]`: `{ id, slug: "<agentSlug>", name }`

#### Filters & search (combined endpoint)

`GET /api/v1/rooms/:roomId/resources` supports query params:

- `kinds`: optional kind filter (comma-separated or repeated). Accepted: `views`, `datasets`, `taskBoards` (`task-boards`), `tools`, `all`.
- `q`: optional case-insensitive search across `name` / `slug` / `description` (where applicable)
- `includeArchived`: optional boolean (default `false`). When `true`, includes archived datasets/task boards.
- `limitPerKind`: optional number (0–200). Caps results per kind after filtering.

### Pin / unpin (owner/admin only, MVP policy)

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

## Room tool assignments (owner/admin only, MVP policy)

Tools are assigned to rooms (unordered, no reordering):

- `GET /api/v1/rooms/:roomId/tools`
- `POST /api/v1/rooms/:roomId/tools` body: `{ "toolId": "...", "permission"?: "allow" }`
- `DELETE /api/v1/rooms/:roomId/tools/:toolId`

### Reorder pins (owner/admin only, MVP policy)

Reorder endpoints require providing exactly the currently pinned ids for that kind:

- `POST /api/v1/rooms/:roomId/pins/views/reorder` body: `{ "viewIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/datasets/reorder` body: `{ "datasetIds": ["..."] }`
- `POST /api/v1/rooms/:roomId/pins/task-boards/reorder` body: `{ "boardIds": ["..."] }`

## Threads in rooms

Rooms are designed for threads implemented as **child conversations**:

- **Room conversation**: the parent (`room.conversationId`)
- **Thread conversation**: a conversation where `parent_conversation_id = room.conversationId`

See [Threads](./threads.md) for the child conversation APIs.

To list/search threads for a room via connector actions, use:

- `list-conversation-children` (optional `q` for DB-level search on child conversation title)

