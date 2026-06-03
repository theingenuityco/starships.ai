import type { CodeAction } from '../../../framework';

export const sendMessage: CodeAction = {
  name: "send-message",
  description: "Send a message to a conversation",
  method: "POST",
  path: "/conversations/{conversationId}/messages",
  parameters: {
    "type": "object",
    "required": [
      "conversationId",
      "content"
    ],
    "properties": {
      "sync": {
        "type": "boolean"
      },
      "content": {
        "type": "string"
      },
      "conversationId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/conversations/${encodeURIComponent(String(args.conversationId ?? ""))}/messages`, {
  body: {
    "sync": args.sync,
    "content": args.content,
  },
  timeoutMs: 300000,
}),
};
