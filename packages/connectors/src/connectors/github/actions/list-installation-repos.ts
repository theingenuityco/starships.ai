import type { CodeAction } from '../../../framework';

export const listInstallationRepos: CodeAction = {
  name: "list-installation-repos",
  description:
    "List repositories accessible to the GitHub App installation. Returns the repos the App was granted access to (works with an installation token, unlike the user-scoped repo list).",
  method: "GET",
  path: "/installation/repositories",
  parameters: {
    "type": "object",
    "properties": {
      "page": {
        "type": "number",
        "minimum": 1,
        "description": "The page number of the results to fetch"
      },
      "per_page": {
        "type": "number",
        "maximum": 100,
        "minimum": 1,
        "description": "The number of results per page (max 100)"
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/installation/repositories`, {
  query: {
    "page": args.page ? String(args.page) : undefined,
    "per_page": args.per_page ? String(args.per_page) : undefined,
  },
  timeoutMs: 15000,
}),
};
