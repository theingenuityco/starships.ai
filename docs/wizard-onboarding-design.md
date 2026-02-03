# Wizard-Style Onboarding Design (Slack-Inspired)

## Goal

Create an intuitive, full-page wizard onboarding for new users—similar to Slack’s “Step 1 of 4” flow—that collects essential setup in a few focused steps, with clear progress, optional/skip where appropriate, and a single primary CTA per step.

---

## Slack Patterns to Adopt

From the reference screens:

| Pattern | Application |
|--------|-------------|
| **Step X of Y** | Always show progress at top of main content. |
| **One goal per step** | One clear question/heading and one primary action (Next). |
| **Benefit-oriented copy** | Short line under the heading explaining why we ask (e.g. “helps teammates recognise you”). |
| **Optional clearly marked** | e.g. “Your profile photo (optional)” so users know they can skip. |
| **Skip / secondary actions** | “Skip this step” or “Copy invitation link” where it makes sense. |
| **Smart defaults** | Pre-fill workspace name (e.g. from domain), default checkbox for “let @domain join”. |
| **Minimal chrome during wizard** | Sidebar with branding + minimal nav (e.g. Home, More); focus on the form. |
| **Primary CTA** | Single prominent “Next” (or “Finish” on last step); secondary actions de-emphasised. |
| **Celebration on completion** | e.g. “Your workspace is ready! ✨” before final CTA. |

---

## Starships.ai Concepts (Current Behaviour)

- **User**: email, displayName, avatar; profile updatable via `PATCH /api/v1/users/me`.
- **Starship**: workspace/team; created on first login with a **random name**; can be renamed via `PUT /api/v1/starships/:id` (`name`).
- **Agents**: Deployed from marketplace; Aria (Executive Officer) is auto-created on first starship.
- **Connectors**: Integrations (Gmail, Slack, etc.); optional.
- **Channels & DMs**: Team and 1:1 conversations; default channel (#lobby) is created with the starship.
- **Invites**: `POST /api/v1/starships/:id/invites` (email, role); returns invite URL; optional email sending.

**Current post-login flow:** Login → create default starship (random name) + initial agents → redirect to `/marketplace` → 6-step **navigation tour** (popups over sidebar). No full-page “name your workspace” or “invite teammates” wizard.

---

## Proposed Wizard: 4 Steps

Assume we keep creating the starship on first login (so the user already has one starship). The wizard then **personalises** that starship and profile and optionally invites others.

### Step 1 of 4: Name your starship

- **Heading:** “What do you want to call your starship?”
- **Subcopy:** “Choose a name your team will recognise—like your company or project.”
- **UI:** Single text input, pre-filled with current starship name (from `GET /users/me` + first starship or `GET /starships/:id`). Character limit hint if we have one (e.g. 42).
- **Action:** “Next” → validate name → `PUT /api/v1/starships/:id` with `{ name }` → go to Step 2.
- **APIs:** `useUserStarships(userId)`, `useUpdateStarship()` with `{ starshipId, updates: { name } }`.

### Step 2 of 4: Your name and photo

- **Heading:** “What’s your name?”
- **Subcopy:** “Adding your name (and photo) helps teammates recognise you in channels and DMs.”
- **UI:** Display name input (pre-filled from `user.displayName` or email local part). Optional “Your profile photo (optional)” with upload (reuse existing profile avatar flow).
- **Action:** “Next” → `PATCH /api/v1/users/me` (displayName, avatar if changed) → Step 3.
- **APIs:** `useUpdateUserProfile()` (or existing account form mutation).

### Step 3 of 4: Invite teammates

- **Heading:** “Who else is on the [Starship Name] team?”
- **Subcopy:** “Invite colleagues by email. They’ll get a link to join this starship.”
- **UI:** Text area or comma-separated emails (placeholder: “e.g. ellis@company.com, maria@company.com”). Optional “Copy invitation link” (generate one invite and show URL). **“Skip this step”** link.
- **Action:** “Next” (sends invites if any) or “Skip this step” → Step 4. If Next with emails: `POST /api/v1/starships/:id/invites` per email (or batch if we add it); then advance.
- **APIs:** `useCreateStarshipInvite(starshipId)`; optional “Copy link” = create one invite, copy `inviteUrl` to clipboard.

### Step 4 of 4: You’re ready

- **Heading:** “Your starship is ready! ✨”
- **Subcopy:** “You can explore agents, connect apps, and talk to Aria in channels or DMs.”
- **UI:** Short benefit list (e.g. “Explore agents from the marketplace”, “Connect Gmail, Slack, and more”, “Chat with Aria in #lobby”). No form.
- **Action:** “Go to my starship” (primary) → mark wizard complete → redirect to `/ship/:slug` (or `/ship/:slug/conversations`). Optionally keep “Start with limited free version” style as secondary (e.g. “Explore marketplace first”) if we want to send them to marketplace instead.
- **API:** New endpoint or reuse: e.g. `POST /api/v1/users/me/onboarding/wizard/complete` → set `wizard_onboarding_completed = true` (new flag) and return user; client then redirects.

---

## Completion and Redirect Logic

- **New flag:** Add `wizardOnboardingCompleted` (or `onboardingWizardCompleted`) to user so we don’t show the wizard again.
- **Post-login redirect (useAuth):**
  - If `!user.wizardOnboardingCompleted` and user has a starship → redirect to `/onboarding` (wizard).
  - Else if `!user.navigationOnboardingCompleted` → current behaviour (e.g. redirect to `/marketplace` for nav tour).
  - Else → redirect to `/ship/:slug`.
- **After wizard completion:** Set `wizardOnboardingCompleted = true`, then redirect to `/ship/:slug`. Optionally set `navigationOnboardingCompleted = true` as well so we skip the popup tour (or keep it for a quick “here’s the sidebar” pass—product choice).

---

## Implementation Outline (6-Layer Alignment)

1. **Protocol**
   - Add `wizardOnboardingCompleted?: boolean` to user type (and any auth response DTOs that expose onboarding state).

2. **Models**
   - Migration: add `wizard_onboarding_completed BOOLEAN NOT NULL DEFAULT false` to `users`.
   - Entity: add optional `wizardOnboardingCompleted` to UserEntity.

3. **Server**
   - **UserService:** `markWizardOnboardingCompleted(userId)` (same pattern as `markNavigationOnboardingCompleted`).
   - **Routes:** `POST /users/me/onboarding/wizard/complete` (jwtAuth, call service, return user). Auth routes: include `wizardOnboardingCompleted` in login/me responses.

4. **Client**
   - **Route:** New app route `app/onboarding/page.tsx` (or `app/onboarding/[[...step]]/page.tsx`) that renders the wizard; guard so only authenticated users with `!wizardOnboardingCompleted` and a starship see it (otherwise redirect).
   - **State:** Wizard step index (1–4), form state per step (starship name, display name, avatar, invite emails). Either URL (e.g. `/onboarding?step=2`) or component state; URL is better for back/refresh.
   - **Hooks:** Reuse `useUserStarships`, `useUpdateStarship`, `useUpdateUserProfile`, `useCreateStarshipInvite`; add `useCompleteWizardOnboarding()` that calls `POST .../onboarding/wizard/complete` and invalidates `['auth','me']`.
   - **UI:** One page with “Step X of 4”, one step component per step (name starship, profile, invite, ready). Shared layout: minimal sidebar (logo + “Starships” or product name) + main content area + “Back” / “Next” / “Skip this step” where applicable.
   - **Auth redirect:** In `useLogin` / `useOAuthLogin` / `useRegister` success, if `!user.wizardOnboardingCompleted` and first starship exists → `router.push('/onboarding')` instead of marketplace/ship.

5. **Navigation tour**
   - Decide: after wizard, redirect to ship and either (a) skip nav tour (`navigationOnboardingCompleted = true` when wizard completes) or (b) show nav tour once. Recommendation: set both flags on wizard completion so the wizard is the only onboarding for new users (simpler).

6. **Copy and accessibility**
   - Use the headings/subcopy above; keep “Next” and “Skip this step” labels clear.
   - Ensure step indicator and form labels are accessible (aria-current, aria-label).

---

## Optional Enhancements (Later)

- **Step 1:** Checkbox “Let anyone with an @yourdomain.com email request to join” (would require backend support for domain-based join).
- **Step 3:** “Add from Google Contacts” style integration if we add contact import.
- **Step 4:** Plan upsell (“Start with Pro” vs “Start with free”) when we have paid tiers; or “Explore marketplace” vs “Go to starship” as two CTAs.

---

## Summary

| Step | Focus | Required | APIs |
|------|--------|----------|------|
| 1 | Name starship | Yes | GET starship, PUT starship |
| 2 | Display name + optional avatar | Name required, photo optional | PATCH users/me |
| 3 | Invite by email / copy link / skip | No | POST starships/:id/invites |
| 4 | Celebration + CTA | — | POST wizard/complete, redirect |

This gives a Slack-like, intuitive flow that fits existing starships.ai features and the current layered architecture.
