import type { CodeAction } from '../../../framework';

export const createChannel: CodeAction = {
  name: "create-channel",
  description: "Create a channel (conversation-backed) within a starship",
  method: "POST",
  path: "/starships/{starshipId}/channels",
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
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/channels`, {
  body: {
    "name": String(args.name ?? ""),
    "slug": String(args.slug ?? ""),
    "topic": args.topic,
    "isPrivate": args.isPrivate,
  },
  timeoutMs: 20000,
}),
};
