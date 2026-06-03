import type { CodeAction } from '../../../framework';

export const listPullRequestFiles: CodeAction = {
  name: "list-pull-request-files",
  description: "List the files (diff) changed in a pull request.",
  method: "GET",
  path: "/repos/{owner}/{repo}/pulls/{pull_number}/files",
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
      "per_page": {
        "type": "number",
        "description": "Results per page (max 100)"
      },
      "page": {
        "type": "number",
        "description": "Page number of the results to fetch"
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/pulls/${encodeURIComponent(String(args.pull_number))}/files`, {
  query: {
    "per_page": args.per_page ? String(args.per_page) : undefined,
    "page": args.page ? String(args.page) : undefined,
  },
  timeoutMs: 15000,
}),
};
