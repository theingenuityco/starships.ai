import type { CodeAction } from '../../../framework';

export const createPullRequest: CodeAction = {
  name: "create-pull-request",
  description: "Create a new pull request. Requires push access to the repository.",
  method: "POST",
  path: "/repos/{owner}/{repo}/pulls",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "title",
      "head",
      "base"
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
      "head": {
        "type": "string",
        "description": "The name of the branch where your changes are implemented"
      },
      "repo": {
        "type": "string",
        "description": "The name of the repository"
      },
      "draft": {
        "type": "boolean",
        "description": "Indicates whether the pull request is a draft"
      },
      "owner": {
        "type": "string",
        "description": "The account owner of the repository"
      },
      "title": {
        "type": "string",
        "description": "The title of the pull request"
      },
      "maintainer_can_modify": {
        "type": "boolean",
        "description": "Indicates whether maintainers can modify the pull request"
      }
    }
  },
  run: (args, ctx) => ctx.http.post(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/pulls`, {
  body: {
    "base": String(args.base),
    "body": args.body ? String(args.body) : undefined,
    "head": String(args.head),
    "draft": args.draft,
    "title": String(args.title),
    "maintainer_can_modify": args.maintainer_can_modify,
  },
  timeoutMs: 15000,
}),
};
