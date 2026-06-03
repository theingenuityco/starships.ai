import type { CodeAction } from '../../../framework';

export const listTaskCards: CodeAction = {
  name: "list-task-cards",
  description: "List cards for a task board (by id or slug)",
  method: "GET",
  path: "/starships/{starshipId}/task-boards/{boardIdOrSlug}/cards",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "boardId": {
        "type": "string"
      },
      "boardSlug": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      },
      "includeArchived": {
        "type": "boolean"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards/${encodeURIComponent(String(args.boardSlug ?? args.boardId ?? args.id ?? ""))}/cards`, {
  query: {
    "includeArchived": args.includeArchived == null ? undefined : String(args.includeArchived),
  },
  timeoutMs: 5000,
}),
};
