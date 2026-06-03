import type { CodeAction } from '../../../framework';

export const listUserRepos: CodeAction = {
  name: "list-user-repos",
  description: "List repositories for the authenticated user. Returns repos the user owns, collaborates on, or is a member of.",
  method: "GET",
  path: "/user/repos",
  parameters: {
    "type": "object",
    "properties": {
      "page": {
        "type": "number",
        "minimum": 1,
        "description": "The page number of the results to fetch"
      },
      "sort": {
        "enum": [
          "created",
          "updated",
          "pushed",
          "full_name"
        ],
        "type": "string",
        "description": "The property to sort the results by"
      },
      "type": {
        "enum": [
          "all",
          "owner",
          "public",
          "private",
          "member"
        ],
        "type": "string",
        "description": "Limit results to repositories of the specified type"
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
        "description": "The order to sort by"
      },
      "visibility": {
        "enum": [
          "all",
          "public",
          "private"
        ],
        "type": "string",
        "description": "Limit results to repositories with the specified visibility"
      },
      "affiliation": {
        "type": "string",
        "description": "Comma-separated list of values. Can include: owner, collaborator, organization_member"
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/user/repos`, {
  query: {
    "page": args.page ? String(args.page) : undefined,
    "sort": args.sort ? String(args.sort) : undefined,
    "type": args.type ? String(args.type) : undefined,
    "per_page": args.per_page ? String(args.per_page) : undefined,
    "direction": args.direction ? String(args.direction) : undefined,
    "visibility": args.visibility ? String(args.visibility) : undefined,
    "affiliation": args.affiliation ? String(args.affiliation) : undefined,
  },
  timeoutMs: 15000,
}),
};
