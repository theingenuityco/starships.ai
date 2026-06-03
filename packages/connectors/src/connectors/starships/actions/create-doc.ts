import type { CodeAction } from '../../../framework';

export const createDoc: CodeAction = {
  name: "create-doc",
  description: "Create a doc (unstructured markdown) within a starship",
  method: "POST",
  path: "/starships/{starshipId}/docs",
  parameters: {
    "type": "object",
    "required": [
      "title",
      "content"
    ],
    "properties": {
      "title": {
        "type": "string"
      },
      "content": {
        "type": "string"
      },
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.post(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/docs`, {
  body: {
    "title": args.title,
    "content": args.content,
  },
  timeoutMs: 10000,
}),
};
