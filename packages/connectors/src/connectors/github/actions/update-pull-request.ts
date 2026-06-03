import type { CodeAction } from '../../../framework';

export const updatePullRequest: CodeAction = {
  name: "update-pull-request",
  description: "Update a pull request. Users with push access can update pull requests.",
  method: "PATCH",
  path: "/repos/{owner}/{repo}/pulls/{pull_number}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "pull_number"
    ],
    "properties": {
      "base": {
        "type": "string",
        "description": "The name of the branch you want the changes pulled into"
      },
      "body": {
        "type": "string",
        "description": "The contents of the pull request"
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
        "description": "The state of the pull request"
      },
      "title": {
        "type": "string",
        "description": "The title of the pull request"
      },
      "pull_number": {
        "type": "number",
        "description": "The number that identifies the pull request"
      }
    }
  },
  run: (args, ctx) => ctx.http.patch(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/pulls/${encodeURIComponent(String(args.pull_number))}`, {
  body: {
    "base": args.base ? String(args.base) : undefined,
    "body": args.body ? String(args.body) : undefined,
    "state": args.state ? String(args.state) : undefined,
    "title": args.title ? String(args.title) : undefined,
  },
  timeoutMs: 15000,
}),
};
