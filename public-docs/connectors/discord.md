## Discord Connector

The **Discord connector** lets tools call the Discord HTTP API (for example, posting messages as a bot) through the `http_request` node using `connector: "discord"`.  
Secrets (bot token, etc.) are managed by the platform and injected by the HostRuntime; tools never see raw tokens.

- **How to call Discord from a tool**
  - Use a `http_request` node with:
    - `connector: "discord"`
    - `url`: a **relative** Discord API path (the runtime prefixes the correct base URL)
    - `method`: `"GET"`, `"POST"`, etc.
    - `headers` / `body`: only non-secret fields (JSON payload, content strings, channel IDs, etc.).
  - The HostRuntime:
    - Normalizes the URL against `https://discord.com` (for example, `"/api/channels/.../messages"` → `https://discord.com/api/channels/.../messages`).
    - Injects an `Authorization: Bot <token>` header using the configured bot token (a platform secret such as `DISCORD_BOT_TOKEN`).
  - If you explicitly set an `Authorization` header, it **wins** and the connector will not override it.

> Note: Discord is “connector-scoped” even though the runtime token is a platform secret.
>
> The bot token is instance-wide, but HostRuntime will only expose the `discord` connector to workflows when the
> connector is marked **connected** for the current starship. This lets an admin control which starships are allowed
> to send Discord API calls using the shared bot.

---

### Common operations

These are the main Discord surfaces this connector is typically used for. Exact JSON fields should follow Discord’s current REST API docs, but this describes the shapes tools can rely on.

- **1. Send a message to a channel**
  - **Purpose**: post a text (or embed-rich) message into a specific channel.
  - **Example call (blueprint parameters)**:
    - `method: "POST"`
    - `url: "{{ '/api/channels/' + input.channelId + '/messages' }}"`
    - `connector: "discord"`
    - `body`: `"{{ { content: input.message } }}"`
  - **Typical tool parameters**:
    - `channelId` (string, required): Discord channel ID to post into.
    - `message` (string, required): message text.
  - **Outputs to surface**:
    - Message ID, channel ID, timestamp, and any other fields useful for follow-up actions.

- **2. Basic channel / guild checks (optional)**
  - **Purpose**: validate that a channel/guild exists and that the bot has access before sending messages.
  - **Example calls**:
    - `GET /api/channels/{channelId}`
    - `GET /api/guilds/{guildId}`
    - Always called with `connector: "discord"` and relative URLs.
  - **Typical uses in tools**:
    - Fail fast with a clear error if a channel or guild is invalid or inaccessible.
    - Optionally read metadata (names, types) for user-facing confirmation.

---

### Design notes for tools using this connector

- **Channel/guild IDs are not secrets**: accept them as tool parameters or configuration; do not try to read them from hidden env.
- **Let the connector handle auth**: always use `connector: "discord"` with relative URLs; do not manually inject the bot token.
- **Handle permission errors clearly**: treat `403` responses as missing permissions/intents and return actionable error messages.
- **Keep Discord logic localized**: keep Discord-specific `http_request` nodes together so it’s easy to adjust paths or payloads if the API changes.
