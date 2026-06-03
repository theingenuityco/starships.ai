import type { CodeAction } from '../../../framework';

export const attachViewToChannel: CodeAction = {
  name: "attach-view-to-channel",
  description: "Attach (or detach) a view to a channel by setting attachedViewId",
  method: "PATCH",
  path: "/channels/{channelId}",
  parameters: {
    "type": "object",
    "required": [
      "channelId"
    ],
    "properties": {
      "channelId": {
        "type": "string"
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
  run: (args, ctx) => ctx.http.patch(`/channels/${encodeURIComponent(String(args.channelId ?? ""))}`, {
  body: {
    "attachedViewId": args.attachedViewId,
  },
  timeoutMs: 10000,
}),
};
