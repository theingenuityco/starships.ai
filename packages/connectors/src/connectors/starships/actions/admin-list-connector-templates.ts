import type { CodeAction } from '../../../framework';

export const adminListConnectorTemplates: CodeAction = {
  name: "admin-list-connector-templates",
  description: "List connector templates (instance admin only)",
  method: "GET",
  path: "/admin/connector-templates",
  parameters: {
    "type": "object",
    "required": [],
    "properties": {},
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/admin/connector-templates`, {
  timeoutMs: 5000,
}),
};
