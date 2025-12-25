## Connector Templates V2 Reference (Admin / `connector_templates`)

Connector templates are defined by root runtime fields on `connector_templates`:

- `base_url` (text)
- `auth_json` (jsonb)
- `variables_json` (jsonb, optional)
- `endpoints_json` (jsonb)
- `rate_limit_json` (jsonb, optional)
- `metadata_schema_json` (jsonb, optional)

This is the source of truth used by:

- The **API server** (`ConnectorService`) to run declarative OAuth2/API-key connector flows (start + callback completion / api-key connect)
- The **runner HostRuntime** to execute `connector_action` endpoints (lookup + args validation + mapping + auth injection)

> Note on secret refs
>
> `auth_json` must never contain raw secret values. It contains **references** to encrypted secrets stored in:
>
> - `platform_secrets` (instance-wide; instance admins only)
> - `connector_secrets` (per-starship; created/updated by connector flows)

---

### Canonical types

The canonical TypeScript shapes live in `@starships/protocol` (`packages/protocol/src/domains/connector.ts`):

- `ConnectorTemplateRuntimeFieldsV2`
- `ConnectorEndpointV2`
- `ConnectorAuthV2` and its variants

---

### Root runtime fields

- **`baseUrl`** (`base_url`): absolute base URL used for endpoint resolution.
- **`auth`** (`auth_json`): declarative auth configuration (secret refs only).
- **`variables`** (`variables_json`, optional): named variables resolved from args/metadata/runtimeEnv.
- **`endpoints`** (`endpoints_json`): action catalog. Each endpoint defines method/path, args JSON Schema, and mapping.
- **`rateLimit`** (`rate_limit_json`, optional): best-effort throttling hints.
- **`metadataSchema`** (`metadata_schema_json`, optional): JSON Schema for connector instance metadata.

---

### `oauth` keys

#### OAuth2 flow configuration (used by `ConnectorService`)

- **`oauth.clientId?: { type: "platform_secret", key: string }`**
- **`oauth.clientSecret?: { type: "platform_secret", key: string }`**
  - **Required for OAuth2 connectors**. The server enforces `platform_secret` here.

- **`oauth.authorizeUrl?: string`**
- **`oauth.tokenUrl?: string`**
- **`oauth.redirectPath?: string`**
  - `redirectPath` should match the API route the server exposes, typically:
    - `"/api/v1/connectors/<provider>/callback"`

- **`oauth.scopes?: string[]`**
- **`oauth.params?: Record<string, unknown>`**
  - Provider-specific extra params used when building the authorization URL.
  - Examples used by built-in templates include:
    - Google: `params.accessType = "offline"`, `params.prompt = "consent"`
    - Discord: `params.permissions = "<number>"`

#### Runtime HTTP auth injection (used by runner HostRuntime via `ConnectorRuntimeService`)

- **`oauth.accessToken?: { type: "platform_secret" | "connector_secret", key: string }`**
  - Where the runtime should read the token from when injecting auth for `http_request` with `connector: "<provider>"`.
  - If `type: "connector_secret"`, the value comes from the starship’s decrypted `connector_secrets[key]`.
  - If `type: "platform_secret"`, the value comes from instance-wide `platform_secrets[key]` (common for bot-style connectors like Discord).

- **`oauth.refreshToken?: { type: "connector_secret", key: string }`**
  - Optional per-starship refresh token **persistence target** for OAuth2 completion.
  - Note: there is **no automatic refresh** unless you implement a refresh blueprint and call the refresh endpoint.

- **`oauth.apiKey?: { type: "connector_secret", key: string }`**
  - Optional key for API-key-style connectors (stored per starship).
  - If you want API keys injected into HTTP calls, you can also set:
    - `oauth.accessToken` to the same `connector_secret` key
    - `oauth.authHeaderName` / `oauth.authPrefix` appropriately

- **`oauth.authHeaderName?: string`**
  - Header name to inject. Default: `"Authorization"`.

- **`oauth.authPrefix?: string`**
  - Prefix before the token. Default: `"Bearer"`.
  - Use `""` for no prefix (token is used as-is).
  - Examples: `"Bearer"`, `"Bot"`, `""`.

---

### Header override behavior (escape hatch)

If a workflow explicitly supplies an `Authorization` header in `http_request.parameters.headers` (any casing), the runner will **not** overwrite it with connector-injected `Authorization`.

Important nuance:

- This protection is **only** for the header named `Authorization`. If a connector injects a different header (via `oauth.authHeaderName`), the connector header is merged last and can overwrite caller-supplied values.

---

### Deprecated / removed keys

- **`runtime_config.metadataFromQuery` / `runtime_config.oauth.metadataFromQuery`**: **no longer supported**.
  - The server now copies callback query params into connector metadata automatically (excluding OAuth plumbing like `code` and `state`).

---

### Examples

#### Discord bot token (platform secret + `Bot` prefix)

```json
{
  "apiBaseUrl": "https://discord.com",
  "oauth": {
    "accessToken": { "type": "platform_secret", "key": "DISCORD_BOT_TOKEN" },
    "authPrefix": "Bot"
  }
}
```

#### GitHub OAuth App user token (per-starship access token + `Bearer`)

```json
{
  "apiBaseUrl": "https://api.github.com",
  "oauth": {
    "clientId": { "type": "platform_secret", "key": "GH_APP_CLIENT_ID" },
    "clientSecret": { "type": "platform_secret", "key": "GH_APP_CLIENT_SECRET" },
    "authorizeUrl": "https://github.com/login/oauth/authorize",
    "tokenUrl": "https://github.com/login/oauth/access_token",
    "redirectPath": "/api/v1/connectors/github/callback",
    "scopes": ["repo", "read:org"],
    "accessToken": { "type": "connector_secret", "key": "GH_APP_ACCESS_TOKEN" },
    "refreshToken": { "type": "connector_secret", "key": "GH_APP_REFRESH_TOKEN" }
  }
}
```


