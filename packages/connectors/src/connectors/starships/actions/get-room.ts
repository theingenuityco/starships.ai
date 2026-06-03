import type { CodeAction } from '../../../framework';

export const getRoom: CodeAction = {
  name: "get-room",
  description: "Get a room by id (roomId is the backing conversation id)",
  method: "GET",
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
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}`, {
  timeoutMs: 10000,
}),
};
