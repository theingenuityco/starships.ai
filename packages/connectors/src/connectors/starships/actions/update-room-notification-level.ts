import type { CodeAction } from '../../../framework';

export const updateRoomNotificationLevel: CodeAction = {
  name: "update-room-notification-level",
  description: "Update your notification level for a room (all/mentions/mute)",
  method: "PUT",
  path: "/rooms/{roomId}/notification-level",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "level"
    ],
    "properties": {
      "level": {
        "enum": [
          "all",
          "mentions",
          "mute"
        ],
        "type": "string"
      },
      "roomId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.put(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/notification-level`, {
  body: {
    "level": String(args.level ?? ""),
  },
  timeoutMs: 10000,
}),
};
