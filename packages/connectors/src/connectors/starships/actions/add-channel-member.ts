import type { CodeAction } from '../../../framework';

export const addChannelMember: CodeAction = {
  name: "add-channel-member",
  description: "Add a member to a private channel",
  method: "POST",
  path: "/channels/{channelId}/members",
  parameters: {
    "type": "object",
    "required": [
      "channelId",
      "userId"
    ],
    "properties": {
      "role": {
        "enum": [
          "member",
          "admin"
        ],
        "type": "string"
      },
      "userId": {
        "type": "string"
      },
      "channelId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/channels/${encodeURIComponent(String(args.channelId ?? args.id ?? ""))}/members`, {
  body: {
    "role": args.role,
    "userId": String(args.userId ?? ""),
  },
  timeoutMs: 20000,
}),
};
