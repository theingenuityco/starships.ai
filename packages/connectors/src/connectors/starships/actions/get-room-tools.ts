import type { CodeAction } from '../../../framework';

export const getRoomTools: CodeAction = {
  name: "get-room-tools",
  description: "List assigned tools for a room (resolved to tool objects)",
  method: "GET",
  path: "/rooms/{roomId}/tools",
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
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/tools`, {
  timeoutMs: 20000,
}),
};
