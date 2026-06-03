import type { CodeAction } from '../../../framework';

export const reorderRoomPinsViews: CodeAction = {
  name: "reorder-room-pins-views",
  description: "Reorder pinned views within a room",
  method: "POST",
  path: "/rooms/{roomId}/pins/views/reorder",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "viewIds"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "viewIds": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/views/reorder`, {
  body: {
    "viewIds": args.viewIds ?? [],
  },
  timeoutMs: 30000,
}),
};
