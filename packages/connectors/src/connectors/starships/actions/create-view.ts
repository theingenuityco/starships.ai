import type { CodeAction } from '../../../framework';

export const createView: CodeAction = {
  name: "create-view",
  description: "Create a view",
  method: "POST",
  path: "/views",
  parameters: {
    "type": "object",
    "required": [
      "starshipId",
      "name",
      "description"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "root": {
        "type": "object"
      },
      "slug": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "runtimeConfig": {
        "type": "object"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/views`, {
  body: {
    "name": args.name,
    "root": args.root,
    "slug": args.slug,
    "starshipId": String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""),
    "description": args.description ?? "",
    "runtimeConfig": args.runtimeConfig,
  },
  timeoutMs: 10000,
}),
};
