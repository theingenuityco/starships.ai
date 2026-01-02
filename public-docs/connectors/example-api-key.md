## Example — API key connector template (`auth.type = "api_key"`)

This is a complete example of a connector template that authenticates with an **API key** stored as a `connector_secret`, injected into an outbound request via a request header.

It is intended as a practical reference for creating a new row in `connector_templates` (via the admin API) and then calling it via the `connector_action` node.

---

### What you create (admin payload)

This matches the `CreateConnectorTemplateRequest` shape. The important runtime bits are `baseUrl`, `auth`, and `endpoints`.

```json
{
  "provider": "example_api_key",
  "name": "Example API Key",
  "description": "Example connector that uses a per-starship API key stored as a connector secret.",
  "isEnabled": true,
  "version": "1.0.0",
  "category": "example",
  "baseUrl": "https://api.example.com",
  "auth": {
    "type": "api_key",
    "apiKeyRef": { "type": "connector_secret", "key": "EXAMPLE_API_KEY" },
    "injection": { "style": "header", "headerName": "Authorization", "tokenPrefix": "Bearer" }
  },
  "endpoints": [
    {
      "name": "get-user",
      "description": "Fetch a user by id",
      "method": "GET",
      "path": "/v1/users/{id}",
      "mapping": {
        "path": { "id": "{{ String(args.id) }}" }
      },
      "timeoutMs": 15000
    },
    {
      "name": "search-users",
      "description": "Search users (query string mapping example)",
      "method": "GET",
      "path": "/v1/users/search",
      "mapping": {
        "query": {
          "q": "{{ String(args.q || '') }}",
          "limit": "{{ String(args.limit || 20) }}"
        }
      }
    },
    {
      "name": "create-user",
      "description": "Create a user (JSON body mapping example)",
      "method": "POST",
      "path": "/v1/users",
      "mapping": {
        "body": {
          "email": "{{ String(args.email) }}",
          "displayName": "{{ String(args.displayName) }}"
        }
      }
    }
  ],
  "rateLimit": { "tier": "default", "requestsPerMinute": 120 },
  "metadataSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {},
    "required": []
  }
}
```

---

### Secret storage model (where the API key lives)

This template references a per-starship secret:

- `auth.apiKeyRef = { type: "connector_secret", key: "EXAMPLE_API_KEY" }`

Meaning:

- A connect flow (or admin action) must store the actual API key value in `connector_secrets` under the key `EXAMPLE_API_KEY` for the relevant starship/connector.
- Workflows/blueprints never see the raw key; the host injects it when executing `connector_action`.

---

### How you call it (blueprint node)

Example `connector_action` node calling the `get-user` endpoint:

```json
{
  "ref": "example_get_user",
  "type": "connector_action",
  "name": "Example: Get User",
  "parameters": {
    "connector": "example_api_key",
    "action": "get-user",
    "args": { "id": "user_123" },
    "timeout": 15000
  }
}
```

---

### Notes / common pitfalls

- **Do not store raw keys in the template**: always use a `SecretRef`.
- **Header vs query injection**: set `injection.style` accordingly. If you use `query`, you must set `queryParamName`.
- **Path placeholders**: `/v1/users/{id}` uses `{id}` placeholders (not `{{ ... }}`); supply values via `mapping.path`.


