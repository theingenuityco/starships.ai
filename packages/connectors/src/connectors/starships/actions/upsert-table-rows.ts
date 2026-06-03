import type { CodeAction } from '../../../framework';

export const upsertTableRows: CodeAction = {
  name: "upsert-table-rows",
  description: "Append or upsert rows in a table (by id or slug)",
  method: "POST",
  path: "/starships/{starshipId}/tables/{tableIdOrSlug}/rows:upsert",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "rows"
    ],
    "properties": {
      "mode": {
        "enum": [
          "append",
          "upsert"
        ],
        "type": "string"
      },
      "rows": {
        "type": "array"
      },
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
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tables/${encodeURIComponent(String(args.tableSlug ?? args.tableId ?? ""))}/rows:upsert`, {
  body: {
    "mode": args.mode,
    "rows": args.rows ?? [],
  },
  timeoutMs: 30000,
}),
};
