import type { CodeAction } from '../../../framework';

export const assignAgentTool: CodeAction = {
  name: "assign-agent-tool",
  description: "Assign a tool to an agent by id + toolSlug",
  method: "POST",
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
  run: (args, ctx) => ctx.http.post(`/agents/${encodeURIComponent(String(args.agentId ?? ""))}/tools/${encodeURIComponent(String(args.toolSlug ?? ""))}`, {
  body: args,
  timeoutMs: 10000,
}),
};
