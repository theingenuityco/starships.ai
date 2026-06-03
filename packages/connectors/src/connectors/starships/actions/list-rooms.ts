import type { CodeAction } from '../../../framework';

export const listRooms: CodeAction = {
  name: "list-rooms",
  description: "List rooms for a starship (visibility-filtered)",
  method: "GET",
  path: "/starships/{starshipId}/rooms",
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
  run: (args, ctx) => ctx.http.get(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/rooms`, {
  timeoutMs: 10000,
}),
};
