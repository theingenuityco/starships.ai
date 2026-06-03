import type { CodeAction } from '../../../framework';

export const getRepo: CodeAction = {
  name: "get-repo",
  description: "Get details of a specific repository including description, stars, forks, language, and permissions.",
  method: "GET",
  path: "/repos/{owner}/{repo}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo"
    ],
    "properties": {
      "repo": {
        "type": "string",
        "description": "The name of the repository without the .git extension. The name is not case sensitive."
      },
      "owner": {
        "type": "string",
        "description": "The account owner of the repository. The name is not case sensitive."
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}`, {
  timeoutMs: 15000,
}),
};
