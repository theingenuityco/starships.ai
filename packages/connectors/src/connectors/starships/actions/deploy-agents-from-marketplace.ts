import type { CodeAction } from '../../../framework';

export const deployAgentsFromMarketplace: CodeAction = {
  name: "deploy-agents-from-marketplace",
  description: "Create an agent on a starship from a marketplace template",
  method: "POST",
  path: "/agent-templates/{templateId}/agents",
  parameters: {
    "type": "object",
    "required": [
      "templateId"
    ],
    "properties": {
      "starshipId": {
        "type": "string"
      },
      "templateId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/agent-templates/${encodeURIComponent(String(args.templateId ?? ""))}/agents`, {
  body: {
    "starshipId": String(args.starshipId || ctx.runtimeEnv.STARSHIP_ID || ""),
  },
  timeoutMs: 15000,
}),
};
