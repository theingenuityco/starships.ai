import type { CodeAction } from '../../../framework';

export const patchViewRoot: CodeAction = {
  name: "patch-view-root",
  description: "Apply JSON Patch ops to persisted structure-only view root",
  method: "PATCH",
  path: "/views/{viewId}/root",
  parameters: {
    "type": "object",
    "required": [
      "viewId",
      "patch"
    ],
    "properties": {
      "patch": {
        "type": "array"
      },
      "viewId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.patch(`/views/${encodeURIComponent(String(args.viewId ?? args.id ?? ""))}/root`, {
  body: {
    "patch": args.patch,
  },
  timeoutMs: 10000,
}),
};
