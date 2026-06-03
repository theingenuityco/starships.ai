import type { CodeAction } from '../../../framework';

export const listAgents: CodeAction = {
  name: "list-agents",
  description: "List agents for a starship",
  method: "GET",
  path: "/starships/{starshipId}/agents",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
    ],
    "properties": {
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/agents`, {
  timeoutMs: 5000,
}),
};
