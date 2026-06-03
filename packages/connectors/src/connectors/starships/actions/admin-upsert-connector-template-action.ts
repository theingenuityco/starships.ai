import type { CodeAction } from '../../../framework';

export const adminUpsertConnectorTemplateAction: CodeAction = {
  name: "admin-upsert-connector-template-action",
  description: "Create or update a connector template action (instance admin only)",
  method: "PUT",
  path: "/admin/connector-templates/{templateId}/actions/{actionName}",
  parameters: {
    "type": "object",
    "required": [
      "templateId",
      "actionName",
      "action"
    ],
    "properties": {
      "action": {
        "type": "object",
        "description": "ConnectorEndpointV2 shape"
      },
      "ordinal": {
        "type": "number"
      },
      "actionName": {
        "type": "string"
      },
      "templateId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.put(`/admin/connector-templates/${encodeURIComponent(String(args.templateId ?? args.id ?? ""))}/actions/${encodeURIComponent(String(args.actionName ?? args.name ?? ""))}`, {
  body: {
    "action": args.action,
    "ordinal": args.ordinal,
  },
  timeoutMs: 20000,
}),
};
