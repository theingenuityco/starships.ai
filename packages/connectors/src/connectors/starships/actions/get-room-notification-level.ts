import type { CodeAction } from '../../../framework';

export const getRoomNotificationLevel: CodeAction = {
  name: "get-room-notification-level",
  description: "Get your notification level for a room (all/mentions/mute)",
  method: "GET",
  path: "/rooms/{roomId}/notification-level",
  parameters: {
    "type": "object",
    "required": [
      "roomId"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/notification-level`, {
  timeoutMs: 10000,
}),
};
