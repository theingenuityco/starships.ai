## GitHub Connector – Technical Reference

This document specifies how to call GitHub APIs from tools using the `http_request` node with `connector: "github"`.

Auth is provided by a **GitHub App installation**, using:

- Global env config: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`
- Per-starship config: a `githubInstallationId` stored on the GitHub connector for that starship  
  Tools never see app private keys or raw installation tokens.

---

### 1. Connector behavior

- **URL resolution**
  - When `connector: "github"` is set and `url` starts with `/`, the HostRuntime resolves:
    - `url: "/repos/..."` → `https://api.github.com/repos/...`
    - `url: "/orgs/..."` → `https://api.github.com/orgs/...`
    - Any other `"/..."` path → `https://api.github.com/...`
  - If `url` is an absolute `https://...` URL, it is used as-is (no prefixing).

- **Auth injection**
  - For `connector: "github"`, the HostRuntime:
    - Mints a short-lived **GitHub App JWT** using the configured GitHub App ID and private key.
    - Looks up the current starship’s GitHub connector metadata to get `githubInstallationId`.
    - Exchanges it for an **installation access token** using that installation ID.
    - Injects an `Authorization: Bearer <installation_token>` header into the outgoing request.
  - If you explicitly set an `Authorization` header (any casing) in `parameters.headers`, that value **takes precedence** and the connector does not overwrite it.

- **Relevant `http_request` parameters**
  - `url: string`
    - Required. Relative (`"/repos/..."`, `"/orgs/..."`, etc.) or absolute.
  - `method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"`
    - Required.
  - `headers?: Record<string, string>`
    - Optional. Non-secret headers only (e.g. `Content-Type`, `Accept`, `X-GitHub-Api-Version`).
  - `body?: object | string | null`
    - Optional. Objects are JSON-stringified by the runtime; strings are sent as-is.
  - `timeout?: number`
    - Optional. Milliseconds; must be ≥ 1000. Default is ~30000ms.
  - `connector: "github"`
    - Required for GitHub connector behavior (URL normalization + auth injection).

---

### 2. Typical operations

These patterns assume your GitHub App has been granted permissions on the target repositories/organizations.

#### 2.1 List issues in a repository

- **Method**: `GET`
- **URL**: `"/repos/{{ input.owner }}/{{ input.repo }}/issues"`
- **Connector**: `"github"`

Example `http_request` node parameters:

```ts
{
  ref: "github_list_issues",
  type: "http_request",
  name: "GitHub List Issues",
  parameters: {
    method: "GET",
    url: "/repos/{{ input.owner }}/{{ input.repo }}/issues?state={{ input.state || 'open' }}",
    connector: "github",
    timeout: 15000
  }
}
```

Typical inputs:

- `owner: string` – repository owner (user or org).
- `repo: string` – repository name.
- `state?: "open" | "closed" | "all"` – filter issues by state.

#### 2.2 Create an issue

- **Method**: `POST`
- **URL**: `"/repos/{{ input.owner }}/{{ input.repo }}/issues"`
- **Connector**: `"github"`

```ts
{
  ref: "github_create_issue",
  type: "http_request",
  name: "GitHub Create Issue",
  parameters: {
    method: "POST",
    url: "/repos/{{ input.owner }}/{{ input.repo }}/issues",
    connector: "github",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      title: "{{ input.title }}",
      body: "{{ input.body || '' }}",
      assignees: "{{ input.assignees || [] }}",
      labels: "{{ input.labels || [] }}"
    },
    timeout: 15000
  }
}
```

Typical inputs:

- `owner: string`
- `repo: string`
- `title: string`
- `body?: string`
- `assignees?: string[]`
- `labels?: string[]`

#### 2.3 Read repository contents (e.g. a config file)

- **Method**: `GET`
- **URL**: `"/repos/{{ input.owner }}/{{ input.repo }}/contents/{{ input.path }}"`
- **Connector**: `"github"`

```ts
{
  ref: "github_get_file",
  type: "http_request",
  name: "GitHub Get File",
  parameters: {
    method: "GET",
    url: "/repos/{{ input.owner }}/{{ input.repo }}/contents/{{ input.path }}",
    connector: "github",
    timeout: 15000
  }
}
```

Typical inputs:

- `owner: string`
- `repo: string`
- `path: string` – path to the file within the repository.

The response body will follow GitHub’s “contents” API (base64-encoded content, metadata, etc.).

---

### 3. Recommended patterns

- **Treat permissions as configuration, not logic**
  - If calls return `403` or `404`, interpret that as the GitHub App lacking permission or not being installed on the repo/org.
  - Convert these into clear error messages for the user (e.g. “GitHub App is not installed on `owner/repo` or lacks `issues` permission.”).

- **Do not handle secrets in blueprints**
  - Never attempt to use the app private key, installation ID, or tokens in a tool.
  - Always rely on `connector: "github"` and relative URLs.

- **Normalize outputs**
  - After each GitHub call, use Transform/Code nodes to project just the fields your tool’s public interface needs (e.g. `{ success, issueNumber, issueUrl }`).
  - Avoid leaking full raw GitHub payloads into user-facing surfaces unless explicitly required.
