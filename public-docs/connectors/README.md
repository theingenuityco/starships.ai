## Connectors Reference

Connectors let Starships tools and agents talk to third‑party platforms (like LinkedIn and Discord) via the `http_request` node, with auth handled by the HostRuntime instead of by your blueprints.

- **How connectors work**
  - A connector’s OAuth or configuration flow stores secrets in encrypted server-side environments.
  - Tools make HTTP calls using the `http_request` node with a `connector` parameter (for example, `"linkedin"` or `"discord"`).
  - The HostRuntime resolves relative URLs and injects appropriate auth headers; blueprints never see raw tokens or need to know how OAuth was performed.

- **Built‑in connectors**
  - **LinkedIn**
    - Use `connector: "linkedin"` on `http_request` nodes and relative URLs like `"/rest/posts"` or `"/v2/userinfo"`.
    - The runtime normalizes URLs against the LinkedIn API base and injects a bearer token obtained via the LinkedIn connector’s OAuth flow.
  - **Discord**
    - Use `connector: "discord"` on `http_request` nodes and relative URLs like `"/api/channels/{channelId}/messages"`.
    - The runtime normalizes URLs against the Discord API base and injects the bot token as an `Authorization: Bot ...` header.

- **Designing connector‑aware tools**
  - Use `http_request` with `connector` and **relative** URLs; let the runtime handle base URLs and auth.
  - Prefer clear, user‑facing error messages when external APIs return auth/permission errors.
  - Keep connector-specific HTTP logic isolated so it is easy to change if external APIs evolve.
  - Never log or echo raw tokens; blueprints should not attempt to read connector secrets directly.
