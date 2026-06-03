import type { CodeAction } from '../../../framework';

export const getAttachmentsPreviewUrls: CodeAction = {
  name: "get-attachments-preview-urls",
  description: "Get attachment metadata + previewUrl (presigned download URLs) for one or more attachment ids",
  method: "GET",
  path: "/attachments",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "ids"
    ],
    "properties": {
      "ids": {
        "oneOf": [
          {
            "type": "string"
          },
          {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        ]
      },
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/attachments`, {
  query: {
    "ids": Array.isArray(args.ids) ? args.ids.join(",") : String(args.ids ?? ""),
    "starshipId": String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""),
  },
  timeoutMs: 15000,
}),
};
