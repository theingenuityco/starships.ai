## Google Drive Connector – Technical Reference

This document specifies how to call Google Drive APIs from tools using the `http_request` node with `connector: "google_drive"`.

Secrets (OAuth tokens, etc.) are managed by the platform and injected by the HostRuntime. **Tools never read Google tokens directly** and must not depend on any secret being visible in `ctx`.

---

### 1. Connector Behavior

- **URL resolution**
  - When `connector: "google_drive"` is set and `url` is relative (starts with `/`), HostRuntime resolves it against the connector template’s configured `apiBaseUrl` (typically `https://www.googleapis.com`).
  - Examples:
    - `url: "/drive/v3/..."` → `https://www.googleapis.com/drive/v3/...`
    - `url: "/upload/drive/v3/..."` → `https://www.googleapis.com/upload/drive/v3/...`
  - If `url` is an absolute `https://...` URL, it is used as-is (no prefixing).

- **Auth injection**
  - For `connector: "google_drive"`, the HostRuntime:
    - Retrieves a Google Drive access token for the current starship from encrypted per-starship connector secrets (`GOOGLE_DRIVE_ACCESS_TOKEN`).
    - Injects an `Authorization: Bearer <access_token>` header into the outgoing request.
  - If you explicitly set an `Authorization` header (any casing) in `parameters.headers`, that value **takes precedence** and the connector does not overwrite it.

- **Relevant `http_request` parameters**
  - `url: string`
    - Required. Relative (`"/drive/v3/..."`, `"/upload/drive/v3/..."`) or absolute.
  - `method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"`
    - Required.
  - `headers?: Record<string, string>`
    - Optional. Non-secret headers only (e.g. `Content-Type`, `X-Goog-...`).
  - `body?: object | string | null`
    - Optional. Objects are JSON-stringified by the runtime; strings are sent as-is.
  - `timeout?: number`
    - Optional. Milliseconds; must be ≥ 1000. Default is ~30000ms.
  - `connector: "google_drive"`
    - Required for Google Drive connector behavior (URL normalization + auth injection).

---

### 2. Common Operations

You can use the Google Drive connector for any documented Drive REST API. These are typical patterns:

#### 2.1 List files

- **Method**: `GET`
- **URL**: `"/drive/v3/files"`
- **Connector**: `"google_drive"`

**Blueprint node (DSL):**

```ts
{
  ref: "gdrive_list_files",
  type: "http_request",
  name: "Google Drive List Files",
  parameters: {
    method: "GET",
    // full-string template builds the final URL
    url: "{{ '/drive/v3/files?q=' + encodeURIComponent(input.query) + '&pageSize=' + (input.pageSize || 10) }}",
    connector: "google_drive",
    timeout: 15000
  }
}
```

Typical inputs:

- `query: string` – a Drive query string (e.g. `"mimeType='application/vnd.google-apps.folder'"`).
- `pageSize?: number` – limit number of files returned.

#### 2.2 Download a file

- **Method**: `GET`
- **URL**: `"/drive/v3/files/{fileId}?alt=media"`
- **Connector**: `"google_drive"`

You can use this pattern when you need raw file contents; the response `body` will contain the file data (string or binary-like string depending on the API’s response headers).

#### 2.3 Upload a file (simple upload)

- **Method**: `POST`
- **URL**: `"/upload/drive/v3/files?uploadType=media"`
- **Connector**: `"google_drive"`

**Blueprint node (DSL – download by fileId):**

```ts
{
  ref: "gdrive_download_file",
  type: "http_request",
  name: "Google Drive Download File",
  parameters: {
    method: "GET",
    url: "{{ '/drive/v3/files/' + input.fileId + '?alt=media' }}",
    connector: "google_drive",
    timeout: 15000
  }
}
```

#### 2.3 Upload a file (simple upload)

- **Method**: `POST`
- **URL**: `"/upload/drive/v3/files?uploadType=media"`
- **Connector**: `"google_drive"`

**Blueprint node (DSL, simplified):**

```ts
{
  ref: "gdrive_upload_file",
  type: "http_request",
  name: "Google Drive Upload File",
  parameters: {
    method: "POST",
    url: "/upload/drive/v3/files?uploadType=media",
    connector: "google_drive",
    headers: {
      "Content-Type": "{{ input.contentType }}"
    },
    body: "{{ input.content }}",
    timeout: 30000
  }
}
```

Typical inputs:

- `content: string` – file contents.
- `contentType: string` – MIME type (e.g. `"text/plain"`).

---

### 3. Recommended Patterns

- **Always use `connector: "google_drive"` + relative URLs**  
  Let the HostRuntime handle base URL and auth. Avoid hard-coding `https://www.googleapis.com` unless strictly necessary.

- **Treat 401/403 as configuration issues**
  - `401` → token invalid/expired.
  - `403` → insufficient scopes or no permission for the resource.
    Convert these into clear, user-facing error messages rather than generic failures.

- **Do not handle secrets in blueprints**
  - Never attempt to read Google tokens from `ctx.env` or tool parameters.
  - Assume all connector auth is HostRuntime-managed based on starship connector configuration.

---

### 4. OAuth scopes (what the connector is allowed to do)

The Google Drive connector is configured by the instance admin and typically requests the broad Drive scope:

- `https://www.googleapis.com/auth/drive`

If you see `403` responses, treat them as scope/permission issues (and surface a clear error to the user).

- **Normalize outputs**
  - After each Google Drive call, use Transform/Code nodes to project only the fields your tool’s public interface needs (e.g. `{ success, fileId, name, webViewLink }`).
  - Avoid leaking raw Drive payloads unless explicitly required and safe.
