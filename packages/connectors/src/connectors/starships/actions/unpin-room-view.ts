import type { CodeAction } from '../../../framework';

export const unpinRoomView: CodeAction = {
  name: "unpin-room-view",
  description: "Unpin a view from a room",
  method: "DELETE",
  path: "/rooms/{roomId}/pins/views/{viewId}",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "viewId"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "viewId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/pins/views/${encodeURIComponent(String(args.viewId ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
