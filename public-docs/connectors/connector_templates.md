## Connector Templates (`connector_templates`) — Full Schema Reference

This page is the **complete schema reference** for **connector templates** (the `connector_templates` table).

Connector templates define:

- **How a connector authenticates** (OAuth2 / API key / basic / platform JWT / none)
- **Which actions exist** (endpoints catalog)
- **How requests are built** (base URL + path/query/header/body mapping)
- **Optional runtime knobs** (rate limits, metadata schema, variables)

This is used by:

- The API server (admin CRUD, OAuth start/callback, session construction)
- The runner HostRuntime (execution of `connector_action`)

---

### Source of truth

The canonical TypeScript types live in `@starships/protocol`:

- `packages/protocol/src/domains/connector.ts`
  - `ConnectorTemplateRuntimeFieldsV2`
  - `ConnectorEndpointV2`
  - `ConnectorAuthV2` (and its variants)
  - `SecretRef`, `ExprString`

This document mirrors those types and adds **behavioral notes** based on the current server/runner implementation.

---

### Naming: DB columns vs API fields

Connector templates store “root runtime fields” as JSONB/text columns. In API payloads they appear as camelCase:

- **`baseUrl`** ↔ `base_url` (text)
- **`auth`** ↔ `auth_json` (jsonb)
- **`variables`** ↔ `variables_json` (jsonb, optional)
- **`endpoints`** ↔ `endpoints_json` (jsonb)
- **`rateLimit`** ↔ `rate_limit_json` (jsonb, optional)
- **`metadataSchema`** ↔ `metadata_schema_json` (jsonb, optional)

> Important: `auth_json` must **never** contain raw secret values. It must contain **SecretRefs** only.

---

### Admin API payload shapes (create/update)

Admin create/update requests include both template metadata and runtime fields.

#### Create (`CreateConnectorTemplateRequest`)

Required:

- `provider`, `name`, `description`
- `baseUrl`, `auth`, `endpoints`

Optional:

- `id`, `slug` (if omitted, server defaults/generates)
- `isEnabled`, `version`, `category`
- `variables`, `rateLimit`, `metadataSchema`

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

#### Update (`UpdateConnectorTemplateRequest`)

All fields are optional, but **at least one field must be provided**.

---

### Runtime fields schema (`ConnectorTemplateRuntimeFieldsV2`)

Top-level runtime fields stored on the template:

```json
{
  "baseUrl": "https://api.example.com",
  "auth": { "type": "none" },
  "variables": [],
  "endpoints": [],
  "rateLimit": { "tier": "free", "burstLimit": 10, "requestsPerMinute": 60 },
  "metadataSchema": { "type": "object", "properties": {} }
}
```

- **`baseUrl: string`**
  - Absolute base URL used when resolving endpoints.
  - May be an expression string (see “ExprString”) but must evaluate to an absolute `http(s)://...` URL at runtime.
- **`auth: ConnectorAuthV2`**
  - Declarative auth configuration (OAuth2 / API key / basic / platform JWT / none).
  - Must use `SecretRef` objects instead of embedding any secrets.
- **`variables?: Variable[]`**
  - Optional list of variables the runtime can resolve from `args`, connector `metadata`, or `runtimeEnv`.
  - Used to construct URLs/headers/query/body via `ExprString` transforms.
- **`endpoints: ConnectorEndpointV2[]`**
  - The action catalog. Each endpoint is addressable by `connector_action.action === endpoint.name`.
- **`rateLimit?: { tier?: string; burstLimit?: number; requestsPerMinute?: number }`**
  - Optional best-effort throttling hints.
  - Current runner behavior: hints may be ignored depending on host/runtime implementation.
- **`metadataSchema?: JsonSchemaObject`**
  - Optional JSON Schema describing non-secret connector metadata for instances (the `connectors.metadata` shape).
  - Used by clients/UX to validate metadata inputs (especially for OAuth flows requiring pre-OAuth metadata).

---

### Expressions (`ExprString`)

Many fields are typed as `ExprString` (alias of `string`) and may contain template expressions evaluated by the HostRuntime.

- **Syntax**: full-string expressions like `{{ ... }}`
- **Common bindings** (depends on runtime):
  - `args`: the `connector_action.args` object
  - `runtimeEnv`: non-secret runtime environment values
  - `metadata`: connector instance metadata (non-secret)
  - `vars`: resolved connector template variables

Example:

```json
{
  "query": {
    "owner": "{{ String(args.owner) }}",
    "repo": "{{ String(args.repo) }}"
  }
}
```

Important clarifications:

- **Single curly braces** inside `endpoint.path` (e.g. `/items/{id}`) are **path placeholders**, not template expressions.
- If you put `{args.id}` in a path/query/header/body, it will be sent literally unless your HostRuntime interprets it (current expectation: it will be sent literally).

---

### Secrets (`SecretRef`)

Templates never store raw secret values. They store references:

```json
{ "type": "platform_secret", "key": "OAUTH_CLIENT_ID" }
```

- **`type`**
  - `platform_secret`: instance-wide encrypted secret (managed by instance admins)
  - `connector_secret`: per-starship encrypted secret (written by connect flows, e.g. OAuth tokens)
- **`key`**
  - The secret key name (often used as an env-style identifier).

---

### Auth schema (`ConnectorAuthV2`)

Auth is a discriminated union keyed by `auth.type`.

#### `type: "none"`

```json
{ "type": "none" }
```

- **Meaning**: no auth injection is performed.

#### `type: "platform_jwt"`

```json
{ "type": "platform_jwt", "headerName": "Authorization", "tokenPrefix": "Bearer" }
```

- **Meaning**: the host generates a platform JWT at runtime and injects it.
- **`headerName?: string`**: default `"Authorization"`
- **`tokenPrefix?: string`**: default `"Bearer"`

#### `type: "api_key"`

```json
{
  "type": "api_key",
  "apiKeyRef": { "type": "connector_secret", "key": "MY_API_KEY" },
  "injection": { "style": "header", "headerName": "Authorization", "tokenPrefix": "Bearer" }
}
```

- **`apiKeyRef: SecretRef`**: where the API key is stored.
- **`injection`**
  - **`style: "header" | "query"`**
  - **`headerName?: string`**: used when `style = "header"`, default `"Authorization"`
  - **`queryParamName?: string`**: required when `style = "query"`
  - **`tokenPrefix?: string`**: default `""` (raw key)

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
  "injection": { "style": "header", "headerName": "Authorization", "tokenPrefix": "Bearer" },
  "tokenResponse": { "accessTokenField": "access_token", "refreshTokenField": "refresh_token" }
}
```

- **`clientIdRef: SecretRef`**: OAuth client ID (expected `platform_secret`)
- **`clientSecretRef: SecretRef`**: OAuth client secret (expected `platform_secret`)
- **`authorizationUrl: string`**: provider authorize endpoint
- **`tokenUrl: string`**: provider token endpoint
- **`scopes?: string[]`**: scopes to request
- **`scopeDelimiter?: " " | ","`**: default varies by provider; most use `" "`
- **`extraAuthorizeParams?: Record<string, string>`**: extra query params for the authorize URL
- **`accessTokenRef: SecretRef`**: where the exchanged access token is stored (expected `connector_secret`)
- **`refreshTokenRef?: SecretRef`**: optional refresh token storage (expected `connector_secret`)
- **`injection`**: same schema as API key injection
- **`tokenResponse?`**: optional customization for non-standard token response shapes
  - Defaults are the usual OAuth field names (`access_token`, `refresh_token`, etc.).

Server constraints (current behavior):

- The admin API validates auth *loosely* (it primarily enforces `auth.type`).
- The OAuth connect flow expects `clientIdRef/clientSecretRef` to be platform-scoped and token refs to be connector-scoped.

OAuth2 redirect behavior (no template field):

- Callback route: `GET /api/v1/connectors/:provider/callback`
- Redirect URI: `${PUBLIC_URL}/api/v1/connectors/<provider>/callback`

#### `type: "basic"`

HTTP Basic Authentication (RFC 7617):

- Header: `Authorization: Basic base64("username:password")`
- Common API-key-only case: `base64("API_KEY:")` (empty password, trailing colon)

```json
{
  "type": "basic",
  "usernameRef": { "type": "connector_secret", "key": "API_KEY" }
}
```

Optional password:

```json
{
  "type": "basic",
  "usernameRef": { "type": "connector_secret", "key": "ACCOUNT_SID" },
  "passwordRef": { "type": "connector_secret", "key": "AUTH_TOKEN" }
}
```

Behavior notes (current implementation):

- The server builds a session header as `Authorization: Basic <base64>` (header name defaults to `Authorization`).
- `passwordRef` defaults to the empty string when omitted.

---

### Endpoint schema (`ConnectorEndpointV2`)

Each endpoint defines one action the runner can execute.

```json
{
  "name": "list-issues",
  "description": "List issues in a repo",
  "method": "GET",
  "path": "/repos/{owner}/{repo}/issues",
  "baseUrlOverride": "https://api.github.com",
  "parameters": { "type": "object", "properties": {} },
  "requestStyle": "auto",
  "mapping": {
    "path": { "owner": "{{ String(args.owner) }}", "repo": "{{ String(args.repo) }}" },
    "query": { "state": "{{ String(args.state || 'open') }}" },
    "headers": { "Accept": "application/vnd.github+json" }
  },
  "response": { "select": "{{ body }}" },
  "timeoutMs": 15000
}
```

- **`name: string`**
  - The action key used by `connector_action.action`.
  - Must be unique within a given connector template.
- **`description?: string`**
  - Human-readable description for catalogs/UIs.
- **`method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD"`**
- **`path: string`**
  - Path template. Supports `{var}` placeholders.
- **`baseUrlOverride?: string`**
  - Optional per-endpoint override of `baseUrl`.
- **`parameters?: JsonSchemaObject`**
  - JSON Schema for validating `connector_action.args`.
  - Runner note: types support this; enforcement depends on runtime implementation.
- **`requestStyle?: "auto" | "query" | "json" | "form" | "multipart"`**
  - Default mapping style when `mapping` is omitted.
  - In types: `auto` means GET/HEAD → query; others → json.
- **`mapping?: Mapping`**
  - Explicit mapping controlling how to build the request (see below).
- **`response?: { select?: ExprString }`**
  - Optional expression to project a “selected” value from the response.
- **`timeoutMs?: number`**
  - Optional per-endpoint timeout.

---

### Endpoint mapping schema (`ConnectorEndpointV2["mapping"]`)

Mapping is how `args` become a request.

```json
{
  "path": { "id": "{{ String(args.id) }}" },
  "query": { "page": "{{ String(args.page || 1) }}" },
  "headers": { "X-Request-Id": "{{ String(args.requestId) }}" },
  "body": { "title": "{{ String(args.title) }}" },
  "rawBody": "{{ args.rawBody }}",
  "form": { "q": "{{ String(args.q) }}" },
  "multipart": {
    "parts": [
      { "kind": "field", "name": "purpose", "value": "{{ String(args.purpose) }}" },
      { "kind": "file", "name": "file", "file": "{{ args.file }}", "filename": "{{ args.filename }}" }
    ]
  }
}
```

- **`path?: Record<string, ExprString>`**
  - Values substituted into `{var}` placeholders in `endpoint.path`.
- **`query?: Record<string, ExprString>`**
  - Query string parameters.
- **`headers?: Record<string, ExprString>`**
  - Request headers.
  - Current behavior note: mapping headers may overwrite injected auth headers if they collide.
- **`body?: Record<string, ExprString>`**
  - JSON object body mapping.
- **`rawBody?: ExprString`**
  - Raw body payload; use when you need non-object bodies.
- **`form?: Record<string, ExprString>`**
  - `application/x-www-form-urlencoded` mapping.
- **`multipart?: { parts: MultipartPart[] }`**
  - Multipart mapping with `field` and `file` parts.

#### Multipart parts (`MultipartPart`)

- **Field part**

```json
{ "kind": "field", "name": "fieldName", "value": "{{ String(args.value) }}", "contentType": "text/plain" }
```

- **File part**

```json
{
  "kind": "file",
  "name": "file",
  "file": "{{ args.file }}",
  "contentType": "application/octet-stream",
  "filename": "{{ String(args.filename || 'upload.bin') }}"
}
```

The canonical expected `file` expression result shape is documented in types as:

- `{ filename?: string; contentType?: string; base64: string }`

---

### Runtime execution model (what `connector_action` does)

At runtime, the host/runner typically:

- Looks up the template for `connector` and finds the endpoint where `endpoint.name === action`
- Builds the request URL from `baseUrl` + `path` (after placeholder substitution)
- Applies `mapping` to produce query/headers/body
- Injects auth based on `auth` **without exposing raw secrets to workflows**

Behavior notes (current implementation):

- Auth injection support is runtime-dependent; some environments only support **header-style** injection for sessions.
- JSON Schema arg validation via `endpoint.parameters` is present in the types but may not be enforced by the runner.

---

### Removed / legacy notes

- V2 uses root runtime fields (no legacy `runtime_config` blob).
- Legacy env-key columns like `required_env_keys` are not part of the v2 runtime contract.


