import type { CodeAction } from '../../../framework';

export const updateWidget: CodeAction = {
  name: "update-widget",
  description: "Update a widget by id",
  method: "PUT",
  path: "/widgets/{widgetId}",
  parameters: {
    "type": "object",
    "required": [
      "widgetId"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "props": {
        "type": "object"
      },
      "widgetId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.put(`/widgets/${encodeURIComponent(String(args.widgetId ?? ""))}`, {
  body: {
    "name": args.name,
    "props": args.props,
    "description": args.description,
  },
  timeoutMs: 5000,
}),
};
