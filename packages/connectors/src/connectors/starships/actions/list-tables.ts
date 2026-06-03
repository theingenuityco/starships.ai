import type { CodeAction } from '../../../framework';

export const listTables: CodeAction = {
  name: "list-tables",
  description: "List tables for a starship",
  method: "GET",
  path: "/starships/{starshipId}/tables",
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tables`, {
  query: {
    "includeArchived": args.includeArchived == null ? undefined : String(args.includeArchived),
  },
  timeoutMs: 5000,
}),
};
