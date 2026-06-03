import type { CodeAction } from '../../../framework';

export const updateView: CodeAction = {
  name: "update-view",
  description: "Update a view by id (partial updates supported)",
  method: "PUT",
  path: "/views/{viewId}",
  parameters: {
    "type": "object",
    "required": [
      "viewId"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "root": {
        "type": "object"
      },
      "viewId": {
        "type": "string"
      },
      "version": {
        "type": "number"
      },
      "description": {
        "type": "string"
      },
      "runtimeConfig": {
        "type": "object"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.put(`/views/${encodeURIComponent(String(args.viewId ?? args.id ?? ""))}`, {
  body: {
    "name": args.name,
    "root": args.root,
    "version": args.version,
    "description": args.description,
    "runtimeConfig": args.runtimeConfig,
  },
  timeoutMs: 10000,
}),
};
