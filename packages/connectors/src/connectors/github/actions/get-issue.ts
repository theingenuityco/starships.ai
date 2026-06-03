import type { CodeAction } from '../../../framework';

export const getIssue: CodeAction = {
  name: "get-issue",
  description: "Get a specific issue by its number. Returns full issue details including title, body, labels, assignees, and comments count.",
  method: "GET",
  path: "/repos/{owner}/{repo}/issues/{issue_number}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "issue_number"
    ],
    "properties": {
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
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues/${encodeURIComponent(String(args.issue_number))}`, {
  timeoutMs: 15000,
}),
};
