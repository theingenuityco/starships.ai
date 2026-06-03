import type { CodeAction } from '../../../framework';

export const listTableRows: CodeAction = {
  name: "list-table-rows",
  description: "List rows for a table (paginated) (by id or slug)",
  method: "GET",
  path: "/starships/{starshipId}/tables/{tableIdOrSlug}/rows",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
    ],
    "properties": {
      "limit": {
        "type": "number"
      },
      "expand": {
        "type": "string",
        "description": "Optional expansion. Use \"refs\" to hydrate references."
      },
      "offset": {
        "type": "number"
      },
      "search": {
        "type": "string",
        "description": "Case-insensitive substring search across row_key and row values"
      },
      "filters": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "array"
          },
          {
            "type": "object"
          }
        ],
        "description": "Row filters. Accepts either a JSON string or a JSON-serializable array/object. Server expects a JSON string in query params."
      },
      "tableId": {
        "type": "string"
      },
      "expandRefs": {
        "type": "boolean",
        "description": "Convenience flag for expand=refs"
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tables/${encodeURIComponent(String(args.tableSlug ?? args.tableId ?? ""))}/rows`, {
  query: {
    "limit": args.limit == null ? undefined : String(args.limit),
    "expand": args.expandRefs ? "refs" : (args.expand == null ? undefined : String(args.expand)),
    "offset": args.offset == null ? undefined : String(args.offset),
    "search": args.search == null ? undefined : String(args.search),
    "filters": args.filters == null ? undefined : (typeof args.filters === "string" ? args.filters : JSON.stringify(args.filters)),
  },
  timeoutMs: 10000,
}),
};
