import type { CodeAction } from '../../../framework';

export const listConversationChildren: CodeAction = {
  name: "list-conversation-children",
  description: "List child conversations (threads) for a parent conversation",
  method: "GET",
  path: "/conversations/{conversationId}/children",
  parameters: {
    "type": "object",
    "required": [
      "conversationId"
    ],
    "properties": {
      "q": {
        "type": "string",
        "description": "Optional case-insensitive search on child conversation title"
      },
      "limit": {
        "type": "number",
        "description": "Page size (optional)"
      },
      "beforeId": {
        "type": "string",
        "description": "Cursor (conversation id). Must be provided together with beforeUpdatedAt."
      },
      "conversationId": {
        "type": "string",
        "description": "Parent conversation id (defaults to runtimeEnv.CONVERSATION_ID)"
      },
      "beforeUpdatedAt": {
        "type": "string",
        "description": "Cursor (ISO datetime). Must be provided together with beforeId."
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/conversations/${encodeURIComponent(String(args.conversationId ?? args.parentConversationId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/children`, {
  query: {
    "q": args.q ? String(args.q) : undefined,
    "limit": args.limit === undefined ? undefined : Number(args.limit),
    "beforeId": args.beforeId ? String(args.beforeId) : undefined,
    "beforeUpdatedAt": args.beforeUpdatedAt ? String(args.beforeUpdatedAt) : undefined,
  },
  timeoutMs: 20000,
}),
};
