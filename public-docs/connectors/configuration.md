## Connector Templates V2 Reference (Admin / `connector_templates`)

Connector templates are defined by **root runtime fields** on `connector_templates`:

- `base_url` (text)
- `auth_json` (jsonb)
- `variables_json` (jsonb, optional)
- `endpoints_json` (jsonb)
- `rate_limit_json` (jsonb, optional)
- `metadata_schema_json` (jsonb, optional)

These fields are used by:

- The **API server** (`ConnectorService`) to run declarative **OAuth2** and **API-key** connect flows
- The **runner** (`RunnerHostRuntime.connectorAction`) to execute **`connector_action`** endpoints

> Note on secret refs
>
> `auth_json` must never contain raw secret values. It contains **SecretRefs** that point to encrypted secrets stored in:
>
> - `platform_secrets` (instance-wide; managed by instance admins)
> - `connector_secrets` (per-starship; written by connector connect flows)

---

### Canonical types (source of truth)

The canonical TypeScript shapes live in `@starships/protocol`:

- `packages/protocol/src/domains/connector.ts`
  - `ConnectorTemplateRuntimeFieldsV2`
  - `ConnectorEndpointV2`
  - `ConnectorAuthV2` (+ variants)

---

### Root runtime fields (DB → API naming)

- **`baseUrl`** (`base_url`): absolute base URL used for endpoint resolution (may be an expression string; see below).
- **`auth`** (`auth_json`): declarative auth configuration (SecretRefs only; no raw secrets).
- **`variables`** (`variables_json`, optional): runtime variables (currently passed through; resolution is template-defined).
- **`endpoints`** (`endpoints_json`): action catalog. Each endpoint defines `name`, `method`, `path`, and optional mapping.
- **`rateLimit`** (`rate_limit_json`, optional): best-effort throttling hints.
- **`metadataSchema`** (`metadata_schema_json`, optional): JSON Schema for connector instance metadata.

---

### Admin create/update payloads (auth type)

Connector templates do **not** have a separate root-level `authType` field in the API contract.

The auth kind is determined solely by the discriminator:

- **`auth.type`** (inside the `auth` object)

Minimal example:

```json
{
  "provider": "example",
  "name": "Example",
  "description": "Example connector",
  "baseUrl": "https://api.example.com",
  "auth": { "type": "api_key" },
  "endpoints": []
}
```

---

### Expression strings (`ExprString`) and template syntax

Many connector template fields are **expression strings** (`ExprString`) evaluated by the runner at runtime.

**Supported expression syntax:**

- Use **double curly braces**: `{{ ... }}`
- Inside `{{ ... }}`, you can reference:
  - `args` (the `connector_action.args` object)
  - `runtimeEnv` (non-secret runtime env passed to the runner)
  - `metadata` (connector instance metadata, non-secret)
  - `vars` (connector template variables resolved by the runner)

**Important:** single-curly placeholders like `{args.type}` are **not supported** and will be sent literally to the external API.
Single-curly braces in `endpoint.path` (e.g. `/items/{id}`) are **path placeholders**, not mapping templates.

Example (query mapping):

```json
{
  "name": "get-documentation",
  "path": "/context",
  "method": "GET",
  "mapping": {
    "query": {
      "type": "{{ String(args.type) }}",
      "query": "{{ String(args.query) }}",
      "libraryId": "{{ String(args.libraryId) }}"
    }
  }
}
```

---

### SecretRef (how auth points at secrets)

A SecretRef is:

- `{ "type": "platform_secret" | "connector_secret", "key": "<ENV_KEY>" }`

---

### `auth_json` (`auth`) variants

#### `type: "none"`

```json
{ "type": "none" }
```

#### `type: "platform_jwt"` (internal / Starships connector)

```json
{ "type": "platform_jwt", "headerName": "Authorization", "tokenPrefix": "Bearer" }
```

#### `type: "api_key"`

```json
{
  "type": "api_key",
  "apiKeyRef": { "type": "connector_secret", "key": "MY_API_KEY" },
  "injection": { "style": "header", "headerName": "Authorization", "tokenPrefix": "Bearer" }
}
```

#### `type: "oauth2"`

```json
{
  "type": "oauth2",
  "clientIdRef": { "type": "platform_secret", "key": "OAUTH_CLIENT_ID" },
  "clientSecretRef": { "type": "platform_secret", "key": "OAUTH_CLIENT_SECRET" },
  "authorizationUrl": "https://provider.example/oauth/authorize",
  "tokenUrl": "https://provider.example/oauth/token",
  "scopes": ["scope-a", "scope-b"],
  "scopeDelimiter": " ",
  "extraAuthorizeParams": { "prompt": "consent" },
  "accessTokenRef": { "type": "connector_secret", "key": "PROVIDER_ACCESS_TOKEN" },
  "refreshTokenRef": { "type": "connector_secret", "key": "PROVIDER_REFRESH_TOKEN" },
  "injection": { "style": "header", "headerName": "Authorization", "tokenPrefix": "Bearer" }
}
```

**Server-enforced constraints (current behavior):**

- `clientIdRef` / `clientSecretRef` **must** be `platform_secret` refs.
- `accessTokenRef` **must** be a `connector_secret` ref (the server writes the exchanged access token there on callback).

---

### OAuth2 redirect behavior (no template field)

The server derives the OAuth callback URL from the standard route (no `redirectPath` in v2):

- `GET /api/v1/connectors/:provider/callback`
- Redirect URI used in OAuth is `${PUBLIC_URL}/api/v1/connectors/<provider>/callback`

---

### `connector_action` execution (how auth is injected)

At runtime, the API server builds a **connector session bundle** (see `ConnectorActionSessionService`) containing:

- `connectorTemplates[provider]`: the template runtime fields (safe; no raw secrets)
- `connectorSessions[provider]`: injected auth headers (no raw secrets exposed to workflows)

**Session visibility rules (current behavior):**

- `platform_jwt` sessions are always available (internal connector).
- Other sessions are only provided when the connector is **connected** for the starship.

**Injection limits (current behavior):**

- Only **header-style** injection is supported for sessions today. If `auth.injection.style` is `"query"`, the session is not provided.
- `endpoint.mapping.headers` is applied **after** session headers and can overwrite them.

---

### `endpoints_json` execution model (what the runner supports today)

The runner resolves endpoints by:

- `connector` + `action` → find endpoint where `endpoint.name === action`
- `baseUrl` + `path` → build a URL (supports `{var}` placeholders)
- `mapping` → project `args` into path/query/headers/body

**Supported today (in `RunnerHostRuntime.connectorAction`):**

- `baseUrl` and `endpoint.baseUrlOverride` (must evaluate to absolute `http(s)://...`)
- Path placeholders (`/items/{id}`) via `mapping.path` or `args[id]`
- `mapping.query`, `mapping.headers`
- `mapping.body` (object) or `mapping.rawBody` (string/any)

**Present in types but not enforced/implemented yet:**

- JSON Schema validation via `endpoint.parameters`
- `requestStyle` (`auto`, `form`, `multipart`, etc.)
- `response.select`
- Per-endpoint `timeoutMs` defaulting

---

### Removed keys / old behavior

- The legacy `runtime_config` shape is removed in v2 (and is dropped from the DB).
- Legacy env-key columns like `required_env_keys` are no longer part of the runtime contract.
