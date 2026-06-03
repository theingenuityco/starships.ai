import type { CodeAction } from '../../../framework';

export const removeChannelMember: CodeAction = {
  name: "remove-channel-member",
  description: "Remove a member from a private channel",
  method: "DELETE",
  path: "/channels/{channelId}/members/{userId}",
  parameters: {
    "type": "object",
    "required": [
      "channelId",
      "userId"
    ],
    "properties": {
      "userId": {
        "type": "string"
      },
      "channelId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/channels/${encodeURIComponent(String(args.channelId ?? args.id ?? ""))}/members/${encodeURIComponent(String(args.userId ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
