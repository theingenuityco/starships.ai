## LinkedIn Connector – Technical Reference (V2)

LinkedIn API calls in Starships are made via the **`connector_action`** node, which executes an endpoint from the LinkedIn **connector template** (`connector_templates.endpoints_json`). Auth is injected server-side; workflows never see tokens.

If you’re looking for the underlying template/runtime shape, see `public-docs/connectors/configuration.md`.

---

### Auth model (current)

- **Auth type**: OAuth2 (`auth_json.type = "oauth2"`)
- **Token storage**: per-starship encrypted `connector_secrets` at the key referenced by `auth_json.accessTokenRef`
- **Scopes**: configured on the template (`auth_json.scopes`)

---

### Provider-specific notes (LinkedIn headers)

LinkedIn has two major endpoint families:

- **`/v2/*`**: typically requires `X-RestLi-Protocol-Version: 2.0.0`
- **`/rest/*`**: typically requires `X-RestLi-Protocol-Version: 2.0.0` and sometimes `LinkedIn-Version: YYYYMM`/`YYYYMMDD`

The connector runtime injects **auth headers only**. Any LinkedIn protocol/version headers should be configured as **endpoint headers** in the template (via `endpoint.mapping.headers`).

---

### Recommended template shape (example)

Set:

- `baseUrl`: `https://api.linkedin.com`
- Add endpoints for the calls your tools need.

Example endpoints you might define:

- `me` → `GET /v2/me`
- `create-post` → `POST /rest/posts` (and include required LinkedIn headers in `mapping.headers`)

---

### Using LinkedIn in a tool (example `connector_action`)

Once the template defines an endpoint named `me`, a blueprint can call it like this:

```ts
{
  ref: "linkedin_me",
  type: "connector_action",
  name: "LinkedIn: Me",
  parameters: {
    connector: "linkedin",
    action: "me",
    args: {},
    timeout: 15000
  }
}
```

---

### Troubleshooting

- `Unknown connector "linkedin"`: the template wasn’t provided to the runner (or the provider key is wrong).
- `Unknown connector action "X"`: the template does not define an endpoint with `name: "X"`.
- `401/403` from LinkedIn: missing/expired token, missing scopes, or insufficient org role; reconnect and/or update template scopes.
