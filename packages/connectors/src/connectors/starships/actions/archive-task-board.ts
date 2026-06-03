import type { CodeAction } from '../../../framework';

export const archiveTaskBoard: CodeAction = {
  name: "archive-task-board",
  description: "Archive a task board (soft-delete) (by id or slug)",
  method: "DELETE",
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
  run: (args, ctx) => ctx.http.delete(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards/${encodeURIComponent(String(args.boardSlug ?? args.boardId ?? args.id ?? ""))}`, {
  body: args,
  timeoutMs: 10000,
}),
};
