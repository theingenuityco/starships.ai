import type { CodeAction } from '../../../framework';

export const getTaskBoard: CodeAction = {
  name: "get-task-board",
  description: "Get a task board with its columns (by id or slug)",
  method: "GET",
  path: "/starships/{starshipId}/task-boards/{boardIdOrSlug}",
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
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards/${encodeURIComponent(String(args.boardSlug ?? args.boardId ?? args.id ?? ""))}`, {
  timeoutMs: 5000,
}),
};
