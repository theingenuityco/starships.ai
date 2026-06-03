import type { CodeAction } from '../../../framework';

export const listIssueComments: CodeAction = {
  name: "list-issue-comments",
  description: "List comments on an issue. Issue comments are ordered by ascending ID. This endpoint works for both issues and pull requests.",
  method: "GET",
  path: "/repos/{owner}/{repo}/issues/{issue_number}/comments",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "issue_number"
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
      "owner": {
        "type": "string",
        "description": "The account owner of the repository"
      },
      "since": {
        "type": "string",
        "description": "Only show results updated after the given time (ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ)"
      },
      "per_page": {
        "type": "number",
        "maximum": 100,
        "minimum": 1,
        "description": "The number of results per page (max 100)"
      },
      "issue_number": {
        "type": "number",
        "description": "The number that identifies the issue"
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/issues/${encodeURIComponent(String(args.issue_number))}/comments`, {
  query: {
    "page": args.page ? String(args.page) : undefined,
    "since": args.since ? String(args.since) : undefined,
    "per_page": args.per_page ? String(args.per_page) : undefined,
  },
  timeoutMs: 15000,
}),
};
