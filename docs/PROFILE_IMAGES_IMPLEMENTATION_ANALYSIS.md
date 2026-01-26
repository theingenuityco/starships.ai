# Profile Images Implementation Analysis

**Goal:** Add generation for the **3 profile images** (Problem Statements, Capabilities, Try These Prompts) with the **exact same architecture, security, and UX** as the existing avatar. Avatar (1) is already implemented; we add the remaining 3.

## 📊 Implementation Progress

**Overall Status:** 🟡 Not Started

| Phase | Status | Progress | Tasks |
|-------|--------|----------|-------|
| Phase 1: Database & Models | ⬜ Not Started | 0/3 (0%) | [ ] 0/3 complete |
| Phase 2: Backend Service | ⬜ Not Started | 0/1 (0%) | [ ] 0/1 complete |
| Phase 3: Backend Routes | ⬜ Not Started | 0/3 (0%) | [ ] 0/3 complete |
| Phase 4: Frontend Hooks | ⬜ Not Started | 0/2 (0%) | [ ] 0/2 complete |
| Phase 5: Frontend UI Components | ⬜ Not Started | 0/3 (0%) | [ ] 0/3 complete |
| Phase 6: Testing & Edge Cases | ⬜ Not Started | 0/6 (0%) | [ ] 0/6 complete |

**Total:** 0/18 tasks complete (0%)

**Legend:**
- ⬜ Not Started
- 🟡 In Progress  
- ✅ Complete
- ⏭️ Skipped

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
- **Access:** `verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res)`. User must have **collaborator access** to the agent's starship (owner, instance admin, or member).
- **Storage:** Attachment is **starship-scoped**; created with `starshipId`, `conversationId: 'agent-avatar-{agentId}'`. S3 key under starship prefix. Presigned URLs via `GET /attachments?ids=...&starshipId=...` (same access checks).

### 1.3 UX

- **Trigger:** Agent profile page header → click avatar → modal.
- **Modal:** Large preview (384×384), LoadingSpinner overlay during generation, Close / "Reset & Generate" (instance-admin only) / "Generate" or "Regenerate".
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
- **Migration:** New migration **`088_add_agent_profile_image_attachments`** adding the 3 columns + indexes, mirroring `040_add_agent_avatars`.

### 2.2 API

**Generate (mirror avatar):**

- **Endpoint:** `POST /agents/:id/profile-images/generate`
- **Body:** `{ type: 'problem_statements' | 'capabilities' | 'try_these_prompts' }`
- **Auth:** `jwtAuthMiddleware`.
- **Access:** `verifyResourceAccess(agent.starshipId, req.user!.id, 'agent', agentId, res)` — **identical** to avatar.
- **Flow:**
  1. Validate `type`; load agent; access check.
  2. **Require `agent.avatarPrompt`.** If missing, return **400** with a clear message (e.g. "Generate an avatar first").
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
- **Reuse:** Same infra as avatar: **RunnerFactory**, OpenRouter, **same image model** (`google/gemini-3-pro-image-preview`), `imageConfig: { aspect_ratio: '1:1', num_images: 1 }`, `modalities: ['image','text']`, `stream: false`. Same **optimization** (sharp, **512px**, WebP).
- **Input:** Agent model + `type` + **resolved params** (e.g. `coreCapabilities`, `domainContext`). No LLM "mirror" step; we **reuse `avatarPrompt`** (see §2.5). Prompts are **fixed templates** with placeholder substitution.
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

- **Same as avatar:** JWT, `verifyResourceAccess` for agent's starship, attachments starship-scoped, presigned URLs only via batch attachments API (which checks starship access). No new auth or resource model.

### 2.5 Recommendation B: Reuse `avatarPrompt` (no new mirror)

- **Reuse** the existing `agent.avatarPrompt` (from the avatar "mirror" step) when generating profile images. **Do not** add a new LLM mirror step for the 3 types.
- **Require** `avatarPrompt` for profile image generation. If missing, return **400** and tell the user to generate an avatar first (or use avatar "Reset & Generate").
- **Inject** `avatarPrompt` into each of the 3 prompts as an extra block, e.g. "Identity (match avatar — use this for character appearance): [avatarPrompt]". Keep it **additive**; do not remove or override existing instructions.
- **Preserve** all other prompt elements unchanged: **speech bubble texts** ("I've seen this before", "Here's what I can do.", "Just tell me what to do"), **eye contact / camera** ("{{name}} must be looking directly at the camera/viewer"), poses, shot specifics, style, and negative constraints. Only add the avatar identity block for character consistency across all 4 images.

---

## 3. UX: Exact Same Pattern as Avatar

### 3.1 Display

- **Where:** Agent profile page (`/ship/[slug]/agent/[agentSlug]`). Add **3 sections** (Problem Statements, Capabilities, Try These Prompts), each with:
  - Section title + optional copy (e.g. short description).
  - **Image:** Placeholder or generated image. Use **attachments**: `useMessageAttachments([problemStatementsAttachmentId, ...], starshipId)` → `previewUrl` per ID. Reuse `AgentProfileImage`-style component (or generic `<img>`) with `src={previewUrl}`.
  - **Trigger:** Click image (or a "Generate" / "Regenerate" control) → **modal** for that type.

### 3.2 Modals

- **One modal per type** (separate modals, matching avatar pattern). Same structure as avatar modal:
  - **Preview:** Large image (or placeholder with "No image yet").
  - **Loading:** Overlay + `LoadingSpinner` + "Generating…" / "Regenerating…" during `POST .../profile-images/generate`.
  - **Actions:** "Close", "Generate" (when no image) or "Regenerate" (when image exists). No "Reset & Generate" (that's avatar-specific mirror flow).
- **Who can generate:** Same as avatar — **any user with starship collaborator access**. No extra "admin only" for profile images.

### 3.3 Client Hooks

- **`useGenerateProfileImage`:**  
  `(input: { agentId: string; type: 'problem_statements' | 'capabilities' | 'try_these_prompts' }) => mutation`  
  - Calls `POST /agents/:id/profile-images/generate` with `{ type }`.  
  - On success: invalidate `AGENT_QUERY_KEYS.detail`, `byStarship`, `all`; toast "Problem Statements image generated" / etc.  
  - On error: toast with error message.
- **Optional:** `useDeleteProfileImage(agentId, type)` for `DELETE .../profile-images/:type`, if we expose "Remove" in the modal.

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

### Progress Overview

- **Phase 1: Database & Models** - [ ] 0/3 tasks complete
- **Phase 2: Backend Service** - [ ] 0/1 tasks complete
- **Phase 3: Backend Routes** - [ ] 0/3 tasks complete
- **Phase 4: Frontend Hooks** - [ ] 0/2 tasks complete
- **Phase 5: Frontend UI Components** - [ ] 0/3 tasks complete
- **Phase 6: Testing & Edge Cases** - [ ] 0/6 tasks complete

**Total Progress:** [ ] 0/18 tasks complete

---

### Phase 1: Database & Models

#### Task 1.1: Migration
- [ ] Create migration file `088_add_agent_profile_image_attachments.ts`
- [ ] Add `problem_statements_attachment_id` column (FK → attachments, ON DELETE SET NULL)
- [ ] Add `capabilities_attachment_id` column (FK → attachments, ON DELETE SET NULL)
- [ ] Add `try_these_prompts_attachment_id` column (FK → attachments, ON DELETE SET NULL)
- [ ] Add indexes for each FK (optional but consistent with avatar)
- [ ] Test migration up/down

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 1.2: Protocol Layer
- [ ] Add `problemStatementsAttachmentId?` to `AgentModel` interface (`packages/protocol/src/domains/agent.ts`)
- [ ] Add `capabilitiesAttachmentId?` to `AgentModel` interface
- [ ] Add `tryThesePromptsAttachmentId?` to `AgentModel` interface
- [ ] Add same 3 fields to `UpdateAgentRequest` interface
- [ ] Verify TypeScript compilation

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 1.3: Entity Layer
- [ ] Add `problemStatementsAttachmentId?` to `AgentEntity` class (`packages/models/src/entities/AgentEntity.ts`)
- [ ] Add `capabilitiesAttachmentId?` to `AgentEntity` class
- [ ] Add `tryThesePromptsAttachmentId?` to `AgentEntity` class
- [ ] Add same validation decorators as `avatarAttachmentId` (optional, string, length limits)
- [ ] Verify entity transformation works

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

---

### Phase 2: Backend Service

#### Task 2.1: ProfileImageGenerationService
- [ ] Create `packages/server/src/services/ProfileImageGenerationService.ts`
- [ ] Embed three prompt templates as constants (from `AGENT_PROFILE_IMAGE_PROMPTS.md`)
- [ ] Implement `substitutePlaceholders()` method
- [ ] Implement `getBackgroundColor()` method with category → color mapping
- [ ] Implement `optimizeProfileImage()` method (512px, WebP, same as avatar)
- [ ] Implement `generateProfileImage()` method:
  - [ ] Build prompt from template based on type
  - [ ] Substitute placeholders (name, role, category, background_color, core_capabilities, domain_context)
  - [ ] Inject `avatarPrompt` in "Identity" section
  - [ ] Build blueprint with LLM node (same as avatar)
  - [ ] Run via RunnerFactory
  - [ ] Extract image from response
  - [ ] Optimize image (512px, WebP)
  - [ ] Return buffer + mimeType
- [ ] Add error handling matching avatar pattern

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

---

### Phase 3: Backend Routes

#### Task 3.1: Generate Endpoint
- [ ] Add route `POST /agents/:id/profile-images/generate` in `packages/server/src/routes/agents.ts`
- [ ] Add JWT auth middleware
- [ ] Add request body validation (Zod schema for `{ type }`)
- [ ] Load agent and verify access via `verifyResourceAccess()`
- [ ] Validate `agent.avatarPrompt` exists (return 400 if missing)
- [ ] Fetch tools via `AgentService.getAgentTools(agentId, starshipId)`
- [ ] Build `coreCapabilities` string (comma-separated, max 200 chars)
- [ ] Build `domainContext` string (first sentence or 100 chars)
- [ ] Call `ProfileImageGenerationService.generateProfileImage()`
- [ ] Create attachment via `AttachmentService.createAttachment()`
- [ ] Update agent via `AgentService.updateAgent()` with correct FK field
- [ ] Return `{ agent, attachment }`
- [ ] Add error handling with `handleError()`

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 3.2: Delete Endpoint
- [ ] Add route `DELETE /agents/:id/profile-images/:type` in `packages/server/src/routes/agents.ts`
- [ ] Add JWT auth middleware
- [ ] Validate `:type` parameter (return 400 if invalid)
- [ ] Load agent and verify access via `verifyResourceAccess()`
- [ ] Map type to field name (inline object)
- [ ] Delete attachment if exists via `AttachmentService.deleteAttachment()`
- [ ] Update agent with FK set to `undefined`
- [ ] Return updated agent
- [ ] Add error handling with `handleError()`

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 3.3: Update Zod Schema
- [ ] Add `problemStatementsAttachmentId` to `UpdateAgentSchema` in routes
- [ ] Add `capabilitiesAttachmentId` to `UpdateAgentSchema`
- [ ] Add `tryThesePromptsAttachmentId` to `UpdateAgentSchema`
- [ ] Verify validation works

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

---

### Phase 4: Frontend Hooks

#### Task 4.1: useGenerateProfileImage Hook
- [ ] Create `useGenerateProfileImage` hook in `packages/client/src/hooks/useAgents.ts` (or new file)
- [ ] Implement mutation function calling `POST /agents/:id/profile-images/generate`
- [ ] Add success handler:
  - [ ] Invalidate `AGENT_QUERY_KEYS.detail(agentId)`
  - [ ] Invalidate `AGENT_QUERY_KEYS.byStarship(starshipId)`
  - [ ] Invalidate `AGENT_QUERY_KEYS.all`
  - [ ] Show success toast with type name
- [ ] Add error handler with error toast
- [ ] Match pattern from `useGenerateAgentAvatar` exactly

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 4.2: useDeleteProfileImage Hook (Optional)
- [ ] Create `useDeleteProfileImage` hook
- [ ] Implement mutation function calling `DELETE /agents/:id/profile-images/:type`
- [ ] Add success/error handlers with query invalidation and toasts
- [ ] Only needed if "Remove" button is added to modals

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete | [ ] Skipped

---

### Phase 5: Frontend UI Components

#### Task 5.1: Profile Image Sections
- [ ] Add three sections to agent profile page (`packages/client/src/app/ship/[slug]/agent/[agentSlug]/page.tsx`)
- [ ] Position sections between header and `AgentBuilderView`
- [ ] Each section:
  - [ ] Section title ("Problem Statements", "Capabilities", "Try These Prompts")
  - [ ] Image display (from `useMessageAttachments` → `previewUrl`)
  - [ ] Placeholder when no image
  - [ ] Click handler to open modal
- [ ] Fetch attachment IDs from agent model
- [ ] Use `useMessageAttachments([id1, id2, id3], starshipId)` for all three

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 5.2: Profile Image Modals
- [ ] Create three modal states (one per type)
- [ ] Implement `Dialog` component for Problem Statements modal:
  - [ ] Preview image (384×384 or similar)
  - [ ] Loading overlay with `LoadingSpinner` during generation
  - [ ] "Close" button
  - [ ] "Generate" or "Regenerate" button
- [ ] Implement `Dialog` component for Capabilities modal (same structure)
- [ ] Implement `Dialog` component for Try These Prompts modal (same structure)
- [ ] Match avatar modal structure exactly (lines 312-347 in page.tsx)

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 5.3: Modal Integration
- [ ] Connect modals to `useGenerateProfileImage` hook
- [ ] Add loading state management per modal
- [ ] Handle success/error states in modals
- [ ] Update image display after successful generation
- [ ] Test all three modals independently

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

---

### Phase 6: Testing & Edge Cases

#### Task 6.1: Missing Agent Data
- [ ] Test: Missing `name` → return 400 with clear message
- [ ] Test: Missing `role` → return 400 with clear message
- [ ] Add validation in generate handler

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 6.2: Missing Avatar Prompt
- [ ] Test: Missing `avatarPrompt` → return 400
- [ ] Verify error message tells user to generate avatar first
- [ ] Test user flow: generate avatar → then profile images

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 6.3: Missing Category
- [ ] Test: Missing `category` → use `'general'`
- [ ] Test: `background_color` defaults to `'gray'`
- [ ] Verify all categories map correctly

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 6.4: No Tools
- [ ] Test: Agent with no tools → `core_capabilities` from role + description
- [ ] Verify fallback logic works
- [ ] Test truncation at 200 chars

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 6.5: Invalid Type Parameter
- [ ] Test: Invalid `:type` on DELETE → return 400
- [ ] Test: Invalid `type` in POST body → return 400
- [ ] Verify validation against three allowed values

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

#### Task 6.6: Image Generation Failure
- [ ] Test: Image generation service failure → return 5xx
- [ ] Test: Client shows error toast
- [ ] Test: Attachment cleanup on failure (if applicable)
- [ ] Match error handling pattern from avatar

**Status:** [ ] Not Started | [ ] In Progress | [ ] Complete

---

## 5. Summary

- **Same architecture:** Attachments + FKs, generate/delete API, runner + OpenRouter image model, optimization.
- **Same security:** JWT + `verifyResourceAccess` for agent's starship; attachments starship-scoped; no new privilege model.
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
- **Add:** Between header and `AgentBuilderView`, **three sections** (e.g. "Problem Statements", "Capabilities", "Try these prompts"). Each: title, image (or placeholder), click → modal. Match marketplace structure where useful (image + text), but use **attachments** for images, not static paths.

### 6.4 Repository / Protocol

- **`AgentEntity`:** Add `problemStatementsAttachmentId?`, `capabilitiesAttachmentId?`, `tryThesePromptsAttachmentId?` with same style as `avatarAttachmentId` (optional, string, length limits).
- **`UpdateAgentRequest`:** Add the same three optional fields so `updateAgent` can persist them.
- **`AgentRepository.update`:** No change beyond entity; it already uses `UpdateAgentRequest` → `AgentEntity` → `toDatabase`.

### 6.5 Modal vs Inline

- **Avatar:** Modal only (no inline "Generate" on the header button). Profile images keep the **same pattern:** click image/card → modal with preview + Generate/Regenerate. No inline generate button required for parity.

---

## 7. Implementation Details (Resolved from Avatar Patterns)

### 7.1 Image Optimization

**Answer:** Use **512px** (same as avatar).

- **Source:** `AvatarGenerationService.optimizeAvatarImage()` line 37: `const targetMax = 512;`
- **Rationale:** "Typical UI sizes are 14–40px; largest preview in app is ~384px. 512px gives a crisp result with minimal over-download."
- **Implementation:** Reuse the same `optimizeAvatarImage` pattern:
  ```typescript
  private async optimizeProfileImage(input: { buffer: Buffer; mimeType: string }): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!input.mimeType.startsWith('image/')) return input;
    if (input.mimeType === 'image/gif') return input;
    
    try {
      const targetMax = 512; // Same as avatar
      const out = await sharp(input.buffer)
        .rotate()
        .resize(targetMax, targetMax, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
      return { buffer: out, mimeType: 'image/webp' };
    } catch {
      return input;
    }
  }
  ```

### 7.2 Avatar Prompt Injection Format

**Answer:** Inject in "Identity" section, matching avatar pattern exactly.

- **Source:** `AvatarGenerationService.generateAvatar()` lines 269-274
- **Format:**
  ```typescript
  const user = [
    // ... existing prompt template with placeholders substituted ...
    '',
    'Identity (match avatar — use this for character appearance):',
    agent.avatarPrompt ? ['Avatar prompt (primary):', agent.avatarPrompt].join('\n') : undefined,
    '',
    // ... rest of prompt (Output, constraints, etc.) ...
  ].filter(Boolean).join('\n');
  ```
- **Location:** Add after placeholder substitution, before "Output:" or final constraints section.

### 7.3 Type-to-Field Mapping

**Answer:** Simple inline object mapping in route handler.

- **Pattern:**
  ```typescript
  const fieldMap: Record<string, keyof Pick<AgentModel, 'problemStatementsAttachmentId' | 'capabilitiesAttachmentId' | 'tryThesePromptsAttachmentId'>> = {
    problem_statements: 'problemStatementsAttachmentId',
    capabilities: 'capabilitiesAttachmentId',
    try_these_prompts: 'tryThesePromptsAttachmentId',
  };
  
  const fieldName = fieldMap[type];
  if (!fieldName) {
    sendError(res, 'VALIDATION_ERROR', `Invalid type: ${type}`, 400);
    return;
  }
  
  await agentService.updateAgent(agent.id, { [fieldName]: attachment.id });
  ```

### 7.4 Core Capabilities Format

**Answer:** Comma-separated list, max 200 chars.

- **Pattern:**
  ```typescript
  // In route handler, after fetching tools:
  const tools = await agentService.getAgentTools(agentId, agent.starshipId);
  let coreCapabilities: string;
  
  if (tools.length > 0) {
    coreCapabilities = tools.map(t => t.name || t.slug).join(', ');
  } else {
    // Fallback: use role + description
    const parts: string[] = [];
    if (agent.role) parts.push(agent.role);
    if (agent.description) {
      const desc = agent.description.length > 100 
        ? agent.description.slice(0, 100) + '...' 
        : agent.description;
      parts.push(desc);
    }
    coreCapabilities = parts.join(' — ') || 'general assistance';
  }
  
  // Truncate if too long
  if (coreCapabilities.length > 200) {
    coreCapabilities = coreCapabilities.slice(0, 197) + '...';
  }
  ```

### 7.5 Domain Context Format

**Answer:** First sentence or first 100 chars of description, fallback to role.

- **Pattern:**
  ```typescript
  function buildDomainContext(agent: AgentModel): string {
    if (agent.description) {
      const firstSentence = agent.description.split(/[.!?]/)[0].trim();
      if (firstSentence.length > 0 && firstSentence.length <= 100) {
        return firstSentence;
      }
      return agent.description.slice(0, 100).trim();
    }
    return agent.role || 'general assistance';
  }
  ```

### 7.6 UpdateAgentRequest Schema

**Answer:** Fields work via `Partial<>`, but add explicit Zod validation for clarity.

- **Current:** `UpdateAgentRequest` extends `Partial<Omit<AgentParamsWithoutMetadata, 'reasoning'>>`, and `AgentModel` includes `avatarAttachmentId`, so new fields will work.
- **Recommendation:** Add explicit validation in `UpdateAgentSchema`:
  ```typescript
  const UpdateAgentSchema = z.object({
    // ... existing fields ...
    avatarAttachmentId: z.string().min(1).max(255).optional(),
    avatarPrompt: z.string().max(8000).optional(),
    problemStatementsAttachmentId: z.string().min(1).max(255).optional(),
    capabilitiesAttachmentId: z.string().min(1).max(255).optional(),
    tryThesePromptsAttachmentId: z.string().min(1).max(255).optional(),
  });
  ```

### 7.7 Error Handling Pattern

**Answer:** Simple try/catch with `handleError`, no rollback (same as avatar).

- **Source:** Avatar route lines 579-581, DELETE route lines 608-612
- **Pattern:**
  ```typescript
  try {
    // ... generate image, create attachment, update agent ...
    sendSuccess(res, { agent: updated, attachment });
  } catch (error) {
    handleError(error, res, 'generating profile image');
  }
  ```
- **Note:** If attachment creation succeeds but agent update fails, the attachment remains orphaned (same as avatar). Acceptable because attachments are cleaned up by S3 lifecycle or next generation overwrites.

### 7.8 Modal Implementation Pattern

**Answer:** **Separate modals per type** (matches avatar pattern).

- **Source:** Avatar modal in `page.tsx` lines 312-347
- **Pattern:** One `Dialog` component per profile image type:
  ```typescript
  const [isProblemStatementsModalOpen, setIsProblemStatementsModalOpen] = useState(false);
  const [isCapabilitiesModalOpen, setIsCapabilitiesModalOpen] = useState(false);
  const [isTryThesePromptsModalOpen, setIsTryThesePromptsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState<{ type: string | null }>({ type: null });
  
  // Each modal: DialogContent with sm:max-w-xl, preview at 384×384, loading overlay, Close + Generate/Regenerate buttons
  ```

### 7.9 Prompt Template Embedding

**Answer:** Embed as constants object in `ProfileImageGenerationService.ts`.

- **Pattern:**
  ```typescript
  // At top of ProfileImageGenerationService.ts
  const PROFILE_IMAGE_PROMPTS = {
    problem_statements: `I want to create 1 square format image (1:1 aspect ratio) for {{name}} showing them understanding and empathizing with user challenges.
    
    Identity Anchors:
    - Name: {{name}}
    - Role: {{role}}
    ...`, // Full prompt from AGENT_PROFILE_IMAGE_PROMPTS.md Prompt 0
    
    capabilities: `...`, // Prompt 1
    
    try_these_prompts: `...`, // Prompt 2
  } as const;
  ```

### 7.10 Placeholder Substitution

**Answer:** Simple string replacement function.

- **Pattern:**
  ```typescript
  private substitutePlaceholders(template: string, placeholders: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(placeholders)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }
    return result;
  }
  ```

### 7.11 Category → Background Color Mapping

**Answer:** Inline constant object in service.

- **Pattern:**
  ```typescript
  private readonly CATEGORY_COLORS: Record<string, string> = {
    automation: 'green',
    data: 'purple',
    communication: 'orange',
    coding: 'indigo',
    creative: 'pink',
    analysis: 'cyan',
    support: 'amber',
    utility: 'teal',
    general: 'gray',
  } as const;
  
  private getBackgroundColor(category?: string): string {
    return this.CATEGORY_COLORS[category || 'general'] || 'gray';
  }
  ```

### 7.12 Client Hook Pattern

**Answer:** Mirror `useGenerateAgentAvatar` exactly.

- **Source:** `useAgents.ts` lines 206-229
- **Pattern:**
  ```typescript
  export function useGenerateProfileImage() {
    const queryClient = useQueryClient();
    
    return useMutation({
      mutationFn: async (input: { 
        agentId: string; 
        type: 'problem_statements' | 'capabilities' | 'try_these_prompts' 
      }): Promise<AgentModel> => {
        const response: FetchResponse<ApiResponse<{ agent: AgentModel }>> = await api.post(
          `/api/v1/agents/${input.agentId}/profile-images/generate`,
          { type: input.type }
        );
        return response.data.data.agent;
      },
      onSuccess: (agent, variables) => {
        queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.detail(variables.agentId) });
        queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.byStarship(agent.starshipId) });
        queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.all });
        toast.success(`${variables.type.replace(/_/g, ' ')} image generated`);
      },
      onError: (error: any) => {
        const message = error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Failed to generate profile image';
        toast.error('Generation failed', { description: message });
      },
    });
  }
  ```

---

## 8. Final Implementation Readiness: ✅ READY

All gaps have been resolved by matching existing avatar patterns. The plan is **ready for implementation** with the following clarifications:

1. ✅ **Image size:** 512px (confirmed from AvatarGenerationService)
2. ✅ **Avatar prompt injection:** Exact format and location specified (matching avatar pattern)
3. ✅ **Type mapping:** Simple inline object (no separate function needed)
4. ✅ **Core capabilities:** Comma-separated, max 200 chars
5. ✅ **Domain context:** First sentence or 100 chars of description
6. ✅ **UpdateAgentRequest:** Fields work via Partial<>, but add explicit Zod validation
7. ✅ **Error handling:** Simple try/catch (no rollback, same as avatar)
8. ✅ **Modal pattern:** Separate modals per type (matches avatar)
9. ✅ **Prompt embedding:** Constants object in service file
10. ✅ **Placeholder substitution:** Simple string replacement function
11. ✅ **Category colors:** Inline constant object
12. ✅ **Client hook:** Mirror useGenerateAgentAvatar exactly

**No over-engineering needed** — all patterns match the existing avatar implementation.
