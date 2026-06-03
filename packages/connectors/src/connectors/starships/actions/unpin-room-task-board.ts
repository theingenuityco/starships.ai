import type { CodeAction } from '../../../framework';

export const unpinRoomTaskBoard: CodeAction = {
  name: "unpin-room-task-board",
  description: "Unpin a task board from a room",
  method: "DELETE",
  path: "/rooms/{roomId}/pins/task-boards/{boardId}",
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
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/task-boards/${encodeURIComponent(String(args.boardId ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
