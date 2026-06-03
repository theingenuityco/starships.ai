import type { CodeAction } from '../../../framework';

export const pinRoomView: CodeAction = {
  name: "pin-room-view",
  description: "Pin a view to a room (optionally at a position)",
  method: "POST",
  path: "/rooms/{roomId}/pins/views",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "viewId"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "viewId": {
        "type": "string"
      },
      "position": {
        "type": "number"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/views`, {
  body: {
    "viewId": String(args.viewId ?? ""),
    "position": args.position,
  },
  timeoutMs: 20000,
}),
};
