import type { CodeAction } from '../../../framework';

export const updateTool: CodeAction = {
  name: "update-tool",
  description: "Update a tool by id (partial updates supported)",
  method: "PUT",
  path: "/tools/{toolId}",
  parameters: {
    "type": "object",
    "required": [
      "toolId"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "slug": {
        "type": "string"
      },
      "status": {
        "type": "string"
      },
      "toolId": {
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
      "description": {
        "type": "string"
      },
      "configuration": {
        "type": "object"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.put(`/tools/${encodeURIComponent(String(args.toolId ?? ""))}`, {
  body: {
    "name": args.name,
    "slug": args.slug,
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
