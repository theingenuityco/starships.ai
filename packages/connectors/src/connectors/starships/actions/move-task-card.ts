import type { CodeAction } from '../../../framework';

export const moveTaskCard: CodeAction = {
  name: "move-task-card",
  description: "Move a task card to a new column/position",
  method: "POST",
  path: "/task-cards/{cardId}/move",
  parameters: {
    "type": "object",
    "required": [
      "cardId",
      "toColumnName"
    ],
    "properties": {
      "toPos": {
        "type": "number"
      },
      "cardId": {
        "type": "string"
      },
      "toColumnId": {
        "type": "string"
      },
      "toColumnName": {
        "type": "string",
        "description": "Destination column title/name (unique per board)"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/task-cards/${encodeURIComponent(String(args.cardId ?? args.id ?? ""))}/move`, {
  body: {
    "toPos": args.toPos,
    "toColumnId": args.toColumnId,
    "toColumnName": args.toColumnName,
  },
  timeoutMs: 10000,
}),
};
