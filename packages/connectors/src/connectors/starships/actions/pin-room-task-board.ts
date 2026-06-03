import type { CodeAction } from '../../../framework';

export const pinRoomTaskBoard: CodeAction = {
  name: "pin-room-task-board",
  description: "Pin a task board to a room (optionally at a position)",
  method: "POST",
  path: "/rooms/{roomId}/pins/task-boards",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "boardId"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "boardId": {
        "type": "string"
      },
      "position": {
        "type": "number"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/task-boards`, {
  body: {
    "boardId": String(args.boardId ?? ""),
    "position": args.position,
  },
  timeoutMs: 20000,
}),
};
