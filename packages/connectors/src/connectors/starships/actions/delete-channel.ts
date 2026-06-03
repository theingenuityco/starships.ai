import type { CodeAction } from '../../../framework';

export const deleteChannel: CodeAction = {
  name: "delete-channel",
  description: "Delete a channel by id (conversation id)",
  method: "DELETE",
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
  run: (args, ctx) => ctx.http.delete(`/channels/${encodeURIComponent(String(args.channelId ?? args.id ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
