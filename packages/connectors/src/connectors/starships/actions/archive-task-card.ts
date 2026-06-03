import type { CodeAction } from '../../../framework';

export const archiveTaskCard: CodeAction = {
  name: "archive-task-card",
  description: "Archive a task card (soft-delete)",
  method: "DELETE",
  path: "/task-cards/{cardId}",
  parameters: {
    "type": "object",
    "required": [
      "cardId"
    ],
    "properties": {
      "cardId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/task-cards/${encodeURIComponent(String(args.cardId ?? args.id ?? ""))}`, {
  body: args,
  timeoutMs: 10000,
}),
};
