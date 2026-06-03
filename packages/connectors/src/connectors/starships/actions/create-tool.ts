import type { CodeAction } from '../../../framework';

export const createTool: CodeAction = {
  name: "create-tool",
  description: "Create a tool within a starship",
  method: "POST",
  path: "/starships/{starshipId}/tools",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "name",
      "description"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "status": {
        "type": "string"
      },
      "blueprint": {
        "type": "object"
      },
      "isEnabled": {
        "type": "boolean"
      },
      "parameters": {
        "type": "object"
      },
      "starshipId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "configuration": {
        "type": "object"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/tools`, {
  body: {
    "name": args.name,
    "status": args.status,
    "blueprint": args.blueprint,
    "isEnabled": args.isEnabled,
    "parameters": args.parameters,
    "description": args.description,
    "configuration": args.configuration,
  },
  timeoutMs: 10000,
}),
};
