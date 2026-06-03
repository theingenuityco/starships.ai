import type { CodeAction } from '../../../framework';

export const listAgentsFromMarketplace: CodeAction = {
  name: "list-agents-from-marketplace",
  description: "List all agent templates from the marketplace",
  method: "GET",
  path: "/agent-templates",
  parameters: {
    "type": "object",
    "properties": {
      "page": {
        "type": "number"
      },
      "limit": {
        "type": "number"
      },
      "query": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/agent-templates`, {
  query: {
    "page": args.page ?? 1,
    "limit": args.limit ?? 50,
    "query": args.query,
  },
  timeoutMs: 5000,
}),
};
