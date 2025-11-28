## LinkedIn Connector – Technical Reference

This document specifies how to call LinkedIn APIs from tools using the `http_request` node with `connector: "linkedin"`, **only for capabilities that are actually supported by our configured LinkedIn scopes**.

Secrets (OAuth tokens, etc.) are managed by the platform and injected by the HostRuntime. **Tools never read LinkedIn tokens directly** and must not depend on any secret being visible in `ctx`.

---

### 1. Connector behavior in Starships

- **URL resolution**
  - When `connector: "linkedin"` is set and `url` starts with `/`, the HostRuntime resolves:
    - `url: "/rest/..."` → `https://api.linkedin.com/rest/...`
  - If `url` is an absolute `https://...` URL, it is used as-is (no prefixing).

- **Auth injection**
  - For `connector: "linkedin"`, the HostRuntime:
    - Retrieves a LinkedIn access token for the current starship (from encrypted server-side storage).
    - Injects an `Authorization: Bearer <access_token>` header into the outgoing request.
  - If you explicitly set an `Authorization` header (any casing) in `parameters.headers`, that value **takes precedence** and the connector does not overwrite it.

- **Relevant `http_request` parameters**
  - `url: string` – required. Relative (`"/rest/..."`) or absolute.
  - `method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"` – required.
  - `headers?: Record<string, string>` – optional, non-secret headers only (for example `Content-Type`, `X-RestLi-Protocol-Version`, `LinkedIn-Version`).
  - `body?: object | string | null` – optional. Objects are JSON-stringified by the runtime; strings are sent as-is.
  - `timeout?: number` – optional. Milliseconds; must be ≥ 1000. Default is ~30000ms.
  - `connector: "linkedin"` – required for LinkedIn connector behavior (URL normalization + auth injection).

- **Error semantics**
  - Non-2xx responses cause the node to throw  
    `Error("HTTP request failed: METHOD URL -> STATUS STATUS_TEXT | body: <snippet>")`.
  - Timeouts/network errors cause  
    `Error("HTTP request failed: METHOD URL -> <reason>")`.

---

### 2. Scopes we have and what they unlock

The LinkedIn connector is configured with the following scopes (see `ConnectorService` in the server):

- **Member-level scopes**
  - **`r_basicprofile`** – read basic member profile; used by identity endpoints such as `/v2/me` or `/v2/userinfo`.
  - **`w_member_social`** – create posts, comments, and likes on behalf of the connected member.
  - **`r_member_profileAnalytics`** – read profile-level analytics (for example follower counts).
  - **`r_member_postAnalytics`** – read analytics for posts authored by the connected member.

- **Organization-level scopes**
  - **`rw_organization_admin`** – discover and validate which organizations the member can administer.
  - **`r_organization_social` / `w_organization_social`** – manage organization social content (mapped by LinkedIn to `r_organization_social_feed` / `w_organization_social_feed`).
  - **`r_organization_social_feed`** – read access to an organization’s social feed.
  - **`r_organization_followers`** – read organization follower stats where supported.

> **Important**: Everything below lists **only endpoints that LinkedIn’s official docs explicitly tie to these scopes.**

---

### 3. Member analytics (followers and post performance)

With `r_member_profileAnalytics` and `r_member_postAnalytics`, you can query:

- **Member post analytics (performance of posts created by the member)**
  - `GET /rest/memberCreatorPostAnalytics?q=me` – aggregated stats for posts created by the connected member.
  - `GET /rest/memberCreatorPostAnalytics?q=entity&entity=(share:urn%3Ali%3Ashare%3A<id>)` – analytics for a specific share or UGC post.
  - **Requires**: `r_member_postAnalytics`.
  - Supported metrics include `IMPRESSION`, `MEMBERS_REACHED`, `RESHARE`, `REACTION`, `COMMENT`, with `aggregation` options such as `DAILY` or `TOTAL`.

- **Member video analytics (for member-created video posts)**
  - `GET /memberCreatorVideoAnalytics?q=entity&postId=<postUrn>` (or `entity=<video-post-urn>` in older v2 forms).
  - **Requires**: `r_member_postAnalytics`.

**Example blueprint node for member post analytics:**

```ts
{
  ref: "linkedin_member_post_analytics",
  type: "http_request",
  name: "LinkedIn Member Post Analytics",
  parameters: {
    method: "GET",
    url: '/rest/memberCreatorPostAnalytics?q=me&queryType=REACTION&aggregation=DAILY',
    connector: 'linkedin',
    timeout: 15000
  }
}
```

Use a transform/code node afterwards to normalize the analytics into your tool’s response (for example `{ totalReactions, timeline }`).

---

### 4. Organization posts and social interactions

With `r_organization_social`, `w_organization_social`, and `r_organization_social_feed`, the connector can interact with organization content and social actions.

#### 5.1 Create organization posts

- **Method**: `POST`
- **URL**: `"/rest/posts"`
- **Connector**: `"linkedin"`
- **Scopes**: `w_organization_social` (maps to `w_organization_social_feed`)

You must supply an `author` URN that LinkedIn recognizes as an organization the member can act on behalf of (discovered via organization/admin lookup APIs).

**Blueprint node (DSL, illustrative):**

```ts
{
  ref: 'linkedin_create_org_post',
  type: 'http_request',
  name: 'LinkedIn Create Organization Post',
  parameters: {
    method: 'POST',
    url: '/rest/posts',
    connector: 'linkedin',
    body: {
      // Shape must match LinkedIn /rest/posts spec.
      author: '{{ state.organizationUrn }}',
      commentary: '{{ input.message }}',
      visibility: '{{ input.visibility || "PUBLIC" }}'
    },
    timeout: 15000
  }
}
```

Expected on success:

- `status` `201` or `200`.
- `body` including a post URN/ID and metadata as defined in LinkedIn’s `/rest/posts` docs.

#### 5.2 Read organization posts

- **Method**: `GET`
- **URL**: `"/rest/posts/{encoded ugcPostUrn|shareUrn}"`
- **Connector**: `"linkedin"`
- **Scopes**: `r_organization_social` and/or `w_organization_social`

Use this to:

- Confirm a post exists and was created successfully.
- Retrieve text, status, timestamps, and landing-page URLs for existing posts.

#### 5.3 Social actions on organization posts

With `r_organization_social` / `w_organization_social` (and the corresponding `*_social_feed` permissions), LinkedIn documents the following endpoints:

- `/reactions` – read/write reactions
- `/socialActions` – read social actions (likes, comments, etc.)
- `/socialActions/comments` – read/write comments
- `/socialActions/likes` – read/write likes
- `/socialMetadata` – read/write social metadata

You can call them via `connector: "linkedin"` using `"/rest/..."` URLs and the HTTP methods documented by LinkedIn (for example `GET /socialActions`, `POST /socialActions/comments` with `CREATE` semantics).

#### 5.4 Video analytics for organization posts

With `r_organization_social` you can call:

- `GET /videoAnalytics` – video analytics for organization posts (for example views, watch time, unique viewers).

Follow LinkedIn’s `videoAnalytics` documentation for expected query parameters (`entity`, `type`, `aggregation`, `timeRange`) and response shape.

---

### 5. Organization lookup and admin context

With `rw_organization_admin` you can use LinkedIn’s Organization APIs to understand which organizations the member can act for (for example, as an admin).

The exact endpoints vary, but they are documented under LinkedIn’s Organization and Organization Access Control APIs. Typical usage:

- Retrieve organizations the member administers.
- Validate that a given organization URN is valid and that the current token has permission to post on its behalf.

You should then store the chosen organization URN in state (for example `state.organizationUrn`) and reuse it in `/rest/posts` and analytics calls.

---

### 6. Recommended patterns

- **Always use `connector: "linkedin"` with relative URLs**  
  Let the HostRuntime handle base URL and auth. Avoid hard-coding `https://api.linkedin.com` unless LinkedIn’s docs explicitly require an absolute URL.

- **Prefer `/rest/...` endpoints over legacy `/v2/...` where both exist**  
  LinkedIn is actively migrating features to `/rest`. Use the versioned `/rest` endpoints documented above (for example `/rest/posts`, `/rest/memberCreatorPostAnalytics`) whenever available.

- **Treat 401/403 as configuration/scope issues**
  - `401` → token invalid/expired or not accepted for this endpoint.
  - `403` → insufficient scopes or no permission for the resource (for example trying to post for an org the member does not administer).  
    Convert these into clear, user-facing error messages.

- **Do not handle secrets in blueprints**
  - Never attempt to read LinkedIn tokens from `ctx.env` or tool parameters.
  - Assume all connector auth is HostRuntime-managed based on starship connector configuration.

- **Normalize outputs**
  - After each LinkedIn call, use Transform/Code nodes to project only the fields your tool’s public interface needs (for example `{ success, profileUrl, postId }`, `{ totalFollowers }`, `{ analyticsTimeline }`).
  - Avoid leaking raw LinkedIn payloads unless explicitly required and safe to expose.
