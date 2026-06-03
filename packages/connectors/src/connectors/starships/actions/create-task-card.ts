import type { CodeAction } from '../../../framework';

export const createTaskCard: CodeAction = {
  name: "create-task-card",
  description: "Create a card in a task board (by id or slug)",
  method: "POST",
  path: "/starships/{starshipId}/task-boards/{boardIdOrSlug}/cards",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "title",
      "columnName"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "pos": {
        "type": "number"
      },
      "title": {
        "type": "string"
      },
      "boardId": {
        "type": "string"
      },
      "assignee": {
        "anyOf": [
          {
            "type": "object"
          },
          {
            "type": "null"
          }
        ],
        "description": "Unified assignee reference: { type: \"user\"|\"agent\", slug } (users use u:<userId>)"
      },
      "columnId": {
        "type": "string"
      },
      "priority": {
        "type": [
          "number",
          "null"
        ]
      },
      "boardSlug": {
        "type": "string"
      },
      "columnName": {
        "type": "string",
        "description": "Task column title/name (unique per board)"
      },
      "starshipId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "assigneeUserId": {
        "type": [
          "string",
          "null"
        ]
      },
      "assigneeAgentId": {
        "type": [
          "string",
          "null"
        ]
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards/${encodeURIComponent(String(args.boardSlug ?? args.boardId ?? args.id ?? ""))}/cards`, {
  body: {
    "pos": args.pos,
    "title": args.title,
    "assignee": args.assignee,
    "columnId": args.columnId,
    "priority": args.priority,
    "columnName": args.columnName,
    "description": args.description,
    "assigneeUserId": args.assigneeUserId,
    "assigneeAgentId": args.assigneeAgentId,
  },
  timeoutMs: 10000,
}),
};
