import type { CodeAction } from '../../../framework';

export const adminUpdateConnectorTemplate: CodeAction = {
  name: "admin-update-connector-template",
  description: "Update a connector template (instance admin only)",
  method: "PUT",
  path: "/admin/connector-templates/{id}",
  parameters: {
    "type": "object",
    "required": [
      "id"
    ],
    "properties": {
      "id": {
        "type": "string"
      },
      "auth": {
        "type": "object"
      },
      "name": {
        "type": "string"
      },
      "baseUrl": {
        "type": "string"
      },
      "version": {
        "type": "string"
      },
      "authType": {
        "enum": [
          "oauth2",
          "api_key",
          "platform_jwt",
          "none"
        ],
        "type": "string"
      },
      "category": {
        "type": "string"
      },
      "endpoints": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "isEnabled": {
        "type": "boolean"
      },
      "rateLimit": {
        "type": "object"
      },
      "variables": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "description": {
        "type": "string"
      },
      "metadataSchema": {
        "type": "object"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.put(`/admin/connector-templates/${encodeURIComponent(String(args.id ?? ''))}`, {
  body: {
    "auth": args.auth,
    "name": args.name,
    "baseUrl": args.baseUrl,
    "version": args.version,
    "authType": args.authType,
    "category": args.category,
    "endpoints": args.endpoints,
    "isEnabled": args.isEnabled,
    "rateLimit": args.rateLimit,
    "variables": args.variables,
    "description": args.description,
    "metadataSchema": args.metadataSchema,
  },
  timeoutMs: 10000,
}),
};
