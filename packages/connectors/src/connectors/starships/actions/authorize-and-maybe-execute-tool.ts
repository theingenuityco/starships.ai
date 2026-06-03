import type { CodeAction } from '../../../framework';

export const authorizeAndMaybeExecuteTool: CodeAction = {
  name: "authorize-and-maybe-execute-tool",
  description: "Authorize and optionally execute a tool call via the Starships API",
  method: "POST",
  path: "/conversations/{conversationId}/tool-calls/authorize-and-maybe-execute",
  parameters: {
    "type": "object",
    "required": [
      "agentId",
      "toolSlug",
      "toolCallId",
      "args"
    ],
    "properties": {
      "args": {
        "type": "object"
      },
      "agentId": {
        "type": "string"
      },
      "toolSlug": {
        "type": "string"
      },
      "toolCallId": {
        "type": "string"
      },
      "conversationId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/conversations/${encodeURIComponent(String(ctx.runtimeEnv.CONVERSATION_ID ?? args.conversationId ?? ""))}/tool-calls/authorize-and-maybe-execute`, {
  body: {
    "args": args.args ?? {},
    "agentId": String(args.agentId ?? ""),
    "toolSlug": String(args.toolSlug ?? ""),
    "toolCallId": String(args.toolCallId ?? ""),
  },
  timeoutMs: 120000,
}),
};
