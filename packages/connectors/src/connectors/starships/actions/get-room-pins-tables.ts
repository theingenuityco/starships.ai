import type { CodeAction } from '../../../framework';

export const getRoomPinsTables: CodeAction = {
  name: "get-room-pins-tables",
  description: "Get pinned tables (resolved to table objects) for a room",
  method: "GET",
  path: "/rooms/{roomId}/pins/tables",
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
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/tables`, {
  timeoutMs: 20000,
}),
};
