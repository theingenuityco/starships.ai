import type { CodeAction } from '../../../framework';

export const getTable: CodeAction = {
  name: "get-table",
  description: "Get a table by id or slug (scoped to a starship)",
  method: "GET",
  path: "/starships/{starshipId}/tables/{tableIdOrSlug}",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
    ],
    "properties": {
      "tableId": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      },
      "tableSlug": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tables/${encodeURIComponent(String(args.tableSlug ?? args.tableId ?? ""))}`, {
  timeoutMs: 5000,
}),
};
