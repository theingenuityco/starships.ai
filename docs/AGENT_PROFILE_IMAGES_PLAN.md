# Agent Profile Images & Generation — Implementation Plan

Plan to automate generation and storage of **Capabilities** and **Try These Prompts** profile images for all agents, aligned with the generic template in `AGENT_PROFILE_IMAGE_PROMPTS.md`.

---

## 1. Context (Current State)

| What | Where | Storage | Generation |
|------|--------|---------|------------|
| **Avatar** (1:1) | Ship agent profile, conversations, marketplace hero | Agents: `avatarAttachmentId` → Attachment (S3). Templates: `avatar_s3_key` | POST `/agents/:id/avatar/generate` (manual). Templates: upload/admin |
| **Capabilities + Prompts** (2 images) | Marketplace template page only | Static: `public/marketplace/agents/{name}/capabilities.webp`, `prompts.webp` | None — manual today |

- Marketplace profile page: `getAgentImagePath(template.name, 'capabilities'|'prompts')` → `/marketplace/agents/{name}/{type}.webp`.
- Only **gaia** and **felix** have these files today.
- Avatar generation uses `AvatarGenerationService` (OpenRouter/Gemini); we reuse the same pattern for profile images.

**Goal:** When a new agent/template is added (or on demand), automatically generate and store Capabilities + Try These Prompts images so every agent profile has them.

---

## 2. Design Decisions

### 2.1 Scope

- **Phase 1 — Templates (marketplace):** Generate and store profile images for **agent templates**. Marketplace pages use them via `getAgentImagePath` or new API.
- **Phase 2 (optional):** Add Capabilities / Try These Prompts sections to **ship agent profile** (`/ship/.../agent/[agentSlug]`) and generate for **agent instances** (e.g. Gaia-created agents).

### 2.2 Storage

| Option | Pros | Cons |
|--------|------|------|
| **A) Static files** | No schema changes; `getAgentImagePath` works as-is; CDN-friendly | Requires writing into `public/` (build/CI); awkward for user-generated templates |
| **B) Template S3 + API** | Same pattern as template avatar; scales; works for published templates | New columns; new API routes |
| **C) Attachments** | Reuses attachment pipeline | Attachments are starship-scoped; templates are global |

**Recommendation:**

- **Short term (Phase 1):** **Option A** — script/job writes `public/marketplace/agents/{name}/capabilities.webp` and `prompts.webp`. Keeps current marketplace UI unchanged.
- **Medium term:** **Option B** — add `capabilities_s3_key` / `prompts_s3_key` (or similar) to `agent_templates`, serve via `/api/v1/agent-templates/:id/profile-images/...`, and update marketplace to use those URLs when present.

### 2.3 Generation

- **Service:** New `ProfileImageGenerationService` (or extend `AvatarGenerationService`).
- **Model:** Same as avatars (e.g. OpenRouter Gemini image model).
- **Prompts:** Use `AGENT_PROFILE_IMAGE_PROMPTS.md` — substitute `{{name}}`, `{{role}}`, `{{core_capabilities}}`, `{{category}}`, `{{background_color}}`, `{{domain_context}}` from template (or agent) model.
- **Output:** Two 1:1 images per entity; optimize (e.g. WebP) like avatars.

---

## 3. Implementation Phases

### Phase 1: Profile Image Generation Service

**Tasks:**

1. **Add `ProfileImageGenerationService`** (e.g. under `packages/server/src/services/`).
   - `generateCapabilitiesImage(params)`: build prompt from template, call image model, return `{ buffer, mimeType }`.
   - `generatePromptsImage(params)`: same for “Try These Prompts”.
   - Reuse runner/OpenRouter setup from `AvatarGenerationService` (blueprint, `imageConfig: { aspect_ratio: '1:1', num_images: 1 }`, etc.).
   - Implement placeholder substitution using `AGENT_PROFILE_IMAGE_PROMPTS.md` (or an in-code representation of it).

2. **Parameter resolution.**
   - From **template:** `name`, `role`, `description`, `category`, `assignedToolSlugs`, `previewPrompts`.
   - Derive `core_capabilities`: e.g. from `role` + `description`, or from tool template names for `assignedToolSlugs`.
   - Derive `domain_context`: short summary of expertise (e.g. from `description` or role).
   - Use category → `background_color` mapping from the prompts doc.

3. **Optimization.**
   - Reuse avatar-style optimization (e.g. `sharp`): resize, WebP, consistent max dimension.

4. **Tests.**
   - Unit tests for placeholder substitution and category → color mapping.
   - Integration-style test that mocks image model and asserts two images returned (or skips if no API key).

**Deliverable:** Service that, given a template (or agent) payload, produces two profile images.

---

### Phase 2: Storage — Static Files (Quick Path)

**Tasks:**

1. **CLI or npm script** (e.g. `scripts/generate-profile-images.ts` or `pnpm run generate-profile-images`).
   - Fetch all seeded/public templates (or accept a list of template names/slugs).
   - For each template, call `ProfileImageGenerationService` for capabilities + prompts.
   - Write outputs to `packages/client/public/marketplace/agents/{normalizedName}/capabilities.webp` and `prompts.webp`.
   - Ensure directory exists; overwrite or skip based on flag (e.g. `--overwrite`).

2. **CI / build integration (optional).**
   - Add a job or build step that runs the script after `seed-agent-templates` (or when templates change).
   - Gate on `OPENROUTER_API_KEY` (or similar); no-op if missing.

3. **Docs.**
   - Add a short section in `docs/` or README describing how to run the script and when it’s used.

**Deliverable:** One-shot or CI-triggered generation that populates static profile images for all target templates. Marketplace continues to use `getAgentImagePath`.

---

### Phase 3: Triggers — When to Generate

**Tasks:**

1. **Seed / bootstrap.**
   - After `seed-agent-templates`, optionally run the profile-image script for templates that lack images (or for all).
   - Could be part of migration bootstrap or a separate “post-seed” step.

2. **New template.**
   - On template **create** (or **publish**): either sync generate profile images as part of the flow, or enqueue a job.
   - If using static files: need a defined place to write (e.g. asset pipeline or dedicated volume). Else defer to Phase 4 (S3).

3. **Template update.**
   - Optional: when `name`, `role`, `category`, `assignedToolSlugs`, or `previewPrompts` change, enqueue regeneration.
   - Idempotent: overwrite existing files or S3 objects.

4. **Manual / admin.**
   - Admin or CLI action: “Generate profile images for template X” (or “for all templates”).
   - Useful for backfill and one-off fixes.

**Deliverable:** Clear trigger points (seed, create/publish, update, manual) and a simple way to run generation on demand.

---

### Phase 4 (Optional): Template S3 + API

**Tasks:**

1. **Schema.**
   - Migration: add `capabilities_s3_key`, `capabilities_mime_type`, `prompts_s3_key`, `prompts_mime_type` (and optionally `*_updated_at`) to `agent_templates`.
   - Follow existing `avatar_s3_key` pattern.

2. **Storage.**
   - After generation, upload buffers to S3 (or existing asset bucket); set `*_s3_key` and mime types via `AgentTemplateRepository` update.

3. **API.**
   - `GET /api/v1/agent-templates/:id/profile-images/capabilities` and `.../prompts` that stream or redirect to S3 (similar to avatar).
   - Or single endpoint returning JSON with URLs.

4. **Marketplace.**
   - Update marketplace profile page: if template has `capabilities_s3_key` / `prompts_s3_key`, use API URLs; else fall back to `getAgentImagePath` (static).

**Deliverable:** Profile images stored and served like template avatars; ready for user-published templates.

---

### Phase 5 (Optional): Ship Agent Profile

**Tasks:**

1. **UI.**
   - Add “Capabilities” and “Try these prompts” sections to `/ship/.../agent/[agentSlug]`, similar to marketplace.

2. **Storage for instances.**
   - Add `capabilitiesImageAttachmentId` and `promptsImageAttachmentId` (or equivalent) on **agents**.
   - Use attachments (starship-scoped) for agent-level profile images.

3. **Generation.**
   - On agent **create** (or first profile view): call `ProfileImageGenerationService` with agent model (name, role, description, tools, preview prompts).
   - Store results as attachments; link via new fields.

4. **Trigger.**
   - Agent create hook or lazy generation on first profile load.

**Deliverable:** Ship agent profile pages also show Capabilities and Try These Prompts, with auto-generated images for new agents.

---

## 4. Dependency Overview

```
AGENT_PROFILE_IMAGE_PROMPTS.md (prompt template)
         │
         ▼
ProfileImageGenerationService (placeholder substitution, image model, optimize)
         │
         ├── Phase 2: Script → static files (public/marketplace/agents/...)
         ├── Phase 3: Triggers (seed, create, update, manual)
         ├── Phase 4: S3 + API (templates)
         └── Phase 5: Agent attachments + ship profile UI (optional)
```

---

## 5. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Image model rate limits / cost | Batch script with optional delay; run in CI during off-peak; cache aggressively |
| Inconsistent character across avatar vs profile images | Use same “identity” hints where possible; accept some variance and iterate on prompts |
| Breaking existing marketplace pages | Keep `getAgentImagePath`; use static files in Phase 2, then optional API fallback in Phase 4 |

---

## 6. Success Criteria

- [ ] All seeded (and optionally published) templates have `capabilities.webp` and `prompts.webp` (static or via API).
- [ ] New templates can get profile images automatically or via a single manual action.
- [ ] Prompt structure and placeholders stay aligned with `AGENT_PROFILE_IMAGE_PROMPTS.md`.
- [ ] Generation is reproducible (same template → same prompt; image model may still vary slightly).

---

## 7. References

- **Prompt template:** `AGENT_PROFILE_IMAGE_PROMPTS.md`
- **Avatar generation:** `packages/server/src/services/AvatarGenerationService.ts`
- **Marketplace profile page:** `packages/client/src/app/marketplace/agents/[slug]/page.tsx`
- **Image path helper:** `getAgentImagePath(template.name, 'capabilities'|'prompts')`
- **Template avatar storage:** `AgentTemplateRepository` (e.g. `avatar_s3_key`, `getAvatarStorageById`)
