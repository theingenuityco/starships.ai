import type { CodeAction } from '../../../framework';

export const listRepoIssues: CodeAction = {
  name: "list-repo-issues",
  description: "List issues in a repository. Note: GitHub's REST API considers every pull request an issue, but not every issue is a pull request.",
  method: "GET",
  path: "/repos/{owner}/{repo}/issues",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo"
    ],
    "properties": {
      "page": {
        "type": "number",
        "minimum": 1,
        "description": "The page number of the results to fetch"
      },
      "repo": {
        "type": "string",
        "description": "The name of the repository"
      },
      "sort": {
        "enum": [
          "created",
          "updated",
          "comments"
        ],
        "type": "string",
        "description": "What to sort results by"
      },
      "owner": {
        "type": "string",
        "description": "The account owner of the repository"
      },
      "since": {
        "type": "string",
        "description": "Only show results updated after the given time (ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ)"
      },
      "state": {
        "enum": [
          "open",
          "closed",
          "all"
        ],
        "type": "string",
        "description": "Indicates the state of the issues to return"
      },
      "labels": {
        "type": "string",
        "description": "A list of comma separated label names. Example: bug,ui,@high"
      },
      "per_page": {
        "type": "number",
        "maximum": 100,
        "minimum": 1,
        "description": "The number of results per page (max 100)"
      },
      "direction": {
        "enum": [
          "asc",
          "desc"
        ],
        "type": "string",
        "description": "The direction to sort the results by"
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues`, {
  query: {
    "page": args.page ? String(args.page) : undefined,
    "sort": args.sort ? String(args.sort) : undefined,
    "since": args.since ? String(args.since) : undefined,
    "state": args.state ? String(args.state) : undefined,
    "labels": args.labels ? String(args.labels) : undefined,
    "per_page": args.per_page ? String(args.per_page) : undefined,
    "direction": args.direction ? String(args.direction) : undefined,
  },
  timeoutMs: 15000,
}),
};
