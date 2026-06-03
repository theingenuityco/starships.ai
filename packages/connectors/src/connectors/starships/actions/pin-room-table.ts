import type { CodeAction } from '../../../framework';

export const pinRoomTable: CodeAction = {
  name: "pin-room-table",
  description: "Pin a table to a room (optionally at a position)",
  method: "POST",
  path: "/rooms/{roomId}/pins/tables",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "tableId"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "position": {
        "type": "number"
      },
      "tableId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/tables`, {
  body: {
    "position": args.position,
    "tableId": String(args.tableId ?? ""),
  },
  timeoutMs: 20000,
}),
};
