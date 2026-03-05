---
title: Task Boards (Kanban)
slug: tasks
category: tasks
---

# Task Boards (Kanban)

## Overview

Task boards are **starship-scoped** kanban boards intended for both humans and agents to track work.

- **Multiple boards per starship**
- **Columns** within a board (e.g. Todo / Doing / Done)
- **Cards** within columns

## Agent usage (connector actions)

Agents can manage task boards via the `starships` connector using `connector_action` nodes.

Key actions (Starships connector):

- `list-task-boards`
- `create-task-board`
- `get-task-board`
- `update-task-board`
- `archive-task-board`
- `create-task-column`
- `update-task-column`
- `delete-task-column`
- `list-task-cards`
- `create-task-card`
- `update-task-card`
- `move-task-card`
- `archive-task-card`

### Notes on board IDs vs slugs

- Most board actions accept **`boardSlug` (preferred)** or `boardId` (legacy).
- Slugs are unique per starship.

### Example: create a card, then move it

This example assumes the agent runtime provides `state.starshipId` (or `runtimeEnv.STARSHIP_ID`) and that the agent has permission to call Starships connector actions.

```json
{
  "nodes": [
    {
      "ref": "start",
      "type": "start",
      "name": "Start",
      "description": "Start",
      "parameters": {}
    },
    {
      "ref": "boards",
      "type": "connector_action",
      "name": "List boards",
      "description": "List task boards in this starship",
      "parameters": {
        "connector": "starships",
        "action": "list-task-boards",
        "failOnNon2xx": true,
        "args": { "starshipId": "{{ state.starshipId }}" }
      }
    },
    {
      "ref": "getBoard",
      "type": "connector_action",
      "name": "Get board",
      "description": "Fetch board details (includes columns)",
      "parameters": {
        "connector": "starships",
        "action": "get-task-board",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ state.starshipId }}",
          "boardSlug": "{{ lastOutputOf('boards').body.data.boards[0].slug }}"
        }
      }
    },
    {
      "ref": "createCard",
      "type": "connector_action",
      "name": "Create card",
      "description": "Create a task card in a board",
      "parameters": {
        "connector": "starships",
        "action": "create-task-card",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ state.starshipId }}",
          "boardSlug": "{{ lastOutputOf('boards').body.data.boards[0].slug }}",
          "columnName": "{{ lastOutputOf('getBoard').body.data.columns[0].title }}",
          "title": "Investigate issue #123"
        }
      }
    },
    {
      "ref": "moveCard",
      "type": "connector_action",
      "name": "Move card",
      "description": "Move the card to another column",
      "parameters": {
        "connector": "starships",
        "action": "move-task-card",
        "failOnNon2xx": true,
        "args": {
          "cardId": "{{ lastOutputOf('createCard').body.data.id }}",
          "toColumnName": "{{ lastOutputOf('getBoard').body.data.columns[1].title }}"
        }
      }
    },
    {
      "ref": "end",
      "type": "end",
      "name": "End",
      "description": "End",
      "parameters": { "output": "{{ lastOutputOf('moveCard').body.data }}" }
    }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "boards" },
    { "ref": "e2", "from": "boards", "to": "getBoard" },
    { "ref": "e3", "from": "getBoard", "to": "createCard" },
    { "ref": "e4", "from": "createCard", "to": "moveCard" },
    { "ref": "e5", "from": "moveCard", "to": "end" }
  ],
  "metadata": {}
}
```

Notes:

- `get-task-board` returns `{ board, columns }` in `body.data`.
- `create-task-card` requires `columnName` (the column title, unique per board).
- `move-task-card` accepts `toPos` optionally for precise ordering. If omitted, the server places the card at the end of the destination column.
- `create-task-card` and `update-task-card` support `assignee: { type: "user"|"agent", slug } | null` (users use `u:<userId>` or `<@u:userId>`; agents use the agent slug).

