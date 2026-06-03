import type { CodeAction } from '../../../framework';

export const updateTaskColumn: CodeAction = {
  name: "update-task-column",
  description: "Update a task column",
  method: "PATCH",
  path: "/task-columns/{columnId}",
  parameters: {
    "type": "object",
    "required": [
      "columnId"
    ],
    "properties": {
      "key": {
        "type": [
          "string",
          "null"
        ]
      },
      "pos": {
        "type": "number"
      },
      "title": {
        "type": "string"
      },
      "columnId": {
        "type": "string"
      },
      "wipLimit": {
        "type": [
          "number",
          "null"
        ]
      }
    },
    "additionalProperties": true
  },
  run: (args, ctx) => ctx.http.patch(`/task-columns/${encodeURIComponent(String(args.columnId ?? args.id ?? ""))}`, {
  body: {
    "key": args.key,
    "pos": args.pos,
    "title": args.title,
    "wipLimit": args.wipLimit,
  },
  timeoutMs: 10000,
}),
};
