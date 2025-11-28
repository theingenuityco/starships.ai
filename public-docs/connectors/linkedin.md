## LinkedIn Connector – Technical Reference

This document specifies how to call LinkedIn APIs from tools using the `http_request` node with `connector: "linkedin"`.

Auth is provided by a **LinkedIn OAuth 2.0 access token**, stored per‑starship in the encrypted environments table as `LINKEDIN_ACCESS_TOKEN` and injected at runtime. Tools never see the raw token.

---

### 1. Required headers & endpoint families

LinkedIn has two main endpoint families used by this connector, with slightly different header expectations:

- **`/v2/*` endpoints (UGC, profile, legacy Marketing APIs)**
  - Required:
    - `X-RestLi-Protocol-Version: 2.0.0`
  - Optional / connector-managed:
    - `Authorization: Bearer <token>` (injected by the LinkedIn connector)
  - `LinkedIn-Version` is **not required** for `/v2/*`; if present, LinkedIn generally ignores it.

- **`/rest/*` endpoints (new Posts API and related Marketing APIs)**
  - Required:
    - `X-RestLi-Protocol-Version: 2.0.0`
    - `LinkedIn-Version: {Version in YYYYMM or YYYYMMDD format}` – exact values depend on the specific Marketing product/version.
  - Optional / connector-managed:
    - `Authorization: Bearer <token>` (injected by the LinkedIn connector)

The connector injects these for you so tools normally **do not** set them manually:

- Always injects `Authorization: Bearer <LINKEDIN_ACCESS_TOKEN>` unless you override `Authorization`.
- Always injects `X-RestLi-Protocol-Version: 2.0.0` unless you override it.
- Injects `LinkedIn-Version: 202511` if you did not set any `LinkedIn-Version` header yourself. This header is required by many `/rest/*` endpoints and is harmless for `/v2/*`.

If LinkedIn deprecates that version in the future and starts returning `426 Upgrade Required`, you can override `LinkedIn-Version` per‑request in your node `parameters.headers`.

> ⚠️ **Auto-injected headers – do not set these manually in normal usage**
>
> The LinkedIn connector manages the following headers for you:
>
> - `Authorization: Bearer <LINKEDIN_ACCESS_TOKEN>`
> - `X-RestLi-Protocol-Version: 2.0.0`
> - `LinkedIn-Version: 202511` (or any value you explicitly override it with)
> - `Content-Type: application/json` for object bodies
>
> Only set these headers yourself if you intentionally need to override the connector’s defaults for a specific call (for example, testing a new LinkedIn API version).

---

### 2. Scope → endpoint mapping

The same LinkedIn OAuth scopes can be used with both `/v2/*` and `/rest/*` endpoints. Use this table to pick the right API for your use case:

| Purpose                        | Key scopes (already requested by connector)                            | Endpoint family      | Typical endpoint              | Payload format                         |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------- | ----------------------------- | -------------------------------------- |
| **Member posts**               | `w_member_social`                                                      | `/v2/*`              | `/v2/ugcPosts`                | UGC (`specificContent` + `visibility`) |
| **Organization/company posts** | `w_organization_social`, `rw_organization_admin`                       | `/rest/*`            | `/rest/posts`                 | Posts REST (`commentary`, `content`)   |
| **Read org/member social**     | `r_organization_social`, `r_member_social` (where granted by LinkedIn) | `/rest/*` or `/v2/*` | `/rest/posts`, `/v2/me`, etc. | As per LinkedIn docs                   |

The connector does **not** enforce which endpoint you use; it only manages auth + headers. These docs recommend:

- Use **`/v2/ugcPosts`** for **member** posts.
- Use **`/rest/posts`** for **organization** posts and most newer Marketing features.

---

### 3. Connector behavior

- **URL resolution**
  - When `connector: "linkedin"` is set and `url` starts with `/`, the HostRuntime resolves:
    - `url: "/rest/..."` → `https://api.linkedin.com/rest/...`
    - `url: "/v2/..."` → `https://api.linkedin.com/v2/...`
  - If `url` is an absolute `https://...` URL, it is used as‑is (no prefixing).

- **Auth + required headers injection**
  - For `connector: "linkedin"`, the HostRuntime:
    - Looks up the current starship’s decrypted environment and reads `LINKEDIN_ACCESS_TOKEN`.
    - Injects an `Authorization: Bearer <access_token>` header into the outgoing request **if** you did not explicitly supply any `Authorization` header.
    - Ensures the following headers are present if you did not already set them (any casing):
      - `X-RestLi-Protocol-Version: 2.0.0`
      - `LinkedIn-Version: 202511` (pinned Marketing API version; required by many `/rest/*` endpoints, tolerated on `/v2/*`; you can override it per‑request).
  - If you explicitly set an `Authorization` header (any casing) in `parameters.headers`, that value **takes precedence** and the connector does not overwrite it.

- **Relevant `http_request` parameters**
  - `url: string`
    - Required. Relative (`"/rest/posts"`, `"/v2/me"`, etc.) or absolute.
  - `method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"`
    - Required.
  - `headers?: Record<string, string>`
    - Optional. Non‑secret headers only (e.g. `Content-Type`, `Accept`, `LinkedIn-Version`).
  - `body?: object | string | null`
    - Optional. Objects are JSON‑stringified by the runtime; strings are sent as‑is.
  - `timeout?: number`
    - Optional. Milliseconds; must be ≥ 1000. Default is ~30000ms.
  - `connector: "linkedin"`
    - Required for LinkedIn connector behavior (URL normalization + auth + Rest.li headers).

---

### 4. OAuth + scopes (what the connector is allowed to do)

LinkedIn OAuth is initiated and completed by the backend `ConnectorService` and UI; tools only see the resulting connector.

- **Scopes requested by this connector** (`ConnectorService.LINKEDIN_SCOPES`):
  - Member‑level:
    - `r_basicprofile` – access basic profile fields for the authenticated member.
    - `w_member_social` – create posts on behalf of the authenticated member.
    - `r_member_postAnalytics` – read analytics for the member’s posts.
    - `r_member_profileAnalytics` – read profile analytics for the member.
  - Organization‑level:
    - `rw_organization_admin` – manage organizations the member administers (needed to look up org URNs, ACLs).
    - `r_organization_social` – read organizations’ posts, comments, likes.
    - `w_organization_social` – create posts on behalf of organizations.
    - `r_organization_social_feed` – read the organization’s feed.
    - `r_organization_followers` – read followers for organizations.

What this means for tools:

- You can safely assume the connector has **member posting** and **organization posting** capabilities, subject to:
  - The LinkedIn app’s approved permissions.
  - The authenticated member’s roles on the target organization.
- You do **not** manage scopes in tools; just design for:
  - Clear errors if LinkedIn returns `403` (missing permission or wrong role).
  - Optional fallbacks (e.g., post as member if org posting fails).

---

### 5. Common APIs and patterns

This connector is meant to support:

- **Posts API** (Marketing / Community Management)
  - Create / manage **member** and **organization** posts (text, image, video, article, document, poll, multi‑image, carousel, etc.).
  - Retrieve posts by URN, author, or account.
- **Profile API / `v2/me`**
  - Fetch the authenticated member’s profile URN and key fields needed to construct author URNs.
- **Auxiliary marketing + social APIs**
  - Polls / MultiImage / Articles / Social Actions, where needed.

Below are canonical patterns to follow in blueprints.

---

### 5.1 Get current member profile (`/v2/me`)

- **Use case**: resolve the authenticated member’s person URN for use as `author`.
- **Method**: `GET`
- **URL**: `"/v2/me"`
- **Connector**: `"linkedin"`

**Blueprint node (DSL):**

```ts
{
  ref: "linkedin_me",
  type: "http_request",
  name: "LinkedIn Me",
  parameters: {
    method: "GET",
    url: "/v2/me",
    connector: "linkedin",
    timeout: 15000
  }
}
```

**Typical use in tools:**

- Extract `id` from the response and construct `urn:li:person:{id}` as the member‑level `author` URN.

---

### 5.2 Create a simple member post (`/v2/ugcPosts`)

- **Use case**: post text‑only updates as the authenticated member (UGC).
- **Method**: `POST`
- **URL**: `"/v2/ugcPosts"`
- **Connector**: `"linkedin"`

**Blueprint node (DSL – member UGC post):**

```ts
{
  ref: "linkedin_create_member_post",
  type: "http_request",
  name: "LinkedIn Create Member Post (UGC)",
  parameters: {
    method: "POST",
    url: "/v2/ugcPosts",
    connector: "linkedin",
    headers: {
      // Shown explicitly for clarity; the connector will inject this if omitted.
      "X-RestLi-Protocol-Version": "2.0.0"
    },
    body: {
      author: "{{ input.authorUrn }}", // e.g. "urn:li:person:..."
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: "{{ input.commentary }}"
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "{{ input.visibility || 'PUBLIC' }}"
      }
    },
    timeout: 20000
  }
}
```

**Typical inputs:**

- `authorUrn: string` – `urn:li:person:{id}` for the member.
- `commentary: string` – user‑supplied post text.
- `visibility?: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN"` – defaults to `"PUBLIC"`.

---

### 5.3 Create a simple organization text post (`/rest/posts`)

- **Use case**: post text‑only updates either as the authenticated member or one of their organizations.
- **Method**: `POST`
- **URL**: `"/rest/posts"`
- **Connector**: `"linkedin"`

**Blueprint node (DSL):**

```ts
{
  ref: "linkedin_create_text_post",
  type: "http_request",
  name: "LinkedIn Create Text Post",
  parameters: {
    method: "POST",
    url: "/rest/posts",
    connector: "linkedin",
    headers: {
      "Content-Type": "application/json"
      // Optional: override version if needed
      // "LinkedIn-Version": "202501"
    },
    body: {
      author: "{{ input.authorUrn }}",          // e.g. "urn:li:person:..." or "urn:li:organization:..."
      commentary: "{{ input.commentary }}",     // plain text or little text format
      visibility: "{{ input.visibility || 'PUBLIC' }}",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    },
    timeout: 20000
  }
}
```

**Typical inputs:**

- `authorUrn: string` – `urn:li:person:{id}` or `urn:li:organization:{id}`.
- `commentary: string` – user‑supplied post text.
- `visibility?: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN" | "CONTAINER"` – defaults to `"PUBLIC"`.

**Expected behavior:**

- On success LinkedIn returns `201` with `x-restli-id` header containing the post URN (`urn:li:share:...` or `urn:li:ugcPost:...`).

---

### 5.4 Create a media / article post (organization, `/rest/posts`)

- **Use case**: create a post that links to a LinkedIn asset (image, video, document, article thumbnail, etc.).
- **Pre‑step**: upload the asset via LinkedIn’s **Images**, **Videos**, or **Documents** API using the same connector to obtain an asset URN (for example, `urn:li:image:{id}`, `urn:li:video:{id}`, `urn:li:document:{id}`).
- **Method**: `POST`
- **URL**: `"/rest/posts"`
- **Connector**: `"linkedin"`

**Blueprint node (DSL – video example):**

```ts
{
  ref: "linkedin_create_video_post",
  type: "http_request",
  name: "LinkedIn Create Video Post",
  parameters: {
    method: "POST",
    url: "/rest/posts",
    connector: "linkedin",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      author: "{{ input.authorUrn }}",
      commentary: "{{ input.commentary }}",
      visibility: "{{ input.visibility || 'PUBLIC' }}",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      content: {
        media: {
          title: "{{ input.mediaTitle || '' }}",
          id: "{{ input.mediaUrn }}"      // e.g. "urn:li:video:..."
        }
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    },
    timeout: 30000
  }
}
```

**Article example (thumbnail + metadata):**

```ts
{
  ref: "linkedin_create_article_post",
  type: "http_request",
  name: "LinkedIn Create Article Post",
  parameters: {
    method: "POST",
    url: "/rest/posts",
    connector: "linkedin",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      author: "{{ input.authorUrn }}",
      commentary: "{{ input.commentary }}",
      visibility: "{{ input.visibility || 'PUBLIC' }}",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      content: {
        article: {
          source: "{{ input.url }}",
          thumbnail: "{{ input.thumbnailUrn }}",   // from Images API
          title: "{{ input.title }}",
          description: "{{ input.description || '' }}"
        }
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    },
    timeout: 30000
  }
}
```

---

### 3.4 Create a reshare

- **Use case**: reshare an existing post on the member or organization feed.
- **Method**: `POST`
- **URL**: `"/rest/posts"`
- **Connector**: `"linkedin"`

**Blueprint node (DSL):**

```ts
{
  ref: "linkedin_create_reshare",
  type: "http_request",
  name: "LinkedIn Create Reshare",
  parameters: {
    method: "POST",
    url: "/rest/posts",
    connector: "linkedin",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      author: "{{ input.authorUrn }}",
      commentary: "{{ input.commentary || '' }}",
      visibility: "{{ input.visibility || 'PUBLIC' }}",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      reshareContext: {
        parent: "{{ input.parentPostUrn }}"   // e.g. "urn:li:share:..."
      }
    },
    timeout: 20000
  }
}
```

---

### 3.5 Targeted organic posts

- **Use case**: restrict delivery to a specific audience (geo, seniority, etc.) while still posting organically.
- **Method**: `POST`
- **URL**: `"/rest/posts"`
- **Connector**: `"linkedin"`

**Blueprint node (DSL – video example):**

```ts
{
  ref: "linkedin_create_targeted_post",
  type: "http_request",
  name: "LinkedIn Create Targeted Post",
  parameters: {
    method: "POST",
    url: "/rest/posts",
    connector: "linkedin",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      author: "{{ input.authorUrn }}",
      commentary: "{{ input.commentary }}",
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [
          {
            geoLocations: "{{ input.geoLocations || [] }}",   // e.g. ["urn:li:geo:103644278"]
            seniorities: "{{ input.seniorities || [] }}"      // e.g. ["urn:li:seniority:3"]
          }
        ],
        thirdPartyDistributionChannels: []
      },
      content: {
        media: {
          title: "{{ input.mediaTitle || '' }}",
          id: "{{ input.mediaUrn }}"
        }
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    },
    timeout: 30000
  }
}
```

**Notes:**

- Use the **Audience Counts API** (`/rest/audienceCounts`) first to ensure the audience is ≥ 300 members before posting.
- The connector does not enforce this; tools should enforce it at the blueprint / logic layer.

---

### 3.6 Read posts

Common read paths:

- **Get a single post by URN**
  - `GET /rest/posts/{encoded ugcPostUrn|shareUrn}`
- **Batch get posts**
  - `GET /rest/posts?ids=List({encoded ugcPostUrn},{encoded shareUrn})` with header `X-RestLi-Method: batch_get`.
- **Find by author**
  - `GET /rest/posts?author={encoded personOrOrgUrn}&q=author&count=10&sortBy=LAST_MODIFIED`

**Blueprint node (DSL – get by URN):**

```ts
{
  ref: "linkedin_get_post",
  type: "http_request",
  name: "LinkedIn Get Post",
  parameters: {
    method: "GET",
    url: "/rest/posts/{{ input.encodedPostUrn }}",
    connector: "linkedin",
    timeout: 15000
  }
}
```

**Blueprint node (DSL – batch get):**

```ts
{
  ref: "linkedin_batch_get_posts",
  type: "http_request",
  name: "LinkedIn Batch Get Posts",
  parameters: {
    method: "GET",
    url: "/rest/posts?ids=List({{ input.encodedPostUrns }})",
    connector: "linkedin",
    headers: {
      "X-RestLi-Method": "BATCH_GET"
    },
    timeout: 20000
  }
}
```

Tools should:

- URL‑encode URNs before putting them into the path or query.
- Normalize responses into lightweight objects (e.g., `{ id, author, commentary, contentType, publishedAt }`).

---

### 3.7 Update and delete posts

- **Update** (partial):
  - `POST /rest/posts/{encoded ugcPostUrn|shareUrn}` with `X-RestLi-Method: PARTIAL_UPDATE`.
  - Body uses `$set` semantics for fields like `commentary`, `contentCallToActionLabel`, `contentLandingPage`, or certain `adContext` fields.
- **Delete**:
  - `DELETE /rest/posts/{encoded ugcPostUrn|shareUrn}`.
  - Deletions are idempotent; LinkedIn returns `204` even if already deleted.

**Blueprint node (DSL – partial update commentary + CTA):**

```ts
{
  ref: "linkedin_update_post",
  type: "http_request",
  name: "LinkedIn Update Post",
  parameters: {
    method: "POST",
    url: "/rest/posts/{{ input.encodedPostUrn }}",
    connector: "linkedin",
    headers: {
      "Content-Type": "application/json",
      "X-RestLi-Method": "PARTIAL_UPDATE"
    },
    body: {
      patch: {
        "$set": {
          commentary: "{{ input.commentary }}",
          contentCallToActionLabel: "{{ input.callToActionLabel || undefined }}"
        }
      }
    },
    timeout: 20000
  }
}
```

**Blueprint node (DSL – delete):**

```ts
{
  ref: "linkedin_delete_post",
  type: "http_request",
  name: "LinkedIn Delete Post",
  parameters: {
    method: "DELETE",
    url: "/rest/posts/{{ input.encodedPostUrn }}",
    connector: "linkedin",
    timeout: 15000
  }
}
```

---

### 4. Mentions, hashtags, and commentary formatting

The Posts API accepts **little text format** in the `commentary` field to mention organizations or members and to tag hashtags.

- **Organization mention example:**
  - Commentary: `"Hello @[Devtestco](urn:li:organization:2414183)"`
  - LinkedIn will render `Devtestco` as a clickable mention.
- **Hashtag example:**
  - Commentary: `"Follow best practices #coding"`
  - When retrieved, the commentary may be returned with a template such as `"Follow best practices {hashtag|\\#|coding}"`.

**Blueprint guidance:**

- Let tools build `commentary` strings with these annotations; the connector simply forwards them.
- Normalize **read** paths by either:
  - Returning the raw `commentary` string.
  - Or post‑processing little text markup into a richer structure (mentions + hashtags) in a Transform/Code node.

Relevant LinkedIn docs:

- Posts API + little text format.
- Organization Access Control.

---

### 5. Error handling & best practices

- **Permission / role failures**
  - `401` / `403` from LinkedIn usually mean:
    - The linked member or app does not have the required permission (scope or product).
    - The member lacks the necessary organization role (for example, not an ADMINISTRATOR).
  - Tools should convert these into clear, user‑facing errors such as:
    - `"LinkedIn connector is missing required permission w_organization_social"`
    - `"Connected LinkedIn member is not an admin of organization {orgUrn}"`

- **Rate limiting & transient errors**
  - Handle `429` and `5xx` with retries or backoff if appropriate, but avoid uncontrolled loops.

- **Secrets**
  - Do **not** read or log `LINKEDIN_ACCESS_TOKEN`; the connector injects it server‑side.
  - Never echo LinkedIn bearer tokens or sensitive headers into tool outputs or user‑visible logs.

- **Keep LinkedIn logic localized**
  - Group LinkedIn `http_request` nodes inside dedicated tools/blueprints so you can:
    - Adjust headers and payloads if the API changes.
    - Swap versions or add new features (polls, carousels, dark posts) with minimal blast radius.

---

### 6. Summary

When using the LinkedIn connector in Starships:

- Always use **`connector: "linkedin"` + relative URLs** (`/rest/...` or `/v2/...`).
- Assume `Authorization`, `X-RestLi-Protocol-Version`, and `LinkedIn-Version` are injected automatically unless you override them.
- Use the Posts API for creating and managing posts, and `/v2/me` + organization lookup flows to determine appropriate `author` URNs.
- Handle LinkedIn’s permission and visibility rules at the tool level, with clear, human‑readable error messages.
