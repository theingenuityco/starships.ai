import type { CodeAction } from '../../../framework';

export const getRoomResources: CodeAction = {
  name: "get-room-resources",
  description: "Get resolved room resources in one response (pinned views/tables/task boards + assigned tools)",
  method: "GET",
  path: "/rooms/{roomId}/resources",
  parameters: {
    "type": "object",
    "required": [
      "roomId"
    ],
    "properties": {
      "q": {
        "type": "string",
        "description": "Optional case-insensitive search across name/slug/description"
      },
      "kinds": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        ],
        "description": "Optional kind filter (comma-separated or array). Allowed: views, tables, taskBoards, tools"
      },
      "roomId": {
        "type": "string",
        "description": "Room id (backing conversation id; defaults to runtimeEnv.CONVERSATION_ID)"
      },
      "limitPerKind": {
        "type": "number",
        "description": "Optional cap per kind (0-200) applied after filtering"
      },
      "includeArchived": {
        "type": "boolean",
        "description": "When true, includes archived tables/task boards (default false)"
      }
    },
    "additionalProperties": false
  },
  run: (args, ctx) => ctx.http.get(`/rooms/${encodeURIComponent(String(args.roomId ?? args.id ?? ctx.runtimeEnv.CONVERSATION_ID ?? ""))}/resources`, {
  query: {
    "q": args.q == null ? undefined : String(args.q),
    "kinds": args.kinds == null ? undefined : (Array.isArray(args.kinds) ? args.kinds.map((x) => String(x)).join(",") : String(args.kinds)),
    "limitPerKind": args.limitPerKind == null ? undefined : String(args.limitPerKind),
    "includeArchived": args.includeArchived == null ? undefined : String(args.includeArchived),
  },
  timeoutMs: 30000,
}),
};
