# Profile Images Implementation Analysis

**Goal:** Add generation for the **3 profile images** (Problem Statements, Capabilities, Try These Prompts) with the **exact same architecture, security, and UX** as the existing avatar. Avatar (1) is already implemented; we add the remaining 3.

---

## 1. Current Avatar Architecture (Reference)

### 1.1 Flow

```
User clicks avatar → Modal opens → Preview + Generate / Regenerate / Reset & Generate
  → POST /agents/:id/avatar/generate { mode?: 'avatar_only' | 'full_chain' }
  → JWT auth + verifyResourceAccess(agent.starshipId, userId, 'agent', agentId)
  → [optional] AvatarGenerationService.generateMirrorDescription() → save avatarPrompt
  → AvatarGenerationService.generateAvatar() → OpenRouter image model (1:1)
  → optimize (sharp, 512px, WebP) → AttachmentService.createAttachment()
  → AgentService.updateAgent(agent.id, { avatarAttachmentId })
  → Client invalidates agent queries → useMessageAttachments([avatarAttachmentId]) → previewUrl → AgentAvatar
```

### 1.2 Security

- **Auth:** `jwtAuthMiddleware` on route.
- **Access:** `verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res)`. User must have **collaborator access** to the agent’s starship (owner, instance admin, or member).
- **Storage:** Attachment is **starship-scoped**; created with `starshipId`, `conversationId: 'agent-avatar-{agentId}'`. S3 key under starship prefix. Presigned URLs via `GET /attachments?ids=...&starshipId=...` (same access checks).

### 1.3 UX

- **Trigger:** Agent profile page header → click avatar → modal.
- **Modal:** Large preview (384×384), LoadingSpinner overlay during generation, Close / “Reset & Generate” (instance-admin only) / “Generate” or “Regenerate”.
- **Display:** `AgentAvatar` with `imageUrl` from attachment `previewUrl`, or initials fallback.

### 1.4 Code Touchpoints

| Layer | Avatar |
|-------|--------|
| **Route** | `POST /agents/:id/avatar/generate`, `DELETE /agents/:id/avatar` |
| **Service** | `AvatarGenerationService` (mirror + `generateAvatar`), `AttachmentService`, `AgentService` |
| **Model** | `agents.avatar_attachment_id`, `agents.avatar_prompt`; `AgentEntity`, `UpdateAgentRequest` |
| **Client** | `useGenerateAgentAvatar`, `useMessageAttachments`, agent profile page modal |

---

## 2. Profile Images: Same Architecture

### 2.1 Storage

- **Pattern:** Same as avatar. Each profile image → **one Attachment** (S3) → **one FK on agent**.
- **New columns (agents):**
  - `problem_statements_attachment_id` (FK → attachments, ON DELETE SET NULL)
  - `capabilities_attachment_id`
  - `try_these_prompts_attachment_id`
- **Migration:** New migration **`087_add_agent_profile_image_attachments`** adding the 3 columns + indexes, mirroring `040_add_agent_avatars`.

### 2.2 API

**Generate (mirror avatar):**

- **Endpoint:** `POST /agents/:id/profile-images/generate`
- **Body:** `{ type: 'problem_statements' | 'capabilities' | 'try_these_prompts' }`
- **Auth:** `jwtAuthMiddleware`.
- **Access:** `verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res)` — **identical** to avatar.
- **Flow:**
  1. Validate `type`; load agent; access check.
  2. **Require `agent.avatarPrompt`.** If missing, return **400** with a clear message (e.g. “Generate an avatar first”).
  3. Fetch tools via `AgentService.getAgentTools(agentId, agent.starshipId)`; build `core_capabilities` from tool names + role + description (see §2.3).
  4. Resolve placeholders (including `avatarPrompt` injection — see §2.5) → `ProfileImageGenerationService.generateProfileImage(agent, type, params)`.
  5. Create attachment (`conversationId: 'agent-profile-{agentId}-{type}'`, `filename: 'agent-{slug}-{type}.webp'`).
  6. `updateAgent(agent.id, { [typeToField(type)]: attachment.id })`.
  7. Return `{ agent, attachment }`.

**Delete (mirror avatar):**

- **Endpoint:** `DELETE /agents/:id/profile-images/:type`
- **Auth + access:** Same as avatar delete.
- **Flow:**
  1. **Validate `:type`** against `problem_statements` | `capabilities` | `try_these_prompts`. If invalid, return **400**.
  2. Resolve FK from `type`; delete attachment (if any); `updateAgent` with that FK `undefined`.

### 2.3 Service: `ProfileImageGenerationService`

- **Location:** `packages/server/src/services/ProfileImageGenerationService.ts`.
- **Reuse:** Same infra as avatar: **RunnerFactory**, OpenRouter, **same image model** (`google/gemini-3-pro-image-preview`), `imageConfig: { aspect_ratio: '1:1', num_images: 1 }`, `modalities: ['image','text']`, `stream: false`. Same **optimization** (e.g. sharp, 512px or 1024px, WebP).
- **Input:** Agent model + `type` + **resolved params** (e.g. `coreCapabilities`, `domainContext`). No LLM “mirror” step; we **reuse `avatarPrompt`** (see §2.5). Prompts are **fixed templates** with placeholder substitution.
- **Prompts:** **Embed the three prompts in-code** (e.g. constants in the service or a shared module). Use `AGENT_PROFILE_IMAGE_PROMPTS.md` as the spec; **do not read the file at runtime.**

**Placeholder resolution:**

| Placeholder | Source |
|-------------|--------|
| `{{name}}` | `agent.name` |
| `{{role}}` | `agent.role` (truncate to 32 chars if needed) |
| `{{category}}` | `agent.category` or `'general'` |
| `{{background_color}}` | Category → color map (see `AGENT_PROFILE_IMAGE_PROMPTS.md`); implement in-code. |
| `{{core_capabilities}}` | **Route fetches tools** via `AgentService.getAgentTools(agentId, starshipId)`; build short bullet list from tool `name` (or `slug`) + `agent.role` + `agent.description`. Pass into service as `coreCapabilities`. If no tools, use role + description only. |
| `{{domain_context}}` | Short summary of expertise from `description` or role; build in route or service. |

**Methods:**

- `generateProfileImage(agent, type, params?: { coreCapabilities?: string; domainContext?: string }): Promise<{ buffer, mimeType }>`  
  - Build prompt from **in-code** template (Prompt 0, 1, or 2 per type), substitute placeholders + **inject `avatarPrompt`** (§2.5), run same blueprint-style LLM image node, extract image, optimize, return buffer + mimeType.

### 2.4 Security Summary

- **Same as avatar:** JWT, `verifyResourceAccess` for agent’s starship, attachments starship-scoped, presigned URLs only via batch attachments API (which checks starship access). No new auth or resource model.

### 2.5 Recommendation B: Reuse `avatarPrompt` (no new mirror)

- **Reuse** the existing `agent.avatarPrompt` (from the avatar “mirror” step) when generating profile images. **Do not** add a new LLM mirror step for the 3 types.
- **Require** `avatarPrompt` for profile image generation. If missing, return **400** and tell the user to generate an avatar first (or use avatar “Reset & Generate”).
- **Inject** `avatarPrompt` into each of the 3 prompts as an extra block, e.g. “Identity (match avatar — use this for character appearance): [avatarPrompt]”. Keep it **additive**; do not remove or override existing instructions.
- **Preserve** all other prompt elements unchanged: **speech bubble texts** (“I've seen this before”, “Here's what I can do.”, “Just tell me what to do”), **eye contact / camera** (“{{name}} must be looking directly at the camera/viewer”), poses, shot specifics, style, and negative constraints. Only add the avatar identity block for character consistency across all 4 images.

---

## 3. UX: Exact Same Pattern as Avatar

### 3.1 Display

- **Where:** Agent profile page (`/ship/[slug]/agent/[agentSlug]`). Add **3 sections** (Problem Statements, Capabilities, Try These Prompts), each with:
  - Section title + optional copy (e.g. short description).
  - **Image:** Placeholder or generated image. Use **attachments**: `useMessageAttachments([problemStatementsAttachmentId, ...], starshipId)` → `previewUrl` per ID. Reuse `AgentProfileImage`-style component (or generic `<img>`) with `src={previewUrl}`.
  - **Trigger:** Click image (or a “Generate” / “Regenerate” control) → **modal** for that type.

### 3.2 Modals

- **One modal per type** (or one modal with **tabs** for the 3 types). Same structure as avatar modal:
  - **Preview:** Large image (or placeholder with “No image yet”).
  - **Loading:** Overlay + `LoadingSpinner` + “Generating…” / “Regenerating…” during `POST .../profile-images/generate`.
  - **Actions:** “Close”, “Generate” (when no image) or “Regenerate” (when image exists). No “Reset & Generate” (that’s avatar-specific mirror flow).
- **Who can generate:** Same as avatar — **any user with starship collaborator access**. No extra “admin only” for profile images.

### 3.3 Client Hooks

- **`useGenerateProfileImage`:**  
  `(input: { agentId: string; type: 'problem_statements' | 'capabilities' | 'try_these_prompts' }) => mutation`  
  - Calls `POST /agents/:id/profile-images/generate` with `{ type }`.  
  - On success: invalidate `AGENT_QUERY_KEYS.detail`, `byStarship`, `all`; toast “Problem Statements image generated” / etc.  
  - On error: toast with error message.
- **Optional:** `useDeleteProfileImage(agentId, type)` for `DELETE .../profile-images/:type`, if we expose “Remove” in the modal.

### 3.4 Parity Checklist

| Aspect | Avatar | Profile images |
|--------|--------|----------------|
| Auth | JWT | JWT |
| Access | verifyResourceAccess(agent) | Same |
| Storage | Attachment + FK | Attachment + FK (×3) |
| Generate endpoint | POST .../avatar/generate | POST .../profile-images/generate |
| Delete endpoint | DELETE .../avatar | DELETE .../profile-images/:type |
| Display | AgentAvatar + useMessageAttachments | Sections + useMessageAttachments |
| Trigger | Click → modal | Click → modal (per type) |
| Loading | Spinner + overlay | Same |
| Toasts | Success / error | Same |

---

## 4. Implementation Checklist

### 4.1 Backend

1. **Migration** (`087_add_agent_profile_image_attachments`)
   - Add `problem_statements_attachment_id`, `capabilities_attachment_id`, `try_these_prompts_attachment_id` to `agents` (FK → attachments, ON DELETE SET NULL).
   - Add indexes for each FK (optional but consistent with avatar).

2. **Protocol + entity**
   - Extend `AgentModel` / `UpdateAgentRequest` with the 3 FKs.
   - Add same fields to `AgentEntity` (and repository update logic if needed).

3. **`ProfileImageGenerationService`**
   - **Embed** the three prompts in-code (no runtime file read). Placeholder substitution (category → color, `core_capabilities`, `domain_context`), plus **avatarPrompt** injection (§2.5).
   - Route fetches tools via `getAgentTools`, builds `coreCapabilities` (and optionally `domainContext`), passes into service.
   - Reuse runner + OpenRouter image model + optimization (mirror `AvatarGenerationService` image path).

4. **Routes**
   - `POST /agents/:id/profile-images/generate` — body `{ type }`, same auth + access as avatar generate; require `avatarPrompt`, fetch tools, build params.
   - `DELETE /agents/:id/profile-images/:type` — same auth + access as avatar delete; **validate `:type`** (return 400 if invalid).

5. **AgentService / AgentRepository**
   - `updateAgent` already accepts `UpdateAgentRequest`; add the 3 new fields there. Repository uses `toDatabase(toEntityInstance(AgentEntity, ...))`, so entity + protocol coverage is enough.

### 4.2 Frontend

1. **Hooks**
   - `useGenerateProfileImage(agentId, type)` calling new generate endpoint, invalidations + toasts.
   - Optional `useDeleteProfileImage` for delete.

2. **Agent profile page**
   - Add 3 sections (Problem Statements, Capabilities, Try These Prompts).
   - Each section: image (from attachment `previewUrl`) or placeholder; click → open modal for that type.
   - Modals: same structure as avatar (preview, loading, Generate/Regenerate, Close).

3. **Attachments**
   - Reuse `useMessageAttachments([id1, id2, id3], starshipId)` for the 3 profile image attachment IDs; map IDs to `previewUrl` per type.

### 4.3 Edge Cases

- **Missing agent data:** If `name` or `role` is missing, validation in generate handler; return 400 with clear message.
- **Missing `avatarPrompt`:** Return 400; tell user to generate an avatar first.
- **Missing category:** Use `'general'` and `background_color: 'gray'`.
- **No tools:** `core_capabilities` from role + description only.
- **Invalid `:type` on DELETE:** Validate against the three allowed values; return 400 if invalid.
- **Image generation failure:** Same as avatar — handle in service, return 5xx; client shows error toast.

---

## 5. Summary

- **Same architecture:** Attachments + FKs, generate/delete API, runner + OpenRouter image model, optimization.
- **Same security:** JWT + `verifyResourceAccess` for agent’s starship; attachments starship-scoped; no new privilege model.
- **Same UX:** Click-to-open modal, preview, Generate/Regenerate, loading overlay, toasts; one modal per profile image type.
- **Recommendation B:** Reuse `avatarPrompt` (no new mirror). Require it for profile image generation; inject into prompts. Keep speech bubbles, eye contact, and all other prompt bits unchanged.

Implementing the migration, service, routes, and frontend hooks + profile page sections/modals as above will give users the ability to generate the 3 profile images with the same architecture, security, and UX as the avatar.

---

## 6. Concrete Implementation Notes

### 6.1 Type Slugs and Fields

Use consistent slugs for API + DB:

- `problem_statements` → `problemStatementsAttachmentId` (camelCase) / `problem_statements_attachment_id` (DB).
- `capabilities` → `capabilitiesAttachmentId` / `capabilities_attachment_id`.
- `try_these_prompts` → `tryThesePromptsAttachmentId` / `try_these_prompts_attachment_id`.

### 6.2 Attachment Metadata

- **`conversationId`:** `agent-profile-${agent.id}-problem_statements` | `capabilities` | `try_these_prompts` (no conversation; purely for partitioning).
- **`filename`:** `agent-${agent.slug || agent.id}-problem-statements.webp` (and similarly for `capabilities`, `try-these-prompts`). Extension from optimized mimeType (always WebP).

### 6.3 Agent Profile Page Layout

- **Current:** Header (avatar + name) → `AgentBuilderView` (form, conversation input when `conversationId` present).
- **Add:** Between header and `AgentBuilderView`, **three sections** (e.g. “Problem Statements”, “Capabilities”, “Try these prompts”). Each: title, image (or placeholder), click → modal. Match marketplace structure where useful (image + text), but use **attachments** for images, not static paths.

### 6.4 Repository / Protocol

- **`AgentEntity`:** Add `problemStatementsAttachmentId?`, `capabilitiesAttachmentId?`, `tryThesePromptsAttachmentId?` with same style as `avatarAttachmentId` (optional, string, length limits).
- **`UpdateAgentRequest`:** Add the same three optional fields so `updateAgent` can persist them.
- **`AgentRepository.update`:** No change beyond entity; it already uses `UpdateAgentRequest` → `AgentEntity` → `toDatabase`.

### 6.5 Modal vs Inline

- **Avatar:** Modal only (no inline “Generate” on the header button). Profile images keep the **same pattern:** click image/card → modal with preview + Generate/Regenerate. No inline generate button required for parity.
