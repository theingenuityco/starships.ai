import type { CodeAction } from '../../../framework';

export const createPullRequestReview: CodeAction = {
  name: "create-pull-request-review",
  description: "Create a review on a pull request, optionally with line-anchored inline comments. Requires push access.",
  method: "POST",
  path: "/repos/{owner}/{repo}/pulls/{pull_number}/reviews",
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
      "body": {
        "type": "string",
        "description": "The body text of the review"
      },
      "event": {
        "enum": [
          "APPROVE",
          "REQUEST_CHANGES",
          "COMMENT"
        ],
        "type": "string",
        "description": "The review action to perform. Omit to leave the review pending."
      },
      "comments": {
        "type": "array",
        "description": "Line-anchored inline comments: array of { path, line, side?, body }",
        "items": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "The relative path to the file being commented on"
            },
            "line": {
              "type": "number",
              "description": "The line of the blob in the pull request diff to comment on"
            },
            "side": {
              "type": "string",
              "description": "Which side of the diff: LEFT or RIGHT"
            },
            "body": {
              "type": "string",
              "description": "Text of the inline comment"
            }
          }
        }
      }
    }
  },
  run: (args, ctx) => ctx.http.post(`/repos/${encodeURIComponent(String(args.owner))}/${encodeURIComponent(String(args.repo))}/pulls/${encodeURIComponent(String(args.pull_number))}/reviews`, {
  body: {
    "body": args.body ? String(args.body) : undefined,
    "event": args.event ? String(args.event) : undefined,
    "comments": args.comments,
  },
  timeoutMs: 15000,
}),
};
