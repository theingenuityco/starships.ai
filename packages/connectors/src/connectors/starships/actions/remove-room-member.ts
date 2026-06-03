import type { CodeAction } from '../../../framework';

export const removeRoomMember: CodeAction = {
  name: "remove-room-member",
  description: "Remove a member from a private room",
  method: "DELETE",
  path: "/rooms/{roomId}/members/{userId}",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "userId"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "userId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/members/${encodeURIComponent(String(args.userId ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
