import type { CodeAction } from '../../../framework';

export const getAgentBySlug: CodeAction = {
  name: "get-agent-by-slug",
  description: "Get an agent by slug or id (global agents route)",
  method: "GET",
  path: "/agents/{slugOrId}",
  parameters: {
    "type": "object",
    "required": [
      "slugOrId"
    ],
    "properties": {
      "slugOrId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/agents/${encodeURIComponent(String(args.slugOrId ?? ""))}`, {
  timeoutMs: 5000,
}),
};
