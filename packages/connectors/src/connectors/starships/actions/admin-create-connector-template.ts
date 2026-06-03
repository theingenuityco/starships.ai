import type { CodeAction } from '../../../framework';

export const adminCreateConnectorTemplate: CodeAction = {
  name: "admin-create-connector-template",
  description: "Create a connector template (instance admin only)",
  method: "POST",
  path: "/admin/connector-templates",
  parameters: {
    "type": "object",
    "required": [
      "provider",
      "name",
      "description",
      "authType",
      "baseUrl",
      "auth",
      "endpoints"
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
      "slug": {
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
      "provider": {
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
  run: (args, ctx) => ctx.http.post(`/admin/connector-templates`, {
  body: {
    "id": args.id,
    "auth": args.auth,
    "name": args.name,
    "slug": args.slug,
    "baseUrl": args.baseUrl,
    "version": args.version,
    "authType": args.authType,
    "category": args.category,
    "provider": args.provider,
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
