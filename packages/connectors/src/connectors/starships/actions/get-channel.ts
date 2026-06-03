import type { CodeAction } from '../../../framework';

export const getChannel: CodeAction = {
  name: "get-channel",
  description: "Get a channel by id (conversation id)",
  method: "GET",
  path: "/channels/{channelId}",
  parameters: {
    "type": "object",
    "required": [
      "channelId"
    ],
    "properties": {
      "channelId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/channels/${encodeURIComponent(String(args.channelId ?? args.id ?? ""))}`, {
  timeoutMs: 10000,
}),
};
