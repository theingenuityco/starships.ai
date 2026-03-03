---
title: Channels (Conversation-Backed)
slug: conversations/channels
category: conversations
---

## What are channels?

Channels are **conversation-backed rooms (Slack/Discord-like)** within a starship.

- **Channel ID**: the backing **`conversationId`** (references `conversations.id`)
- **Timeline**: channels are primarily used as chat timelines (messages live directly in the channel conversation)
- **Optional attached view**: channels can have an attached view via `attachedViewId`

## Channel vs room (theory)

- **Channel**: optimized for a single scrolling chat timeline.
- **Room**: optimized for starting many threads and pinning resources (forum-style).

If you want “one place where messages happen”, use a channel.
If you want “a place to start many independent threads”, use a room.

## Where this is implemented (source of truth)

- **Protocol types**: `packages/protocol/dist/domains/channel.d.ts`
- **HTTP API**: `packages/server/src/routes/channels.ts`
- **Private membership enforcement**: `packages/server/src/utils/conversation-membership.ts` (`enforcePrivateChannelMembership`)
- **Starships connector actions**:
  - `packages/models/src/migrations/127_starships_connector_channel_endpoints.ts` (`list-channels`, `create-channel`, `get-channel`, `update-channel`, `delete-channel`, `add-channel-member`, `remove-channel-member`)
  - `packages/models/src/migrations/126_starships_connector_views_crud_and_view_widget_attachment.ts` (`attach-view-to-channel`)

## Two ways to access channels

- **HTTP API** (documented below)
- **Starships connector actions** via `connector_action` (recommended for agents)

## HTTP API (server)

All endpoints below are under `/api/v1` and require auth (`jwtAuthMiddleware`).

### List channels for a starship (visibility-filtered)

`GET /api/v1/starships/:starshipId/channels`

Visibility rules:

- Public channels are visible to all starship members.
- Private channels are visible only to members/participants (owner/admin can see all).

Response:

```json
{ "channels": [/* ChannelModel[] */] }
```

### Create a channel

`POST /api/v1/starships/:starshipId/channels`

Body:

```json
{
  "slug": "general",
  "name": "General",
  "isPrivate": false,
  "topic": "Optional topic"
}
```

Notes:

- Creating a channel creates a backing conversation first with `title = name`.
- If private, the creator is added as `admin` in `conversation_participants`.

### Get a channel by id

`GET /api/v1/channels/:channelId`

- `channelId` is the backing conversation id.
- Enforces private-channel membership if `isPrivate` is true.

### Update a channel (owner/admin only, MVP policy)

`PATCH /api/v1/channels/:channelId`

Body supports:

- `name`
- `isPrivate`
- `topic`
- `attachedViewId` (nullable; must belong to same starship)

Notes:

- Best-effort keeps `conversation.title` in sync with `channel.name`.
- If channel becomes private, the updater is added as an admin member/participant (best-effort).

### Delete a channel (owner/admin only, MVP policy)

`DELETE /api/v1/channels/:channelId`

Notes:

- Implemented by deleting the backing conversation (CASCADE deletes the `channels` row).
- The server blocks deleting the starship’s default channel.

### Channel notification level (per-user)

Channels use conversation notification prefs (`all`, `mentions`, `mute`).

- `GET /api/v1/channels/:channelId/notification-level`
- `PUT /api/v1/channels/:channelId/notification-level` body: `{ "level": "mute" }`

### Private channel membership (owner/admin only, MVP policy)

- `POST /api/v1/channels/:channelId/members` body: `{ "userId": "...", "role": "member" }`
- `DELETE /api/v1/channels/:channelId/members/:userId`

Notes:

- Only valid for private channels.
- Adds/removes membership in `conversation_participants`.

## Starships connector actions (channels)

When using `connector_action` with `connector: "starships"`, the following channel-related actions exist:

- `list-channels`
- `create-channel`
- `get-channel`
- `update-channel`
- `delete-channel`
- `add-channel-member`
- `remove-channel-member`

### Action → endpoint mapping (Starships connector)

These are defined in `packages/models/src/migrations/127_starships_connector_channel_endpoints.ts`:

- `list-channels` → `GET /starships/{starshipId}/channels`
- `create-channel` → `POST /starships/{starshipId}/channels`
- `get-channel` → `GET /channels/{channelId}`
- `update-channel` → `PATCH /channels/{channelId}`
- `delete-channel` → `DELETE /channels/{channelId}`
- `add-channel-member` → `POST /channels/{channelId}/members`
- `remove-channel-member` → `DELETE /channels/{channelId}/members/{userId}`

### Attaching views to channels

Channel view attachment is implemented by patching the channel and setting `attachedViewId`:

- Connector action: `attach-view-to-channel` (uses `PATCH /channels/{channelId}` under the hood)
- HTTP API: `PATCH /api/v1/channels/:channelId` with `attachedViewId`

## Examples (Blueprint / DSL)

### Example: list channels

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "list",
      "type": "connector_action",
      "name": "List channels",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "list-channels",
        "failOnNon2xx": true,
        "args": { "starshipId": "{{ env('STARSHIP_ID') }}" }
      }
    },
    { "ref": "endNode", "type": "end", "name": "End", "description": "", "parameters": { "output": "{{ lastOutputOf('list').body.data }}" } }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "list" },
    { "ref": "e2", "from": "list", "to": "endNode" }
  ],
  "metadata": {}
}
```

### Example: create a channel

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "create",
      "type": "connector_action",
      "name": "Create channel",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "create-channel",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "slug": "general",
          "name": "General",
          "isPrivate": false,
          "topic": "Optional topic"
        }
      }
    },
    { "ref": "endNode", "type": "end", "name": "End", "description": "", "parameters": { "output": "{{ lastOutputOf('create').body.data }}" } }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "create" },
    { "ref": "e2", "from": "create", "to": "endNode" }
  ],
  "metadata": {}
}
```

