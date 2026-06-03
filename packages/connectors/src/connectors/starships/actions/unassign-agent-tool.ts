import type { CodeAction } from '../../../framework';

export const unassignAgentTool: CodeAction = {
  name: "unassign-agent-tool",
  description: "Remove a tool from an agent by id + toolSlug",
  method: "DELETE",
  path: "/agents/{agentId}/tools/{toolSlug}",
  parameters: {
    "type": "object",
    "required": [
      "agentId",
      "toolSlug"
    ],
    "properties": {
      "agentId": {
        "type": "string"
      },
      "toolSlug": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/agents/${encodeURIComponent(String(args.agentId ?? ""))}/tools/${encodeURIComponent(String(args.toolSlug ?? ""))}`, {
  body: args,
  timeoutMs: 10000,
}),
};
