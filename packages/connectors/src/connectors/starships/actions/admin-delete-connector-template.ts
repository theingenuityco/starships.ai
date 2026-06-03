import type { CodeAction } from '../../../framework';

export const adminDeleteConnectorTemplate: CodeAction = {
  name: "admin-delete-connector-template",
  description: "Delete a connector template (instance admin only)",
  method: "DELETE",
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
  run: (args, ctx) => ctx.http.delete(`/admin/connector-templates/${encodeURIComponent(String(args.id ?? ''))}`, {
  body: args,
  timeoutMs: 5000,
}),
};
