import type { CodeAction } from '../../../framework';

export const deleteTaskColumn: CodeAction = {
  name: "delete-task-column",
  description: "Delete a task column",
  method: "DELETE",
  path: "/task-columns/{columnId}",
  parameters: {
    "type": "object",
    "required": [
      "columnId"
    ],
    "properties": {
      "columnId": {
        "type": "string"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.delete(`/task-columns/${encodeURIComponent(String(args.columnId ?? args.id ?? ""))}`, {
  body: args,
  timeoutMs: 10000,
}),
};
