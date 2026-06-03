import type { CodeAction } from '../../../framework';

export const adminListConnectorTemplateActions: CodeAction = {
  name: "admin-list-connector-template-actions",
  description: "List connector template actions (instance admin only)",
  method: "GET",
  path: "/admin/connector-templates/{templateId}/actions",
  parameters: {
    "type": "object",
    "required": [
      "templateId"
    ],
    "properties": {
      "q": {
        "type": "string",
        "description": "Optional search query (name/path/description)"
      },
      "limit": {
        "type": "number",
        "description": "Page size (1-200)"
      },
      "offset": {
        "type": "number",
        "description": "Page offset (0+)"
      },
      "templateId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/admin/connector-templates/${encodeURIComponent(String(args.templateId ?? args.id ?? ""))}/actions`, {
  query: {
    "q": args.q ? String(args.q) : undefined,
    "limit": args.limit === undefined ? undefined : Number(args.limit),
    "offset": args.offset === undefined ? undefined : Number(args.offset),
  },
  timeoutMs: 10000,
}),
};
