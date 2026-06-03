import type { CodeAction } from '../../../framework';

export const getDoc: CodeAction = {
  name: "get-doc",
  description: "Get a single doc page by slug (supports nested slugs)",
  method: "GET",
  path: "/docs/{slug}",
  parameters: {
    "type": "object",
    "required": [
      "slug"
    ],
    "properties": {
      "slug": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/docs/${encodeURIComponent(String(args.slug ?? ""))}`, {
  timeoutMs: 5000,
}),
};
