import type { CodeAction } from '../../../framework';

export const adminGetConnectorTemplateAction: CodeAction = {
  name: "admin-get-connector-template-action",
  description: "Get a connector template action definition (instance admin only)",
  method: "GET",
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
  run: (args, ctx) => ctx.http.get(`/admin/connector-templates/${encodeURIComponent(String(args.templateId ?? args.id ?? ""))}/actions/${encodeURIComponent(String(args.actionName ?? args.name ?? ""))}`, {
  timeoutMs: 10000,
}),
};
