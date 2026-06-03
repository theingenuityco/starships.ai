import type { CodeAction } from '../../../framework';

export const getRoomPins: CodeAction = {
  name: "get-room-pins",
  description: "List pinned resources for a room (views/tables/taskBoards/agents/tools)",
  method: "GET",
  path: "/rooms/{roomId}/pins",
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
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins`, {
  timeoutMs: 20000,
}),
};
