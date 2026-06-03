import type { CodeAction } from '../../../framework';

export const createConversation: CodeAction = {
  name: "create-conversation",
  description: "Create a conversation (optionally as a child conversation)",
  method: "POST",
  path: "/conversations",
  parameters: {
    "type": "object",
    "required": [
      "starshipId"
    ],
    "properties": {
      "title": {
        "type": "string"
      },
      "agentSlug": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      },
      "parentConversationId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/conversations`, {
  body: {
    "title": args.title,
    "agentSlug": args.agentSlug,
    "starshipId": String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""),
    "parentConversationId": args.parentConversationId,
  },
  timeoutMs: 10000,
}),
};
