import type { CodeAction } from '../../../framework';

export const getTool: CodeAction = {
  name: "get-tool",
  description: "Get a tool by slug within a starship",
  method: "GET",
  path: "/starships/{starshipId}/tools/{slug}",
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tools/${encodeURIComponent(String(args.slug ?? ""))}`, {
  timeoutMs: 5000,
}),
};
