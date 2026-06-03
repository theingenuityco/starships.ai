import type { CodeAction } from '../../../framework';

export const getConversationMessages: CodeAction = {
  name: "get-conversation-messages",
  description: "Get conversation messages (supports tail-offset and keyset cursor pagination)",
  method: "GET",
  path: "/conversations/{conversationId}/messages",
  parameters: {
    "type": "object",
    "properties": {
      "limit": {
        "type": "number",
        "description": "Maximum messages to return (1-200)"
      },
      "offset": {
        "type": "number",
        "description": "Tail offset (skip N most recent messages)"
      },
      "beforeId": {
        "type": "string",
        "description": "Keyset cursor id (must be provided with beforeCreatedAt)"
      },
      "conversationId": {
        "type": "string",
        "description": "Conversation id (defaults to runtimeEnv.CONVERSATION_ID)"
      },
      "orderDirection": {
        "type": "string",
        "description": "Optional orderDirection: asc or desc"
      },
      "beforeCreatedAt": {
        "type": "string",
        "description": "Keyset cursor timestamp (must be provided with beforeId)"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/conversations/${encodeURIComponent(String(args.conversationId ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/messages`, {
  query: {
    "limit": Number(args.limit ?? 50),
    "offset": Number(args.offset ?? 0),
    "beforeId": args.beforeId,
    "orderDirection": args.orderDirection,
    "beforeCreatedAt": args.beforeCreatedAt,
  },
  timeoutMs: 10000,
}),
};
