## GitHub Connector – Technical Reference (V2)

GitHub API calls in Starships are made via the **`connector_action`** node, which executes an endpoint from the GitHub **connector template** (`connector_templates.endpoints_json`). Auth is injected server-side; workflows never see tokens.

If you’re looking for the underlying template/runtime shape, see `public-docs/connectors/configuration.md`.

---

### Auth model (current)

- **Auth type**: OAuth2 (`auth_json.type = "oauth2"`)
- **Client credentials**: `platform_secrets` via `auth_json.clientIdRef` / `auth_json.clientSecretRef`
- **Token storage**: per-starship encrypted `connector_secrets` via `auth_json.accessTokenRef` / `auth_json.refreshTokenRef?`
- **Scopes**: configured on the template (`auth_json.scopes`, e.g. `repo`, `read:org`)

This is a **user OAuth token** model (acts as the authenticated user), not an installation-token model.

---

### Recommended template shape (example)

Set:

- `baseUrl`: `https://api.github.com`
- Add endpoints for the calls your tools need.

Common endpoints you might define:

- `list-issues` → `GET /repos/{owner}/{repo}/issues`
- `create-issue` → `POST /repos/{owner}/{repo}/issues`
- `get-content` → `GET /repos/{owner}/{repo}/contents/{path}`

If you want consistent API-version headers, set them via `endpoint.mapping.headers` (e.g. `X-GitHub-Api-Version`).

---

### Using GitHub in a tool (example `connector_action`)

Once the template defines an endpoint named `list-issues`, a blueprint can call it like this:

```ts
{
  ref: "github_list_issues",
  type: "connector_action",
  name: "GitHub: List Issues",
  parameters: {
    connector: "github",
    action: "list-issues",
    args: { owner: "octo-org", repo: "octo-repo", state: "open" },
    timeout: 15000
  }
}
```

---

### Troubleshooting

- `401`: connector not connected or token missing/expired; reconnect.
- `403/404`: the connected user/app lacks access or required scopes.
