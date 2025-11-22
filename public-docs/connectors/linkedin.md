## LinkedIn Connector – Technical Reference

This document specifies how to call LinkedIn APIs from tools using the `http_request` node with `connector: "linkedin"`.

Secrets (OAuth tokens, etc.) are managed by the platform and injected by the HostRuntime. **Tools never read LinkedIn tokens directly** and must not depend on any secret being visible in `ctx`.

---

### 1. Connector Behavior

- **URL resolution**
  - When `connector: "linkedin"` is set and `url` starts with `/`, the HostRuntime resolves:
    - `url: "/v2/..."` → `https://api.linkedin.com/v2/...`
    - `url: "/rest/..."` → `https://api.linkedin.com/rest/...`
  - If `url` is an absolute `https://...` URL, it is used as-is (no prefixing).

- **Auth injection**
  - For `connector: "linkedin"`, the HostRuntime:
    - Retrieves a LinkedIn access token for the current starship (from encrypted server-side storage).
    - Injects an `Authorization: Bearer <access_token>` header into the outgoing request.
  - If you explicitly set an `Authorization` header (any casing) in `parameters.headers`, that value **takes precedence** and the connector does not overwrite it.

- **Relevant `http_request` parameters**
  - `url: string`  
    - Required. Relative (`"/v2/..."`, `"/rest/..."`) or absolute.
  - `method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"`  
    - Required.
  - `headers?: Record<string, string>`  
    - Optional. Non-secret headers only (e.g. `Content-Type`, `X-RestLi-Protocol-Version`).
  - `body?: object | string | null`  
    - Optional. Objects are JSON-stringified by the runtime; strings are sent as-is.
  - `timeout?: number`  
    - Optional. Milliseconds; must be ≥ 1000. Default is ~30000ms.
  - `connector: "linkedin"`  
    - Required for LinkedIn connector behavior (URL normalization + auth injection).

- **Error semantics**
  - Non-2xx responses cause the node to throw  
    `Error("HTTP request failed: METHOD URL -> STATUS STATUS_TEXT | body: <snippet>")`.
  - Timeouts/network errors cause  
    `Error("HTTP request failed: METHOD URL -> <reason>")`.

---

### 2. Identity / Profile APIs

Use these to resolve the **connected member** and derive stable identifiers for downstream calls (e.g., as the post author).

#### 2.1 Get current member identity

- **Method**: `GET`  
- **URL**: `"/v2/userinfo"` (or the current OIDC/identity endpoint supported by your token)  
- **Connector**: `"linkedin"`

**Blueprint node (DSL):**

```ts
{
  ref: "linkedin_identity",
  type: "http_request",
  name: "LinkedIn Identity",
  parameters: {
    method: "GET",
    url: "/v2/userinfo",
    connector: "linkedin",
    timeout: 15000
  }
}
```

**Expected response contract (simplified):**

- `status: 200`
- `body`: an object containing at least:
  - One stable **member identifier** (ID or URN) you can reuse in Content APIs.
  - Basic profile fields (e.g. name) depending on current LinkedIn identity schema.

**Typical downstream usage:**

- Extract the member URN/ID and write it into state (e.g. `state.linkedinMemberUrn`).
- Optionally derive a human-readable profile URL for success messages.

---

### 3. Content / Posts APIs (Modern Content APIs)

Use these to create and manage posts as the connected member or, when permitted, on behalf of organizations.  
**Do not use legacy `ugcPosts`**; use LinkedIn’s current versioned Content APIs (e.g. `/rest/posts`).

#### 3.1 Create a text-only post

- **Method**: `POST`  
- **URL**: `"/rest/posts"` (or the current posts endpoint)  
- **Connector**: `"linkedin"`

**Inputs expected from upstream nodes:**

- `authorUrn: string` – member or organization URN (resolved via identity/org calls).
- `message: string` – textual content of the post.
- `visibility?: string` – optional visibility/audience value, following current LinkedIn docs.

**Blueprint node (DSL, pseudo-structure):**

```ts
{
  ref: "linkedin_create_post",
  type: "http_request",
  name: "LinkedIn Create Post",
  parameters: {
    method: "POST",
    url: "/rest/posts",
    connector: "linkedin",
    body: {
      // The exact payload structure must match LinkedIn's current posts API.
      // This is an illustrative shape only.
      author: "{{ state.authorUrn }}",
      commentary: "{{ input.message }}",
      visibility: "{{ input.visibility || 'PUBLIC' }}"
    },
    timeout: 15000
  }
}
```

**Expected response contract (simplified):**

- `status`: `201` or `200` on success (per LinkedIn’s API).
- `body`: object including:
  - A post identifier (URN/ID).
  - Any additional metadata (timestamps, lifecycle state, etc.) defined by LinkedIn’s Content APIs.

#### 3.2 Read / inspect posts

- **Method**: usually `GET`  
- **URL**: a versioned Content endpoint for fetching posts (e.g. `/rest/posts/{id}` or a list endpoint).  
- **Connector**: `"linkedin"`

**Usage:**

- Confirm a post exists and was created successfully.
- Retrieve selected fields (e.g. status, text, timestamps) for display or follow-up logic.

---

### 4. Organization APIs (Optional)

Use these APIs when building tools that post **as an organization** rather than the member.

#### 4.1 Get organization by ID

- **Method**: `GET`  
- **URL**: `"/v2/organizations/{organizationId}"` (or a current org endpoint)  
- **Connector**: `"linkedin"`

**Blueprint node (DSL):**

```ts
{
  ref: "linkedin_org_lookup",
  type: "http_request",
  name: "LinkedIn Organization Lookup",
  parameters: {
    method: "GET",
    url: "/v2/organizations/{{ input.organizationId }}",
    connector: "linkedin",
    timeout: 15000
  }
}
```

**Typical usage:**

- Validate that a given organization ID/URN is valid.
- Ensure the connector has the necessary scopes/permissions by:
  - Inspecting the org response.
  - Or handling 403 errors from subsequent org-scoped Content API calls.

---

### 5. Recommended Patterns

- **Always use `connector: "linkedin"` + relative URLs**  
  Let the HostRuntime handle base URL and auth. Avoid hard-coding `https://api.linkedin.com` unless strictly necessary.

- **Treat 401/403 as configuration issues**  
  - `401` → token invalid/expired or not accepted for this endpoint.  
  - `403` → insufficient scopes or no permission for the resource.
  Convert these into clear, user-facing error messages rather than generic failures.

- **Do not handle secrets in blueprints**  
  - Never attempt to read LinkedIn tokens from `ctx.env` or tool parameters.  
  - Assume all connector auth is HostRuntime-managed based on starship connector configuration.

- **Normalize outputs**  
  - After each LinkedIn call, use Transform/Code nodes to project only the fields your tool’s public interface needs (e.g. `{ success, profileUrl, postId }`).  
  - Avoid leaking raw LinkedIn payloads unless explicitly required and safe.


