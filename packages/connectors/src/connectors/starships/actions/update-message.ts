import type { CodeAction } from '../../../framework';

export const updateMessage: CodeAction = {
  name: "update-message",
  description: "Update a message by id (supports linking to a child conversation via linkedConversationId)",
  method: "PUT",
  path: "/messages/{messageId}",
  parameters: {
    "type": "object",
    "required": [
      "messageId"
    ],
    "properties": {
      "messageId": {
        "type": "string",
        "description": "Message id to update"
      },
      "linkedConversationId": {
        "type": "string",
        "description": "Optional: link this message to a child conversation (thread)"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.put(`/messages/${encodeURIComponent(String(args.messageId ?? args.id ?? ""))}`, {
  body: {
    "linkedConversationId": args.linkedConversationId,
  },
  timeoutMs: 20000,
}),
};
