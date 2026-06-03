import type { CodeAction } from '../../../framework';

export const updateTaskBoard: CodeAction = {
  name: "update-task-board",
  description: "Update a task board (by id or slug)",
  method: "PATCH",
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
      "pos": {
        "type": "number"
      },
      "name": {
        "type": "string"
      },
      "slug": {
        "type": "string"
      },
      "boardId": {
        "type": "string"
      },
      "archived": {
        "type": "boolean"
      },
      "boardSlug": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.patch(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards/${encodeURIComponent(String(args.boardSlug ?? args.boardId ?? args.id ?? ""))}`, {
  body: {
    "pos": args.pos,
    "name": args.name,
    "slug": args.slug,
    "archived": args.archived,
    "description": args.description,
  },
  timeoutMs: 10000,
}),
};
