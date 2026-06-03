import type { CodeAction } from '../../../framework';

export const unassignRoomTool: CodeAction = {
  name: "unassign-room-tool",
  description: "Unassign a tool from a room",
  method: "DELETE",
  path: "/rooms/{roomId}/tools/{toolId}",
  parameters: {
    "type": "object",
    "required": [
      "roomId",
      "toolId"
    ],
    "properties": {
      "roomId": {
        "type": "string"
      },
      "toolId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/tools/${encodeURIComponent(String(args.toolId ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
