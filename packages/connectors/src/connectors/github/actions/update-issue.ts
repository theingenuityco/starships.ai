import type { CodeAction } from '../../../framework';

export const updateIssue: CodeAction = {
  name: "update-issue",
  description: "Update an existing issue. Users with push access can update issues.",
  method: "PATCH",
  path: "/repos/{owner}/{repo}/issues/{issue_number}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "issue_number"
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
      "state": {
        "enum": [
          "open",
          "closed"
        ],
        "type": "string",
        "description": "The state of the issue"
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
      },
      "issue_number": {
        "type": "number",
        "description": "The number that identifies the issue"
      }
    }
  },
  run: (args, ctx) => ctx.http.patch(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues/${encodeURIComponent(String(args.issue_number))}`, {
  body: {
    "body": args.body ? String(args.body) : undefined,
    "state": args.state ? String(args.state) : undefined,
    "title": args.title ? String(args.title) : undefined,
    "labels": args.labels,
    "assignees": args.assignees,
  },
  timeoutMs: 15000,
}),
};
