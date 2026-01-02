## Example — Basic auth connector template (`auth.type = "basic"`)

This is a complete example of a connector template that authenticates with **HTTP Basic Authentication** (RFC 7617).

The host constructs:

- `Authorization: Basic base64("username:password")`

Common API-key-only pattern (empty password):

- `Authorization: Basic base64("API_KEY:")`

---

### What you create (admin payload)

This matches the `CreateConnectorTemplateRequest` shape. The important runtime bits are `baseUrl`, `auth`, and `endpoints`.

```json
{
  "provider": "example_basic",
  "name": "Example Basic Auth",
  "description": "Example connector that uses HTTP Basic auth (RFC 7617) with secrets stored via SecretRef.",
  "isEnabled": true,
  "version": "1.0.0",
  "category": "example",
  "baseUrl": "https://api.example.com",
  "auth": {
    "type": "basic",
    "usernameRef": { "type": "connector_secret", "key": "EXAMPLE_API_KEY" }
  },
  "endpoints": [
    {
      "name": "list-items",
      "description": "List items",
      "method": "GET",
      "path": "/v1/items",
      "timeoutMs": 15000
    }
  ]
}
```

---

### Secret storage model (where credentials live)

This template references per-starship secrets:

- `auth.usernameRef = { type: "connector_secret", key: "EXAMPLE_API_KEY" }`
- Optional: `auth.passwordRef = { type: "connector_secret", key: "EXAMPLE_PASSWORD" }`

Meaning:

- A connect flow (or admin action) must store the actual secret values in `connector_secrets` under those keys for the relevant starship/connector.
- Workflows/blueprints never see raw credentials; the host injects the header when executing `connector_action`.

---

### How you call it (blueprint node)

Example `connector_action` node calling the `list-items` endpoint:

```json
{
  "ref": "example_basic_list_items",
  "type": "connector_action",
  "name": "Example Basic Auth: List Items",
  "parameters": {
    "connector": "example_basic",
    "action": "list-items",
    "args": {},
    "timeout": 15000
  }
}
```

---

### Notes / common pitfalls

- **Do not pre-base64 encode secrets**: store the raw username/api key (and password if needed); the runtime does the `username:password` + base64 steps.
- **API key-only**: omit `passwordRef` to get the standard `base64("API_KEY:")` behavior.
