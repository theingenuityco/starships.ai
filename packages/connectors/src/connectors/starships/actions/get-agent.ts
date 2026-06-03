import type { CodeAction } from '../../../framework';

export const getAgent: CodeAction = {
  name: "get-agent",
  description: "Get an agent by slug within a starship",
  method: "GET",
  path: "/starships/{starshipId}/agents/{slug}",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "slug"
    ],
    "properties": {
      "slug": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/agents/${encodeURIComponent(String(args.slug ?? ""))}`, {
  timeoutMs: 5000,
}),
};
