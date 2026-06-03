import type { CodeAction } from '../../../framework';

export const createIssue: CodeAction = {
  name: "create-issue",
  description: "Create a new issue in a repository. Any user with pull access can create an issue.",
  method: "POST",
  path: "/repos/{owner}/{repo}/issues",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "title"
    ],
    "properties": {
      "body": {
        "type": "string",
        "description": "The contents of the issue"
      },
      "repo": {
        "type": "string",
        "description": "The name of the repository"
      },
      "owner": {
        "type": "string",
        "description": "The account owner of the repository"
      },
      "title": {
        "type": "string",
        "description": "The title of the issue"
      },
      "labels": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Labels to associate with this issue"
      },
      "assignees": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Logins for Users to assign to this issue"
      }
    }
  },
  run: (args, ctx) => ctx.http.post(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues`, {
  body: {
    "body": args.body ? String(args.body) : undefined,
    "title": String(args.title),
    "labels": args.labels,
    "assignees": args.assignees,
  },
  timeoutMs: 15000,
}),
};
