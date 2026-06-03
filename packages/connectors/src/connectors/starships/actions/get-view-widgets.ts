import type { CodeAction } from '../../../framework';

export const getViewWidgets: CodeAction = {
  name: "get-view-widgets",
  description: "List persisted view widget nodes for a view",
  method: "GET",
  path: "/views/{viewId}/widgets",
  parameters: {
    "type": "object",
    "required": [
      "viewId"
    ],
    "properties": {
      "viewId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/views/${encodeURIComponent(String(args.viewId ?? args.id ?? ""))}/widgets`, {
  timeoutMs: 5000,
}),
};
