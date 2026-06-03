import type { CodeAction } from '../../../framework';

export const getRoomPinsViews: CodeAction = {
  name: "get-room-pins-views",
  description: "Get pinned views (resolved to view objects) for a room",
  method: "GET",
  path: "/rooms/{roomId}/pins/views",
  parameters: {
    "type": "object",
    "required": [
      "roomId"
    ],
    "properties": {
      "roomId": {
        "type": "string",
        "description": "Room id (backing conversation id; defaults to runtimeEnv.CONVERSATION_ID)"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/views`, {
  timeoutMs: 20000,
}),
};
