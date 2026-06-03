import type { CodeAction } from '../../../framework';

export const searchWidgets: CodeAction = {
  name: "search-widgets",
  description: "Search widgets (server-side filtered list)",
  method: "GET",
  path: "/starships/{starshipId}/widgets",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "slug": {
        "type": "string"
      },
      "limit": {
        "type": "number"
      },
      "offset": {
        "type": "number"
      },
      "starshipId": {
        "type": "string"
      },
      "widgetType": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/widgets`, {
  query: {
    "name": args.name == null ? "" : String(args.name),
    "slug": args.slug == null ? "" : String(args.slug),
    "limit": args.limit == null ? "" : String(args.limit),
    "offset": args.offset == null ? "" : String(args.offset),
    "widgetType": args.widgetType == null ? "" : String(args.widgetType),
  },
  timeoutMs: 5000,
}),
};
