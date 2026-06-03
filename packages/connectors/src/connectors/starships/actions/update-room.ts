import type { CodeAction } from '../../../framework';

export const updateRoom: CodeAction = {
  name: "update-room",
  description: "Update a room by id (roomId is the backing conversation id)",
  method: "PATCH",
  path: "/rooms/{roomId}",
  parameters: {
    "type": "object",
    "required": [
      "roomId"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "topic": {
        "type": [
          "string",
          "null"
        ]
      },
      "roomId": {
        "type": "string"
      },
      "isPrivate": {
        "type": "boolean"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.patch(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}`, {
  body: {
    "name": args.name,
    "topic": args.topic,
    "isPrivate": args.isPrivate,
  },
  timeoutMs: 20000,
}),
};
