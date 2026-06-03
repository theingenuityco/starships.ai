import type { CodeAction } from '../../../framework';

export const createTaskColumn: CodeAction = {
  name: "create-task-column",
  description: "Create a column in a task board (by id or slug)",
  method: "POST",
  path: "/starships/{starshipId}/task-boards/{boardIdOrSlug}/columns",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "title"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "key": {
        "type": [
          "string",
          "null"
        ]
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
      "wipLimit": {
        "type": [
          "number",
          "null"
        ]
      },
      "boardSlug": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards/${encodeURIComponent(String(args.boardSlug ?? args.boardId ?? args.id ?? ""))}/columns`, {
  body: {
    "key": args.key,
    "pos": args.pos,
    "title": args.title,
    "wipLimit": args.wipLimit,
  },
  timeoutMs: 10000,
}),
};
