import type { CodeAction } from '../../../framework';

export const getUser: CodeAction = {
  name: "get-user",
  description: "Get the authenticated user's GitHub profile. Verifies authentication and returns user information.",
  method: "GET",
  path: "/user",
  parameters: {
    "type": "object",
    "properties": {}
  },
  run: (args, ctx) => ctx.http.get(`/user`, {
  timeoutMs: 15000,
}),
};
