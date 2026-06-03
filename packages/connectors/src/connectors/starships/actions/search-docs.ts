import type { CodeAction } from '../../../framework';

export const searchDocs: CodeAction = {
  name: "search-docs",
  description: "Search docs listing / fulltext",
  method: "GET",
  path: "/docs",
  parameters: {
    "type": "object",
    "properties": {
      "q": {
        "type": "string"
      },
      "limit": {
        "type": "number"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/docs`, {
  query: {
    "q": String(args.q ?? ""),
    "limit": args.limit == null ? "" : String(args.limit),
  },
  timeoutMs: 5000,
}),
};
