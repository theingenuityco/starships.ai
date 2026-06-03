import type { CodeAction } from '../../../framework';

export const updateChannel: CodeAction = {
  name: "update-channel",
  description: "Update a channel by id (conversation id)",
  method: "PATCH",
  path: "/channels/{channelId}",
  parameters: {
    "type": "object",
    "required": [
      "channelId"
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
      "channelId": {
        "type": "string"
      },
      "isPrivate": {
        "type": "boolean"
      },
      "attachedViewId": {
        "type": [
          "string",
          "null"
        ]
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.patch(`/channels/${encodeURIComponent(String(args.channelId ?? args.id ?? ""))}`, {
  body: {
    "name": args.name,
    "topic": args.topic,
    "isPrivate": args.isPrivate,
    "attachedViewId": args.attachedViewId,
  },
  timeoutMs: 20000,
}),
};
