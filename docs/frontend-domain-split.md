## Frontend domain split: route ownership

This repo is being split into **two separately deployed Next.js frontends**:

- **Landing + Marketplace**: `https://starships.ai` (public SEO pages + Explore marketplace)
- **App**: `https://app.starships.ai` (authenticated workspace)

The backend remains shared and is exposed on both hosts at `https://<host>/api/*`.

### Goals

- Keep the landing/marketplace **cacheable** and SEO-friendly.
- Keep the app **non-cacheable** and isolated behind auth.
- Allow the marketplace on `starships.ai` to be **logged-in aware** by using auth cookies scoped to `.starships.ai`.

---

## Route ownership

### `starships.ai` (landing + marketplace)

- **`/`**: landing
- **`/explore`** and **`/explore/**`**: marketplace listing + details
- **`/marketplace`** and **`/marketplace/**`**: legacy redirects → `/explore/**`
- **`/terms`**, **`/privacy`**
- **`/robots.txt`**, **`/sitemap.xml`**, **`/sitemaps/app.xml`**
- **`/connectors/[provider]/install`**: public connector install/marketing page
  - If the flow requires authentication, it must deep-link to the app domain (`app.starships.ai`) for login/connection completion.

### `app.starships.ai` (authenticated app)

- **`/ship/**`**: primary workspace
- **`/admin/**`**: instance admin UI
- **`/account`**: profile / starship selection
- **`/onboarding`**
- **Auth entry + account flows (live on app domain):**
  - **`/login`**
  - **`/forgot-password`**
  - **`/reset-password`**
  - **`/accept-invite`**

---

## Cross-domain navigation rules

- Landing/marketplace must treat the app as a separate site:
  - Any link to `/ship/*`, `/admin/*`, `/account`, `/login`, `/forgot-password`, `/reset-password`, `/accept-invite` should navigate to the same path on `https://app.starships.ai`.
- App may link back to the marketplace/landing for marketing pages, but should not render them itself.

---

## Cache rules (conceptual)

- `starships.ai`: public HTML can be cached at the edge; assets immutable.
- `app.starships.ai`: all authenticated pages must be `private, no-store`.

---

## Local dev

No reverse proxy in local dev:

- Landing: `http://localhost:3002`
- App: `http://localhost:3003`
- API: `http://localhost:4000`
- Docs: `http://localhost:3001` (if running)

