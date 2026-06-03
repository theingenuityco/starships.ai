import type { CodeAction } from '../../../framework';

export const getViewBySlug: CodeAction = {
  name: "get-view-by-slug",
  description: "Get a view by slug (requires starshipId query param)",
  method: "GET",
  path: "/views/slug/{slug}",
  parameters: {
    "type": "object",
    "required": [
      "slug",
      "starshipId"
    ],
    "properties": {
      "slug": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/views/slug/${encodeURIComponent(String(args.slug ?? ""))}`, {
  query: {
    "starshipId": String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""),
  },
  timeoutMs: 5000,
}),
};
