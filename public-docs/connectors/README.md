## Connectors Reference

Connectors let Starships tools and agents talk to third‑party platforms (like LinkedIn, Discord, Google Drive, and GitHub) via the `http_request` node, with auth handled by the HostRuntime instead of by your blueprints.

- **How connectors work**
  - **Connector templates** (`connector_templates` in the DB) define what connectors exist and how they behave at runtime via `runtime_config` (see [runtime-config](./runtime-config.md)).
  - **Connector instances** (`connectors` in the DB) record whether a given starship has a given connector connected/disconnected, plus non-secret metadata (e.g. Discord `guild_id`).
  - **Secrets are split by scope**
    - **Platform secrets** (`platform_secrets`): instance-wide encrypted secrets (OAuth client IDs/secrets, bot tokens). Only instance admins can manage these.
    - **Connector secrets** (`connector_secrets`): per-starship encrypted secrets (OAuth access/refresh tokens, etc.).
  - **Tools make requests** using `http_request` with a `connector` slug (for example `"linkedin"`, `"discord"`, `"google_drive"`, `"github"`).
  - **At execution time, HostRuntime**
    - Resolves **relative URLs** (those that are not `https://...`) against the connector’s configured `apiBaseUrl`.
    - Injects configured connector headers (typically `Authorization`) **without exposing them to the workflow**.
    - Never overwrites a caller-supplied `Authorization` header (escape hatch).

- **Built‑in connectors**
  - **[LinkedIn](./linkedin.md)**
    - Use `connector: "linkedin"` on `http_request` nodes and relative URLs like `"/rest/posts"` or `"/v2/userinfo"`.
    - The runtime resolves URLs against the configured API base and injects an auth header per `runtime_config`.
  - **[Discord](./discord.md)**
    - Use `connector: "discord"` on `http_request` nodes and relative URLs like `"/api/channels/{channelId}/messages"`.
    - The runtime resolves URLs against the configured API base and injects an auth header per `runtime_config` (typically `Authorization: Bot ...`).
  - **[Google Drive](./google-drive.md)**
    - Use `connector: "google_drive"` on `http_request` nodes and relative URLs like `"/drive/v3/files"` or `"/upload/drive/v3/files"`.
    - The runtime resolves URLs against the configured API base and injects an appropriate bearer token obtained via the Google Drive connector’s OAuth flow.
  - **[GitHub](./github.md)**
    - Uses a GitHub OAuth App **user access token** (not an installation token). The token acts as the authenticated user and is scoped by the app’s permissions plus the user’s repo/org access.
    - Use `connector: "github"` on `http_request` nodes and relative URLs like `"/user"`, `"/user/repos"`, or `"/repos/{owner}/{repo}/issues"`.
    - The runtime resolves URLs against the GitHub API base (`https://api.github.com`) and injects a bearer token obtained via the GitHub OAuth App user-token flow (tokens are stored per starship in encrypted connector secrets).
  - **Starships (internal)**
    - Use `connector: "starships"` to call the Starships API itself via `http_request` with relative URLs like `"/starships/{id}/tools"`.
    - This connector uses a platform JWT generated for the current user+starship at runtime (no stored access token).

- **Designing connector‑aware tools**
  - Use `http_request` with `connector` and **relative** URLs; let the runtime handle base URLs and auth.
  - Prefer clear, user‑facing error messages when external APIs return auth/permission errors.
  - Keep connector-specific HTTP logic isolated so it is easy to change if external APIs evolve.
  - Never log or echo raw tokens; blueprints should not attempt to read connector secrets directly.

- **Troubleshooting**
  - If you see an error like `Connector "<name>" has no HTTP configuration; cannot resolve relative URL ...`, it usually means the connector is not connected for the current starship (or the instance admin has not configured required platform secrets).
  - `401/403` responses from the external API usually mean missing/expired tokens or insufficient permissions/scopes; reconnect the connector and/or adjust the app/bot permissions.
