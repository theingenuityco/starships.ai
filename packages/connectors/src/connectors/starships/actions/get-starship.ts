import type { CodeAction } from '../../../framework';

export const getStarship: CodeAction = {
  name: "get-starship",
  description: "Get a starship by id (or slug)",
  method: "GET",
  path: "/starships/{starshipId}",
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}`, {
  timeoutMs: 5000,
}),
};
