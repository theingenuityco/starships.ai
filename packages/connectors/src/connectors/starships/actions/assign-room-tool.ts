import type { CodeAction } from '../../../framework';

export const assignRoomTool: CodeAction = {
  name: "assign-room-tool",
  description: "Assign a tool to a room",
  method: "POST",
  path: "/rooms/{roomId}/tools",
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
      },
      "permission": {
        "enum": [
          "allow",
          "ask",
          "deny"
        ],
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/tools`, {
  body: {
    "toolId": String(args.toolId ?? ""),
    "permission": args.permission,
  },
  timeoutMs: 20000,
}),
};
