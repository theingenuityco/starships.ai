import type { CodeAction } from '../../../framework';

export const createOrUpdateFile: CodeAction = {
  name: "create-or-update-file",
  description: "Create or update a single file in a repository (connector-side fallback to git push). Content is sent as UTF-8 and base64-encoded automatically.",
  method: "PUT",
  path: "/repos/{owner}/{repo}/contents/{path}",
  parameters: {
    "type": "object",
    "required": [
      "owner",
      "repo",
      "path",
      "message",
      "content"
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
      "path": {
        "type": "string",
        "description": "The file path within the repository"
      },
      "message": {
        "type": "string",
        "description": "The commit message"
      },
      "content": {
        "type": "string",
        "description": "The new file contents as UTF-8 text"
      },
      "branch": {
        "type": "string",
        "description": "The branch to commit to (defaults to the repository default branch)"
      },
      "sha": {
        "type": "string",
        "description": "Blob SHA of the file being replaced (required when updating an existing file)"
      }
    }
  },
  run: (args, ctx) => ctx.http.put(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/contents/${encodeURIComponent(String(args.path))}`, {
  body: {
    "message": String(args.message),
    "content": Buffer.from(String(args.content), 'utf-8').toString('base64'),
    "branch": args.branch ? String(args.branch) : undefined,
    "sha": args.sha ? String(args.sha) : undefined,
  },
  timeoutMs: 15000,
}),
};
