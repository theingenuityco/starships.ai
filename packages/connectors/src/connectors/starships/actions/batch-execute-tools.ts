import type { CodeAction } from '../../../framework';

export const batchExecuteTools: CodeAction = {
  name: "batch-execute-tools",
  description: "Execute multiple tool calls in parallel via the Starships batch endpoint",
  method: "POST",
  path: "/conversations/{conversationId}/tool-calls/batch-execute",
  parameters: {
    "type": "object",
    "required": [
      "agentId",
      "tools"
    ],
    "properties": {
      "conversationId": {
        "type": "string"
      },
      "agentId": {
        "type": "string"
      },
      "tools": {
        "type": "array",
        "items": {
          "type": "object",
          "required": [
            "toolSlug",
            "toolCallId"
          ],
          "properties": {
            "toolSlug": {
              "type": "string"
            },
            "toolCallId": {
              "type": "string"
            },
            "args": {
              "type": "object"
            }
          }
        }
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.post(`/conversations/${encodeURIComponent(String(ctx.runtimeEnv.CONVERSATION_ID ?? args.conversationId ?? ""))}/tool-calls/batch-execute`, {
  body: {
    "agentId": String(args.agentId ?? ""),
    "tools": args.tools ?? [],
  },
  // 60 min (intentional, carried over from the connector template): a batch can fan out to
  // many agent tool calls, each of which may itself be long-running, so it needs a wide ceiling.
  timeoutMs: 3600000,
}),
};
