import type { CodeAction } from '../../../framework';

export const deleteView: CodeAction = {
  name: "delete-view",
  description: "Delete a view by id",
  method: "DELETE",
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
  run: (args, ctx) => ctx.http.delete(`/views/${encodeURIComponent(String(args.viewId ?? args.id ?? ""))}`, {
  body: args,
  timeoutMs: 10000,
}),
};
