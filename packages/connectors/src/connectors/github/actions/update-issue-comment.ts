import type { CodeAction } from '../../../framework';

export const updateIssueComment: CodeAction = {
  name: "update-issue-comment",
  description: "Update a comment on an issue. Users can only edit their own comments.",
  method: "PATCH",
  path: "/repos/{owner}/{repo}/issues/comments/{comment_id}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "comment_id",
      "body"
    ],
    "properties": {
      "body": {
        "type": "string",
        "description": "The contents of the comment"
      },
      "repo": {
        "type": "string",
        "description": "The name of the repository"
      },
      "owner": {
        "type": "string",
        "description": "The account owner of the repository"
      },
      "comment_id": {
        "type": "number",
        "description": "The unique identifier of the comment"
      }
    }
  },
  run: (args, ctx) => ctx.http.patch(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues/comments/${encodeURIComponent(String(args.comment_id))}`, {
  body: {
    "body": String(args.body),
  },
  timeoutMs: 15000,
}),
};
