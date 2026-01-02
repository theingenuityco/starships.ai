## Example — OAuth2 connector template (`auth.type = "oauth2"`)

This is a complete example of a connector template that authenticates with **OAuth2**:

- OAuth client credentials are stored as **platform secrets** (instance-wide).
- OAuth access/refresh tokens are stored as **connector secrets** (per-starship).
- The host initiates OAuth and later injects the resulting access token when executing `connector_action`.

---

### What you create (admin payload)

This matches `CreateConnectorTemplateRequest`.

```json
{
  "provider": "example_oauth2",
  "name": "Example OAuth2",
  "description": "Example OAuth2 connector using platform secrets for client credentials and connector secrets for tokens.",
  "isEnabled": true,
  "version": "1.0.0",
  "category": "example",
  "baseUrl": "https://api.example.com",
  "auth": {
    "type": "oauth2",
    "clientIdRef": { "type": "platform_secret", "key": "EXAMPLE_OAUTH_CLIENT_ID" },
    "clientSecretRef": { "type": "platform_secret", "key": "EXAMPLE_OAUTH_CLIENT_SECRET" },
    "authorizationUrl": "https://provider.example.com/oauth/authorize",
    "tokenUrl": "https://provider.example.com/oauth/token",
    "scopes": ["users.read", "users.write"],
    "scopeDelimiter": " ",
    "extraAuthorizeParams": { "prompt": "consent" },
    "accessTokenRef": { "type": "connector_secret", "key": "EXAMPLE_ACCESS_TOKEN" },
    "refreshTokenRef": { "type": "connector_secret", "key": "EXAMPLE_REFRESH_TOKEN" },
    "injection": { "style": "header", "headerName": "Authorization", "tokenPrefix": "Bearer" },
    "tokenResponse": {
      "accessTokenField": "access_token",
      "refreshTokenField": "refresh_token",
      "expiresInField": "expires_in",
      "scopeField": "scope",
      "tokenTypeField": "token_type"
    }
  },
  "endpoints": [
    {
      "name": "me",
      "description": "Get the current user",
      "method": "GET",
      "path": "/v1/me",
      "timeoutMs": 15000
    },
    {
      "name": "update-user",
      "description": "Update a user by id",
      "method": "PATCH",
      "path": "/v1/users/{id}",
      "mapping": {
        "path": { "id": "{{ String(args.id) }}" },
        "body": { "displayName": "{{ String(args.displayName) }}" }
      }
    }
  ],
  "metadataSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "tenant": { "type": "string", "description": "Optional tenant identifier (example only)." }
    },
    "required": []
  }
}
```

---

### How OAuth works in Starships (high-level)

- The server exposes an OAuth callback route:
  - `GET /api/v1/connectors/:provider/callback`
- The redirect URI used with the provider is:
  - `${PUBLIC_URL}/api/v1/connectors/<provider>/callback`
- The server performs the token exchange and stores the resulting tokens in `connector_secrets` using:
  - `auth.accessTokenRef`
  - `auth.refreshTokenRef` (if configured)

Templates should not contain raw secrets or raw tokens.

---

### Secret scopes (what goes where)

- **Platform secrets** (`platform_secrets`)
  - `EXAMPLE_OAUTH_CLIENT_ID`
  - `EXAMPLE_OAUTH_CLIENT_SECRET`
- **Connector secrets** (`connector_secrets`)
  - `EXAMPLE_ACCESS_TOKEN`
  - `EXAMPLE_REFRESH_TOKEN`

---

### How you call it (blueprint node)

Example `connector_action` node calling the `me` endpoint:

```json
{
  "ref": "example_oauth_me",
  "type": "connector_action",
  "name": "Example OAuth2: Me",
  "parameters": {
    "connector": "example_oauth2",
    "action": "me",
    "args": {},
    "timeout": 15000
  }
}
```

---

### Notes / common pitfalls

- **Client refs should be `platform_secret`** (instance-wide), while token refs should be `connector_secret` (per-starship).
- **Scopes** are part of the template; changing scopes usually requires reconnecting to apply updated consent.
- **Injection style** can be `header` or `query`; for `query`, you must set `queryParamName`.


