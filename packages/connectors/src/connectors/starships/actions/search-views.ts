import type { CodeAction } from '../../../framework';

export const searchViews: CodeAction = {
  name: "search-views",
  description: "Search views (server-side filtered list)",
  method: "GET",
  path: "/starships/{starshipId}/views",
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
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/views`, {
  query: {
    "name": args.name == null ? undefined : String(args.name),
    "slug": args.slug == null ? undefined : String(args.slug),
    "limit": args.limit == null ? undefined : String(args.limit),
    "offset": args.offset == null ? undefined : String(args.offset),
  },
  timeoutMs: 5000,
}),
};
