import type { CodeAction } from '../../../framework';

export const reorderRoomPinsTaskBoards: CodeAction = {
  name: "reorder-room-pins-task-boards",
  description: "Reorder pinned task boards within a room",
  method: "POST",
  path: "/rooms/{roomId}/pins/task-boards/reorder",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "boardIds"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "boardIds": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/task-boards/reorder`, {
  body: {
    "boardIds": args.boardIds ?? [],
  },
  timeoutMs: 30000,
}),
};
