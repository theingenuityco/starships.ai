import type { CodeAction } from '../../../framework';

export const getView: CodeAction = {
  name: "get-view",
  description: "Get a view by id",
  method: "GET",
  path: "/views/{viewId}",
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
  run: (args, ctx) => ctx.http.get(`/views/${encodeURIComponent(String(args.viewId ?? args.id ?? ""))}`, {
  timeoutMs: 5000,
}),
};
