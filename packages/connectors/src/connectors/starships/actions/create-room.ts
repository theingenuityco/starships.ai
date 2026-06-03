import type { CodeAction } from '../../../framework';

export const createRoom: CodeAction = {
  name: "create-room",
  description: "Create a conversation-backed room within a starship",
  method: "POST",
  path: "/starships/{starshipId}/rooms",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "slug",
      "name"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "slug": {
        "type": "string"
      },
      "topic": {
        "type": [
          "string",
          "null"
        ]
      },
      "isPrivate": {
        "type": "boolean"
      },
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/rooms`, {
  body: {
    "name": String(args.name ?? ""),
    "slug": String(args.slug ?? ""),
    "topic": args.topic,
    "isPrivate": args.isPrivate,
  },
  timeoutMs: 20000,
}),
};
