import type { CodeAction } from '../../../framework';

export const updateViewWidget: CodeAction = {
  name: "update-view-widget",
  description: "Upsert a single view widget node (merges props on update)",
  method: "PATCH",
  path: "/views/{viewId}/widgets/{nodeId}",
  parameters: {
    "type": "object",
    "required": [
      "viewId",
      "nodeId"
    ],
    "properties": {
      "type": {
        "type": "string"
      },
      "props": {
        "type": "object"
      },
      "nodeId": {
        "type": "string"
      },
      "viewId": {
        "type": "string"
      },
      "bindings": {
        "type": [
          "object",
          "null"
        ]
      },
      "handlers": {
        "type": [
          "object",
          "null"
        ]
      },
      "permissions": {
        "type": [
          "object",
          "null"
        ]
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.patch(`/views/${encodeURIComponent(String(args.viewId ?? args.id ?? ""))}/widgets/${encodeURIComponent(String(args.nodeId ?? ""))}`, {
  body: {
    "type": args.type,
    "props": args.props,
    "bindings": args.bindings,
    "handlers": args.handlers,
    "permissions": args.permissions,
  },
  timeoutMs: 10000,
}),
};
