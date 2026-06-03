import type { CodeAction } from '../../../framework';

export const addRoomMember: CodeAction = {
  name: "add-room-member",
  description: "Add a member to a private room",
  method: "POST",
  path: "/rooms/{roomId}/members",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
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
      "roomId": {
        "type": "string"
      },
      "userId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/members`, {
  body: {
    "role": args.role,
    "userId": String(args.userId ?? ""),
  },
  timeoutMs: 20000,
}),
};
