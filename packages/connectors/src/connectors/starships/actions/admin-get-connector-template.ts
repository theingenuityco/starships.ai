import type { CodeAction } from '../../../framework';

export const adminGetConnectorTemplate: CodeAction = {
  name: "admin-get-connector-template",
  description: "Get a connector template (instance admin only)",
  method: "GET",
  path: "/admin/connector-templates/{id}",
  parameters: {
    "type": "object",
    "required": [
      "id"
    ],
    "properties": {
      "id": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/admin/connector-templates/${encodeURIComponent(String(args.id ?? ''))}`, {
  timeoutMs: 5000,
}),
};
