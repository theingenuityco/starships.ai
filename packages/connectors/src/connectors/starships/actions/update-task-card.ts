import type { CodeAction } from '../../../framework';

export const updateTaskCard: CodeAction = {
  name: "update-task-card",
  description: "Update a task card",
  method: "PATCH",
  path: "/task-cards/{cardId}",
  parameters: {
    "type": "object",
    "required": [
      "cardId"
    ],
    "properties": {
      "pos": {
        "type": "number"
      },
      "title": {
        "type": "string"
      },
      "cardId": {
        "type": "string"
      },
      "archived": {
        "type": "boolean"
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
      "priority": {
        "type": [
          "number",
          "null"
        ]
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
  run: (args, ctx) => ctx.http.patch(`/task-cards/${encodeURIComponent(String(args.cardId ?? args.id ?? ""))}`, {
  body: {
    "pos": args.pos,
    "title": args.title,
    "archived": args.archived,
    "assignee": args.assignee,
    "priority": args.priority,
    "description": args.description,
    "assigneeUserId": args.assigneeUserId,
    "assigneeAgentId": args.assigneeAgentId,
  },
  timeoutMs: 10000,
}),
};
