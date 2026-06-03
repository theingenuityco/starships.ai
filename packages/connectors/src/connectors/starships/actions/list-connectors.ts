import type { CodeAction } from '../../../framework';

export const listConnectors: CodeAction = {
  name: "list-connectors",
  description: "List connectors for a starship",
  method: "GET",
  path: "/starships/{starshipId}/connectors",
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/connectors`, {
  timeoutMs: 5000,
}),
};
