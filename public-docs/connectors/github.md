## GitHub Connector – Technical Reference

This document specifies how to call GitHub APIs from tools using the `http_request` node with `connector: "github"`.

Auth is provided by a **GitHub OAuth App user token**:

- **Global env config** (backend only): `GH_OAUTH_CLIENT_ID`, `GH_OAUTH_CLIENT_SECRET`
- **Per-starship env config** (encrypted environments table): `GITHUB_ACCESS_TOKEN`, `GITHUB_REFRESH_TOKEN`
  Tools never see the OAuth client secret or raw access/refresh tokens.

At the GitHub side, this is equivalent to a token that acts **as the authenticated user**:

- The token’s effective permissions are the intersection of:
  - The **scopes/permissions granted to the app**, and
  - The **permissions of the user** on each repo/organization.
- If the user cannot perform an action (for example, they are not allowed to push to a repo), the app cannot perform it either, even if the app was granted broader permissions.

In this deployment, the OAuth flow requests the following capabilities:

- `repo` – full control of private and public repositories the user can access (read and write code, issues, pull requests, releases, etc.).
- `read:org` – read organization membership and basic organization data.

The connector can therefore:

- Read and write to repositories that the connected user can access, within the limits of `repo`.
- Read organization membership and related metadata within the limits of `read:org`.
- Call any REST API endpoints that accept OAuth or GitHub App user access tokens with these scopes/permissions (for example, listing repos, creating issues, reading contents, reading environments, some Actions and Checks endpoints, etc.), subject to the user’s role and the app’s configured permissions.

---

### 1. Connector behavior and token type

- **Token type (OAuth App user token)**
  - This connector uses a **GitHub OAuth App user access token**, not an installation token.
  - The token acts as the authenticated user and can call any REST endpoints that accept OAuth user tokens with the granted scopes (`repo`, `read:org`), subject to the user’s permissions.
  - Endpoints that are specific to GitHub App installations (for example, `/installation/repositories`) are **not** the primary target for this connector; prefer user-scoped endpoints like `/user`, `/user/repos`, `/repos/{owner}/{repo}/...`, `/orgs/{org}/...`.

- **URL resolution**
  - When `connector: "github"` is set and `url` starts with `/`, the HostRuntime resolves:
    - `url: "/repos/..."` → `https://api.github.com/repos/...`
    - `url: "/orgs/..."` → `https://api.github.com/orgs/...`
    - Any other `"/..."` path → `https://api.github.com/...`
  - If `url` is an absolute `https://...` URL, it is used as-is (no prefixing).

- **Auth injection**
  - For `connector: "github"`, the HostRuntime:
    - Uses the configured GitHub OAuth App (`GH_OAUTH_CLIENT_ID` / `GH_OAUTH_CLIENT_SECRET`) to complete the OAuth 2.0 code exchange for the current starship.
    - Stores the resulting `GITHUB_ACCESS_TOKEN` (and optional `GITHUB_REFRESH_TOKEN`) in the encrypted environments table for that starship.
    - Injects an `Authorization: Bearer <access_token>` header into the outgoing request using the stored `GITHUB_ACCESS_TOKEN`.
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

These patterns assume your GitHub OAuth App and user token have been granted permissions on the target repositories/organizations. All examples below call **official REST endpoints** and the request/response shapes are taken from GitHub’s REST API documentation.

#### 2.1 List issues in a repository

- **Method**: `GET`
- **URL**: `"/repos/{owner}/{repo}/issues"` (maps to `GET /repos/{owner}/{repo}/issues`)
- **Connector**: `"github"`

Example `http_request` node parameters (full-string template for URL):

```ts
{
  ref: "github_list_issues",
  type: "http_request",
  name: "GitHub List Issues",
  parameters: {
    method: "GET",
    // full-string template builds the final URL
    url: "{{ '/repos/' + input.owner + '/' + input.repo + '/issues?state=' + (input.state || 'open') }}",
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
- **URL**: `"/repos/{owner}/{repo}/issues"` (maps to `POST /repos/{owner}/{repo}/issues`)
- **Connector**: `"github"`

```ts
{
  ref: "github_create_issue",
  type: "http_request",
  name: "GitHub Create Issue",
  parameters: {
    method: "POST",
    url: "{{ '/repos/' + input.owner + '/' + input.repo + '/issues' }}",
    connector: "github",
    headers: {
      "Content-Type": "application/json"
    },
    // full-string template returns the final JSON body object
    body: "{{ { title: input.title, body: input.body || '', assignees: input.assignees || [], labels: input.labels || [] } }}",
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
- **URL**: `"/repos/{owner}/{repo}/contents/{path}"` (maps to `GET /repos/{owner}/{repo}/contents/{path}`)
- **Connector**: `"github"`

```ts
{
  ref: "github_get_file",
  type: "http_request",
  name: "GitHub Get File",
  parameters: {
    method: "GET",
    url: "{{ '/repos/' + input.owner + '/' + input.repo + '/contents/' + input.path }}",
    connector: "github",
    timeout: 15000
  }
}
```

Typical inputs:

- `owner: string`
- `repo: string`
- `path: string` – path to the file within the repository.

**Verified response shape (file case, abridged):**

- `type: "file"` – indicates this is a file (vs `dir`).
- `name: string` – file name.
- `path: string` – path within the repo.
- `sha: string` – blob SHA.
- `size: number` – file size in bytes.
- `encoding: "base64"` – encoding of `content`.
- `content: string` – base64-encoded file contents (you must base64‑decode before use).

**Directory case:** the API returns an **array** of entries, each with `type`, `name`, `path`, `sha`, `size`, and `_links` as documented in GitHub’s “Get repository content” endpoint.

Tools should treat this as the source of truth for file metadata and contents and avoid assuming any additional fields beyond the official REST schema.

---

### 3. Recommended patterns

- **Treat permissions as configuration, not logic**
  - If calls return `403` or `404`, interpret that as the connected GitHub user or OAuth App lacking permission or access to the repo/org.
  - Convert these into clear error messages for the user (e.g. “GitHub connector does not have access to `owner/repo` or lacks `repo` scope.”).

- **Do not handle secrets in blueprints**
  - Never attempt to use the OAuth client secret or raw access/refresh tokens in a tool.
  - Always rely on `connector: "github"` and relative URLs; token management is handled entirely by the backend.

- **Normalize outputs**
  - After each GitHub call, use Transform/Code nodes to project just the fields your tool’s public interface needs (e.g. `{ success, issueNumber, issueUrl }`).
  - Avoid leaking full raw GitHub payloads into user-facing surfaces unless explicitly required.

- **Troubleshooting**
  - `401 Unauthorized` usually means the GitHub connector is not connected for this starship or the stored access token is missing/expired. Reconnect the GitHub connector and retry.
  - If you use `connector: "github"` with a **relative URL** (for example, `"/user/repos"`) but no GitHub connector configuration exists at all for the current starship, the HostRuntime will surface a clear error about the missing connector configuration rather than a low-level URL parsing failure.
