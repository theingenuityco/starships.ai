import type { CodeAction } from '../../../framework';

export const createIssueComment: CodeAction = {
  name: "create-issue-comment",
  description: "Create a comment on an issue. This endpoint works for both issues and pull requests.",
  method: "POST",
  path: "/repos/{owner}/{repo}/issues/{issue_number}/comments",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "issue_number",
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
      "issue_number": {
        "type": "number",
        "description": "The number that identifies the issue"
      }
    }
  },
  run: (args, ctx) => ctx.http.post(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues/${encodeURIComponent(String(args.issue_number))}/comments`, {
  body: {
    "body": String(args.body),
  },
  timeoutMs: 15000,
}),
};
