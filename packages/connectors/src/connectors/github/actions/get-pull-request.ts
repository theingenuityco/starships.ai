import type { CodeAction } from '../../../framework';

export const getPullRequest: CodeAction = {
  name: "get-pull-request",
  description: "Get a specific pull request by its number. Returns full PR details including title, body, state, commits, and merge status.",
  method: "GET",
  path: "/repos/{owner}/{repo}/pulls/{pull_number}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "pull_number"
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
      "pull_number": {
        "type": "number",
        "description": "The number that identifies the pull request"
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/pulls/${encodeURIComponent(String(args.pull_number))}`, {
  timeoutMs: 15000,
}),
};
