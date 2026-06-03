import type { CodeAction } from '../../../framework';

export const mergePullRequest: CodeAction = {
  name: "merge-pull-request",
  description: "Merge a pull request. Users with push access can merge pull requests.",
  method: "PUT",
  path: "/repos/{owner}/{repo}/pulls/{pull_number}/merge",
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
      },
      "commit_title": {
        "type": "string",
        "description": "Title for the automatic commit message"
      },
      "merge_method": {
        "enum": [
          "merge",
          "squash",
          "rebase"
        ],
        "type": "string",
        "description": "The merge method to use"
      },
      "commit_message": {
        "type": "string",
        "description": "Extra detail to append to automatic commit message"
      }
    }
  },
  run: (args, ctx) => ctx.http.put(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/pulls/${encodeURIComponent(String(args.pull_number))}/merge`, {
  body: {
    "commit_title": args.commit_title ? String(args.commit_title) : undefined,
    "merge_method": args.merge_method ? String(args.merge_method) : undefined,
    "commit_message": args.commit_message ? String(args.commit_message) : undefined,
  },
  timeoutMs: 15000,
}),
};
