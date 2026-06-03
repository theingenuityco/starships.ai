import type { CodeAction } from '../../../framework';

export const updateAgent: CodeAction = {
  name: "update-agent",
  description: "Update an agent by id (partial updates supported)",
  method: "PUT",
  path: "/agents/{agentId}",
  parameters: {
    "type": "object",
    "required": [
      "agentId"
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
      "agentId": {
        "type": "string"
      },
      "timeout": {
        "type": "number"
      },
      "blueprint": {
        "type": "object"
      },
      "maxTokens": {
        "type": "number"
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
  run: (args, ctx) => ctx.http.put(`/agents/${encodeURIComponent(String(args.agentId ?? ""))}`, {
  body: {
    "name": args.name,
    "role": args.role,
    "model": args.model,
    "timeout": args.timeout,
    "blueprint": args.blueprint,
    "maxTokens": args.maxTokens,
    "description": args.description,
    "temperature": args.temperature,
    "systemPrompt": args.systemPrompt,
    "previewPrompts": args.previewPrompts,
  },
  timeoutMs: 10000,
}),
};
