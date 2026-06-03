import type { CodeAction } from '../../../framework';

export const listPullRequests: CodeAction = {
  name: "list-pull-requests",
  description: "List pull requests in a repository. By default, only open pull requests are returned.",
  method: "GET",
  path: "/repos/{owner}/{repo}/pulls",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo"
    ],
    "properties": {
      "base": {
        "type": "string",
        "description": "Filter pulls by base branch name"
      },
      "head": {
        "type": "string",
        "description": "Filter pulls by head user or head organization and branch name in the format user:ref-name or organization:ref-name"
      },
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
          "popularity",
          "long-running"
        ],
        "type": "string",
        "description": "What to sort results by"
      },
      "owner": {
        "type": "string",
        "description": "The account owner of the repository"
      },
      "state": {
        "enum": [
          "open",
          "closed",
          "all"
        ],
        "type": "string",
        "description": "Either open, closed, or all to filter by state"
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
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/pulls`, {
  query: {
    "base": args.base ? String(args.base) : undefined,
    "head": args.head ? String(args.head) : undefined,
    "page": args.page ? String(args.page) : undefined,
    "sort": args.sort ? String(args.sort) : undefined,
    "state": args.state ? String(args.state) : undefined,
    "per_page": args.per_page ? String(args.per_page) : undefined,
    "direction": args.direction ? String(args.direction) : undefined,
  },
  timeoutMs: 15000,
}),
};
