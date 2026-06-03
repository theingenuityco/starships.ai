import type { CodeAction } from '../../../framework';

export const listTools: CodeAction = {
  name: "list-tools",
  description: "List tools for a starship",
  method: "GET",
  path: "/starships/{starshipId}/tools",
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tools`, {
  timeoutMs: 5000,
}),
};
