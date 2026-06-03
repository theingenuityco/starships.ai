import type { CodeAction } from '../../../framework';

export const searchConnector: CodeAction = {
  name: "search-connector",
  description: "Search connector templates (catalog) by query",
  method: "GET",
  path: "/connectors/catalog",
  parameters: {
    "type": "object",
    "properties": {
      "q": {
        "type": "string",
        "description": "Search query"
      },
      "limit": {
        "type": "number",
        "description": "Maximum results (1-100)"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/connectors/catalog`, {
  query: {
    "q": String(args.q ?? ""),
    "limit": Number(args.limit ?? 20),
  },
  timeoutMs: 5000,
}),
};
