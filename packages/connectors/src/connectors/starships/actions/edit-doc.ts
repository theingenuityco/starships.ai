import type { CodeAction } from '../../../framework';

export const editDoc: CodeAction = {
  name: "edit-doc",
  description: "Update a doc by id (title, content, archived)",
  method: "PATCH",
  path: "/starships/{starshipId}/docs/{docId}",
  parameters: {
    "type": "object",
    "required": [
      "docId"
    ],
    "properties": {
      "docId": {
        "type": "string"
      },
      "title": {
        "type": "string"
      },
      "content": {
        "type": "string"
      },
      "archived": {
        "type": "boolean"
      },
      "starshipId": {
        "type": "string"
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.patch(`/starships/${encodeURIComponent(String(args.starshipId ?? ctx.runtimeEnv.STARSHIP_ID ?? ""))}/docs/${encodeURIComponent(String(args.docId ?? ""))}`, {
  body: {
    "title": args.title,
    "content": args.content,
    "archived": args.archived,
  },
  timeoutMs: 10000,
}),
};
