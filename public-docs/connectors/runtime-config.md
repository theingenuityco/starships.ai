## Connector `runtime_config` Reference (Admin / connector_templates)

`connector_templates.runtime_config` is an **open-ended JSON object** that defines non-secret connector behavior.
It is the source of truth used by the host to compute:

- The connector **base API URL** (for relative `http_request` URLs)
- The connector **auth header injection behavior** (header name + prefix + where token comes from)

This document describes the **supported keys used by the current host runtime**.

---

### Top-level keys

- **`apiBaseUrl?: string`**
  - Base URL used to resolve relative `http_request` URLs (those starting with `/`).
  - Example: `"https://discord.com"` or `"https://api.github.com"`.

- **`usesPlatformJwt?: boolean`**
  - Host-only flag for the internal `"starships"` connector (uses a platform JWT instead of stored tokens).

---

### `oauth` object

`runtime_config.oauth` is used both for OAuth flows *and* for HTTP auth injection at runtime.

- **`oauth.clientId?: string | { type: "platform_secret", key: string }`**
  - Reference to the **platform secret** containing the OAuth client id.

- **`oauth.clientSecret?: string | { type: "platform_secret", key: string }`**
  - Reference to the **platform secret** containing the OAuth client secret.

- **`oauth.authorizeUrl?: string`**, **`oauth.tokenUrl?: string`**, **`oauth.redirectPath?: string`**
  - OAuth endpoint configuration used by the host when performing code exchange.

- **`oauth.scopes?: string[]`**, **`oauth.params?: Record<string, unknown>`**
  - Optional extra OAuth configuration for the authorization URL.

#### Runtime auth injection keys

- **`oauth.accessToken?: { type: "platform_secret" | "connector_secret", key: string }`**
  - Where the host should read the token from when injecting auth for `http_request` with `connector: "<provider>"`.
  - Supported formats:
    - `{ "type": "connector_secret", "key": "GH_APP_ACCESS_TOKEN" }`
    - `{ "type": "platform_secret", "key": "DISCORD_BOT_TOKEN" }`

- **`oauth.metadataFromQuery?: string[]`**
  - Optional allowlist of **OAuth callback query** fields to copy into persisted connector `metadata`.
  - This is useful for providers that include non-secret context in the redirect query (e.g. Discord `guild_id`).
  - Example: `["guild_id", "permissions"]`

- **`oauth.authHeaderName?: string`**
  - HTTP header name to inject. Default: `"Authorization"`.

- **`oauth.authPrefix?: string`**
  - Prefix placed before the token. Default: `"Bearer"`.
  - Use `""` for no prefix (token is used as-is).
  - Examples: `"Bearer"`, `"Bot"`, `""`.

---

### Example: Discord bot token (platform secret + `Bot` prefix)

```json
{
  "apiBaseUrl": "https://discord.com",
  "oauth": {
    "accessToken": { "type": "platform_secret", "key": "DISCORD_BOT_TOKEN" },
    "authPrefix": "Bot"
  }
}
```

### Example: OAuth connector (per-starship access token + `Bearer`)

```json
{
  "apiBaseUrl": "https://api.github.com",
  "oauth": {
    "accessToken": { "type": "connector_secret", "key": "GH_APP_ACCESS_TOKEN" },
    "authPrefix": "Bearer"
  }
}
```


