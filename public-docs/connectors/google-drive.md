## Google Drive Connector – Technical Reference (V2)

Google Drive API calls in Starships are made via the **`connector_action`** node, which executes an endpoint from the Google Drive **connector template** (`connector_templates.endpoints_json`). Auth is injected server-side; workflows never see tokens.

If you’re looking for the underlying template/runtime shape, see `public-docs/connectors/configuration.md`.

---

### Auth model (current)

- **Auth type**: OAuth2 (`auth_json.type = "oauth2"`)
- **Token storage**: per-starship encrypted `connector_secrets` at `auth_json.accessTokenRef`
- **Scopes**: configured on the template (`auth_json.scopes`)

---

### Recommended template shape (example)

Set:

- `baseUrl`: `https://www.googleapis.com`
- Add endpoints for the calls your tools need.

Common endpoints you might define:

- `list-files` → `GET /drive/v3/files`
- `download-file` → `GET /drive/v3/files/{fileId}` with `alt=media` in `mapping.query`

---

### Using Google Drive in a tool (example `connector_action`)

Once the template defines an endpoint named `list-files`, a blueprint can call it like this:

```ts
{
  ref: "gdrive_list_files",
  type: "connector_action",
  name: "Google Drive: List Files",
  parameters: {
    connector: "google_drive",
    action: "list-files",
    args: { q: "mimeType='application/vnd.google-apps.folder'", pageSize: 10 },
    timeout: 15000
  }
}
```

---

### Notes (uploads and multipart)

The V2 endpoint type supports multipart/form mappings, but the current runner implementation only supports a subset (see `public-docs/connectors/configuration.md`). If you need uploads, prefer:

- An endpoint that uses `mapping.rawBody` and explicit `Content-Type` headers, or
- A custom host extension (until multipart mapping is fully implemented).
