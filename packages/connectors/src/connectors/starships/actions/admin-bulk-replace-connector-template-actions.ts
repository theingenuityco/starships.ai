import type { CodeAction } from '../../../framework';

export const adminBulkReplaceConnectorTemplateActions: CodeAction = {
  name: "admin-bulk-replace-connector-template-actions",
  description: "Replace all connector template actions (instance admin only)",
  method: "PUT",
  path: "/admin/connector-templates/{templateId}/actions",
  parameters: {
    "type": "object",
    "required": [
      "templateId",
      "actions"
    ],
    "properties": {
      "actions": {
        "type": "array",
        "items": {
          "type": "object"
        },
        "description": "ConnectorEndpointV2[]"
      },
      "templateId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.put(`/admin/connector-templates/${encodeURIComponent(String(args.templateId ?? args.id ?? ""))}/actions`, {
  body: {
    "actions": args.actions,
  },
  timeoutMs: 60000,
}),
};
