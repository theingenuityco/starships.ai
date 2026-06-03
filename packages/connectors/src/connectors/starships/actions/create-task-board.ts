import type { CodeAction } from '../../../framework';

export const createTaskBoard: CodeAction = {
  name: "create-task-board",
  description: "Create a task board for a starship",
  method: "POST",
  path: "/starships/{starshipId}/task-boards",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "name"
    ],
    "properties": {
      "pos": {
        "type": "number"
      },
      "name": {
        "type": "string"
      },
      "slug": {
        "type": "string"
      },
      "columns": {
        "type": "array"
      },
      "starshipId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "createDefaultColumns": {
        "type": "boolean"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards`, {
  body: {
    "pos": args.pos,
    "name": args.name,
    "slug": args.slug,
    "columns": args.columns,
    "description": args.description,
    "createDefaultColumns": args.createDefaultColumns,
  },
  timeoutMs: 10000,
}),
};
