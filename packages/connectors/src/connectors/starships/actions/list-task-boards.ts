import type { CodeAction } from '../../../framework';

export const listTaskBoards: CodeAction = {
  name: "list-task-boards",
  description: "List task boards for a starship",
  method: "GET",
  path: "/starships/{starshipId}/task-boards",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
    ],
    "properties": {
      "starshipId": {
        "type": "string"
      },
      "includeArchived": {
        "type": "boolean"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/task-boards`, {
  query: {
    "includeArchived": args.includeArchived == null ? "" : String(args.includeArchived),
  },
  timeoutMs: 5000,
}),
};
