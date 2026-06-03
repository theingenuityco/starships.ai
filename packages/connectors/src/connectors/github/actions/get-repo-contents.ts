import type { CodeAction } from '../../../framework';

export const getRepoContents: CodeAction = {
  name: "get-repo-contents",
  description: "Get contents of a file or directory in a repository. Files are returned with base64-encoded content.",
  method: "GET",
  path: "/repos/{owner}/{repo}/contents/{path}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "path"
    ],
    "properties": {
      "ref": {
        "type": "string",
        "description": "The name of the commit/branch/tag. Default: the repository's default branch"
      },
      "path": {
        "type": "string",
        "description": "The file or directory path in the repository"
      },
      "repo": {
        "type": "string",
        "description": "The name of the repository"
      },
      "owner": {
        "type": "string",
        "description": "The account owner of the repository"
      }
    }
  },
  run: (args, ctx) => ctx.http.get(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/contents/${String(args.path).split('/').map(encodeURIComponent).join('/')}`, {
  query: {
    "ref": args.ref ? String(args.ref) : undefined,
  },
  timeoutMs: 15000,
}),
};
