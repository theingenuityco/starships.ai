import type { CodeAction } from '../../../framework';

export const adminDeleteConnectorTemplateAction: CodeAction = {
  name: "admin-delete-connector-template-action",
  description: "Delete a connector template action (instance admin only)",
  method: "DELETE",
  path: "/admin/connector-templates/{templateId}/actions/{actionName}",
  parameters: {
    "type": "object",
    "required": [
      "templateId",
      "actionName"
    ],
    "properties": {
      "actionName": {
        "type": "string"
      },
      "templateId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/admin/connector-templates/${encodeURIComponent(String(args.templateId ?? args.id ?? ""))}/actions/${encodeURIComponent(String(args.actionName ?? args.name ?? ""))}`, {
  body: args,
  timeoutMs: 20000,
}),
};
