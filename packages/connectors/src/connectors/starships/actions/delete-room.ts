import type { CodeAction } from '../../../framework';

export const deleteRoom: CodeAction = {
  name: "delete-room",
  description: "Delete a room by id (deletes the backing conversation)",
  method: "DELETE",
  path: "/rooms/{roomId}",
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
  run: (args, ctx) => ctx.http.delete(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
