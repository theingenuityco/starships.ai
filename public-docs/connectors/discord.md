## Discord Connector – Technical Reference (V2)

Discord API calls in Starships are made via the **`connector_action`** node, which executes an endpoint from the Discord **connector template** (`connector_templates.endpoints_json`). Auth is injected server-side; workflows never see tokens.

If you’re looking for the underlying template/runtime shape, see `public-docs/connectors/configuration.md`.

---

### “Connect” behavior (current)

- The connect flow is **starship-scoped**: a starship must have the `discord` connector marked **connected** for the runtime to inject auth headers for it.
- On OAuth callback completion, the server copies non-plumbing query params into connector metadata (for example `guild_id`, `permissions`), excluding `code` and `state`.

---

### Recommended template shape (example)

Set:

- `baseUrl`: `https://discord.com`
- Add endpoints for the calls your tools need.

Example endpoints you might define:

- `get-current-user` → `GET /api/users/@me`
- `get-guild` → `GET /api/guilds/{guildId}`

---

### Using Discord in a tool (example `connector_action`)

Once the template defines an endpoint named `get-guild`, a blueprint can call it like this:

```ts
{
  ref: "discord_get_guild",
  type: "connector_action",
  name: "Discord: Get Guild",
  parameters: {
    connector: "discord",
    action: "get-guild",
    args: { guildId: "1234567890" },
    timeout: 15000
  }
}
```

---

### Troubleshooting

- `Unknown connector action "X"`: add the endpoint to the template (`endpoints_json`).
- `401/403`: connector not connected for the starship or token is missing/expired/insufficient.
