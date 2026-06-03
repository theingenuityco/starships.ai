import type { CodeAction } from '../../../framework';

export const listChannels: CodeAction = {
  name: "list-channels",
  description: "List channels for a starship",
  method: "GET",
  path: "/starships/{starshipId}/channels",
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/channels`, {
  timeoutMs: 10000,
}),
};
