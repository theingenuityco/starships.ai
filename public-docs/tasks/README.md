---
title: Task Boards (Kanban)
slug: tasks
category: tasks
---

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
- `list-task-cards`
- `create-task-card`
- `update-task-card`
- `move-task-card`
- `archive-task-card`

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
        "args": { "boardId": "{{ lastOutputOf('boards').boards[0].id }}" }
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
        "args": {
          "boardId": "{{ lastOutputOf('boards').boards[0].id }}",
          "columnId": "{{ lastOutputOf('getBoard').columns[0].id }}",
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
        "args": {
          "cardId": "{{ lastOutputOf('createCard').id }}",
          "toColumnId": "{{ lastOutputOf('getBoard').columns[1].id }}"
        }
      }
    },
    {
      "ref": "end",
      "type": "end",
      "name": "End",
      "description": "End",
      "parameters": { "output": "{{ lastOutputOf('moveCard') }}" }
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

- `get-task-board` returns `board` + `columns`.
- `move-task-card` accepts `toPos` optionally for precise ordering. If omitted, the server places the card at the end of the destination column.

