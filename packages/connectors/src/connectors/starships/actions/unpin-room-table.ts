import type { CodeAction } from '../../../framework';

export const unpinRoomTable: CodeAction = {
  name: "unpin-room-table",
  description: "Unpin a table from a room",
  method: "DELETE",
  path: "/rooms/{roomId}/pins/tables/{tableId}",
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
      "tableId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/tables/${encodeURIComponent(String(args.tableId ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
