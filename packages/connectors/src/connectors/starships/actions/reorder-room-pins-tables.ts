import type { CodeAction } from '../../../framework';

export const reorderRoomPinsTables: CodeAction = {
  name: "reorder-room-pins-tables",
  description: "Reorder pinned tables within a room",
  method: "POST",
  path: "/rooms/{roomId}/pins/tables/reorder",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "tableIds"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "tableIds": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/tables/reorder`, {
  body: {
    "tableIds": args.tableIds ?? [],
  },
  timeoutMs: 30000,
}),
};
