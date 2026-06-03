import type { CodeAction } from '../../../framework';

export const createAgent: CodeAction = {
  name: "create-agent",
  description: "Create an agent (draft) for a starship",
  method: "POST",
  path: "/agents",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "name",
      "role"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "role": {
        "type": "string"
      },
      "model": {
        "type": "string"
      },
      "maxTokens": {
        "type": "number"
      },
      "starshipId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "temperature": {
        "type": "number"
      },
      "systemPrompt": {
        "type": "string"
      },
      "previewPrompts": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/agents`, {
  body: {
    "name": args.name,
    "role": args.role,
    "model": args.model,
    "maxTokens": args.maxTokens,
    "starshipId": String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""),
    "description": args.description,
    "temperature": args.temperature,
    "systemPrompt": args.systemPrompt,
    "previewPrompts": args.previewPrompts,
  },
  timeoutMs: 10000,
}),
};
