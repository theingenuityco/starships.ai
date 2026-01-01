## Connectors Reference

Connectors let Starships tools and agents talk to third‑party platforms via the `connector_action` node, with auth handled by the HostRuntime instead of by your blueprints.

- **How connectors work**
  - **Connector templates** (`connector_templates` in the DB) define what connectors exist and how they behave at runtime via root runtime fields (`base_url`, `auth_json`, `endpoints_json`, etc.).
  - **Connector instances** (`connectors` in the DB) record whether a given starship has a given connector connected/disconnected, plus non-secret metadata.
  - **Secrets are split by scope**
    - **Platform secrets** (`platform_secrets`): instance-wide encrypted secrets (OAuth client IDs/secrets, bot tokens). Only instance admins can manage these.
    - **Connector secrets** (`connector_secrets`): per-starship encrypted secrets (OAuth access/refresh tokens, etc.).
  - **Tools make requests** using `connector_action` with a `connector` slug and an `action` (endpoint name).
  - **At execution time, HostRuntime**
    - Looks up the connector template endpoint by `connector + action`.
    - Applies path/query/header/body mapping and injects auth **without exposing secrets to the workflow**.
    - Note: JSON Schema validation via `endpoint.parameters` exists in types, but is not enforced by the current runner implementation.

- **Built‑in connectors**
  - **Starships (internal)**
    - Use `connector_action` with `connector: "starships"` to call internal Starships API endpoints defined in the template.
    - This connector uses a platform JWT generated for the current user+starship at runtime (no stored access token).

- **Designing connector‑aware tools**
  - Use `connector_action` with `connector` + `action`; let the runtime handle base URLs, mapping, and auth.
  - Prefer clear, user‑facing error messages when external APIs return auth/permission errors.
  - Keep connector-specific HTTP logic isolated so it is easy to change if external APIs evolve.
  - Never log or echo raw tokens; blueprints should not attempt to read connector secrets directly.

- **Troubleshooting**
  - If you see an error like `Unknown connector "<name>"` or `Unknown connector action "<action>"`, it usually means the template is missing or the endpoint name does not exist.
  - `401/403` responses from the external API usually mean missing/expired tokens or insufficient permissions/scopes; reconnect the connector and/or adjust the app/bot permissions.

---

### Examples

- **API key connector template**: `example-api-key.md`
- **Basic auth connector template**: `example-basic.md`
- **OAuth2 connector template**: `example-oauth2.md`
