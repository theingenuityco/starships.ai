## Connector: `system` (reserved)

The **`system` connector** is a reserved, first‑party connector intended for **platform-native capabilities** that should:

- Execute inside the **autopilot runner**
- Keep backend credentials out of blueprints/tools
- Provide stable, long-lived action names (even if the backend implementation changes)

The `system` connector is **built-in (hard-coded)** — it is **not backed by DB connector templates** and does not require installation or per-starship “connect” steps.

The initial actions are:

- `webFetch` — fetch a public URL via the system web gateway (web-unlocking / bot-mitigation capable)
- `webSearch` — run a web search via the system search gateway (SERP-backed)

---

## How it works

At runtime, `connector_action` calls:

- `connector: "system"`
- `action: "webFetch"` or `"webSearch"`

The runner resolves the connector template and:

- injects auth headers from **platform secrets**
- evaluates endpoint mappings (`mapping.path/query/headers/body`)
- performs the network call from the runner process

Important: The `system` connector is designed to be **always available** when its platform secrets are configured. It does not require per‑starship connector installation.

---

## Platform secrets (required)

The `system` connector reads secrets from `platform_secrets` (instance-admin managed):

- `SYSTEM_CONNECTOR_WEB_GATEWAY_API_KEY`
- `SYSTEM_CONNECTOR_WEBFETCH_ZONE` (Web Unlocker zone name)
- `SYSTEM_CONNECTOR_WEBSEARCH_ZONE` (SERP API zone name)

These secrets are never exposed to workflows/tools; they are resolved server-side and injected into the runner connector session.

---

## Action: `webFetch`

### Purpose

Fetch a public URL with higher reliability than a direct datacenter `fetch` (anti-bot/403/429/CAPTCHA scenarios).

### Input args

```ts
{
  url: string;                 // required, absolute http(s) URL
  method?: string;             // default "GET"
  headers?: Record<string, any>;
  body?: any;                  // ignored for GET/HEAD
  format?: "raw" | "json";     // default "raw"
  dataFormat?: string;         // optional backend data_format (e.g. "markdown", "screenshot")
  country?: string;            // optional routing hint
}
```

### Output

The runner normalizes the backend response into the standard connector_action contract:

```ts
{ status: number, statusText: string, headers: Record<string, unknown>, body: unknown, url: string }
```

If the backend returns a wrapped/enveloped response, the runner unwraps it into the fields above.

### Blueprint example

```ts
{
  ref: "fetch",
  type: "connector_action",
  name: "System Web Fetch",
  parameters: {
    connector: "system",
    action: "webFetch",
    args: {
      url: "https://example.com",
      format: "raw"
    },
    // Optional: fail fast on non-2xx
    failOnNon2xx: true,
    timeout: 60000
  }
}
```

---

## Action: `webSearch`

### Purpose

Run a web search and return a structured result payload (backend-dependent).

### Input args

```ts
{
  q: string;                   // required
  engine?: "google" | "bing";  // default "google"
  hl?: string;                 // default "en"
  gl?: string;                 // default "us"
  num?: number;                // optional (engine dependent)
  start?: number;              // optional (engine dependent)
  format?: "raw" | "json";     // default "json"
  dataFormat?: string;         // optional (e.g. "parsed_light", "markdown")
  country?: string;            // optional routing hint
  url?: string;                // optional override: full SERP URL
}
```

### Output

Same wrapper shape:

```ts
{ status: number, statusText: string, headers: Record<string, unknown>, body: unknown, url: string }
```

Backend notes:

- Prefer `format: "json"` and/or `dataFormat: "parsed_light"` when you want structured JSON quickly.
- If `format: "raw"`, you should expect HTML/text and parse it yourself in a downstream `code` node.

### Blueprint example

```ts
{
  ref: "search",
  type: "connector_action",
  name: "System Web Search",
  parameters: {
    connector: "system",
    action: "webSearch",
    args: {
      q: "best pizza nyc",
      engine: "google",
      hl: "en",
      gl: "us",
      format: "json",
      dataFormat: "parsed_light"
    },
    failOnNon2xx: true,
    timeout: 45000
  }
}
```

---

## Notes and constraints

- **Use `http_request` for raw HTTP** when you don’t need platform-managed credentials or web-unlocking behavior.
- **Use `connector_action` + `system`** when you want web fetch/search that is credentialed and executed in the runner.
- **Binary/screenshot payloads**: if the backend returns binary content (e.g. screenshot), ensure your action/backend is configured to return a text-safe representation (or extend the connector action/runtime to support binary).

---

## Links

- Connector overview: `./README.md`
- Connector templates reference: `./connector_templates.md`
- Blueprint node reference: `../blueprints/node-connector-action.md`

