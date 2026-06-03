import type { CodeAction } from '../../../framework';

export const getRoomPinsTaskBoards: CodeAction = {
  name: "get-room-pins-task-boards",
  description: "Get pinned task boards (resolved to task board objects) for a room",
  method: "GET",
  path: "/rooms/{roomId}/pins/task-boards",
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
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/task-boards`, {
  timeoutMs: 20000,
}),
};
