# Documentation Audit Report (Outdated / Stray Docs)

Date: 2026-01-02  
Scope: tracked repository files matching `*.md`, `*.mdx`, `*.txt`, and README-like names

## Executive summary

This repository has **89** tracked “documentation-like” files (markdown/MDX/text/READMEs). The docs fall into a few clearly distinct systems:

- **Product docs site**: `packages/docs/` (MDX under `packages/docs/content/docs/`) — file-system routed and expected to be “unlinked” in-repo.
- **Agent-consumable public docs**: `public-docs/` — indexed by the server via `GET /api/v1/docs`, so files are also expected to be “unlinked” in-repo.
- **Ops / infra docs**: `docs/`, `github-runners/`, and package READMEs — used by developers/operators.
- **Workflow/admin docs**: `.github/ISSUE_TEMPLATE/`.

Note: the inventory includes `.txt` files by request; a few of these (e.g. `github-runners/lambda/requirements.txt`) are **configuration**, not prose documentation.

### Headline findings

- **Clear removal candidates**: **3 files** appear to be *stray, outdated, or draft-only*, and are not referenced anywhere else in the repo.
- **Most “orphans” are legitimate**: Many docs are intentionally not cross-linked because they are discovered by tooling (Fumadocs filesystem routing and server-side indexing of `public-docs/`).

## Inventory (repository-wide doc map)

Total doc-like files: **89**

Top-level breakdown:

- **`public-docs/`**: 45
- **`packages/`**: 27
- **`docs/`**: 7
- **`github-runners/`**: 5
- **`.github/`**: 3
- **root**: `README.md` (1), `MIGRATION_SPEC.md` (1)

### Full file list (grouped)

## .github (3)
- .github/ISSUE_TEMPLATE/bug_report.md
- .github/ISSUE_TEMPLATE/custom.md
- .github/ISSUE_TEMPLATE/feature_request.md

## docs (7)
- docs/architecture/reverse-proxy.md
- docs/dev-aws-eks-fat-container-plan.md
- docs/disaster-recovery-guide.md
- docs/er-diagram.md
- docs/layered-architecture-patterns.md
- docs/scratch/daedalus-fix-plan.md
- docs/todo-prod-deploy-plan.md

## github-runners (5)
- github-runners/DEPLOYMENT.md
- github-runners/README.md
- github-runners/USAGE.md
- github-runners/lambda/requirements.txt
- github-runners/setup-github-app.md

## MIGRATION_SPEC.md (1)
- MIGRATION_SPEC.md

## packages (27)
- packages/autopilot-runner/README.md
- packages/autopilot/README-EVAL.md
- packages/autopilot/README-TOOLS.md
- packages/autopilot/README.md
- packages/client/README.md
- packages/client/src/components/conversation/README.md
- packages/docs/README.md
- packages/docs/content/docs/agents/daedalus.mdx
- packages/docs/content/docs/agents/gaia.mdx
- packages/docs/content/docs/core-concepts/agents.mdx
- packages/docs/content/docs/core-concepts/blueprints.mdx
- packages/docs/content/docs/core-concepts/marketplace.mdx
- packages/docs/content/docs/core-concepts/tools.mdx
- packages/docs/content/docs/getting-started/index.mdx
- packages/docs/content/docs/getting-started/quickstart.mdx
- packages/docs/content/docs/index.mdx
- packages/docs/content/docs/nodes/code.mdx
- packages/docs/content/docs/nodes/reference.mdx
- packages/env/README.md
- packages/errors/README.md
- packages/models/README.md
- packages/models/src/seeders/tools/__tests__/README.md
- packages/protocol/README.md
- packages/reverse-proxy/README.md
- packages/server/README.md
- packages/server/src/utils/README-DELTA-ENCODER.md
- packages/server/src/utils/validation.md

## public-docs (45)
- public-docs/README.md
- public-docs/blueprints/README.md
- public-docs/blueprints/engine.md
- public-docs/blueprints/eval.md
- public-docs/blueprints/example-01-minimal-start-llm-end.md
- public-docs/blueprints/example-02-llm-with-upstream-input.md
- public-docs/blueprints/example-03-function-calling-basic-tool.md
- public-docs/blueprints/example-04-http-request-transform.md
- public-docs/blueprints/example-05-conditional-routing.md
- public-docs/blueprints/example-06-inline-operations.md
- public-docs/blueprints/example-07-agent-default-blueprint.md
- public-docs/blueprints/example-08-error-handling-modes.md
- public-docs/blueprints/example-09-events-and-streaming.md
- public-docs/blueprints/example-10-kitchen-sink.md
- public-docs/blueprints/example-11-quirks-and-gotchas.md
- public-docs/blueprints/example-12-resume-and-visit-limits.md
- public-docs/blueprints/node-agent.md
- public-docs/blueprints/node-code.md
- public-docs/blueprints/node-conditional.md
- public-docs/blueprints/node-connector-action.md
- public-docs/blueprints/node-end.md
- public-docs/blueprints/node-http-request.md
- public-docs/blueprints/node-llm.md
- public-docs/blueprints/node-mutate.md
- public-docs/blueprints/node-start.md
- public-docs/blueprints/node-tool.md
- public-docs/blueprints/node-transform.md
- public-docs/blueprints/node-user-prompt.md
- public-docs/blueprints/node-workflow.md
- public-docs/connectors/README.md
- public-docs/connectors/connector_templates.md
- public-docs/connectors/example-api-key.md
- public-docs/connectors/example-basic.md
- public-docs/connectors/example-oauth2.md
- public-docs/widgets/README.md
- public-docs/widgets/charts/area-chart.md
- public-docs/widgets/charts/bar-chart.md
- public-docs/widgets/charts/donut-chart.md
- public-docs/widgets/charts/line-chart.md
- public-docs/widgets/charts/pie-chart.md
- public-docs/widgets/charts/radar-chart.md
- public-docs/widgets/charts/radial-chart.md
- public-docs/widgets/data-table.md
- public-docs/widgets/metric-grid.md
- public-docs/widgets/stat-card.md

## README.md (1)
- README.md

## Removal candidates (recommended)

Total files recommended for removal: **3**

### 1) Stray / malformed planning doc (likely accidental)

- **path**: `docs/todo-prod-deploy-plan.md`
- **size**: 10,750 bytes
- **last modified (git)**: 2026-01-02 (`89a5a4c3396c31685a6f6b2c90d9f69852166caa`)
- **why remove**:
  - Appears to be a pasted “ideal architecture” write-up with **broken markdown fencing** (nested ``` blocks / leading ````markdown) and emoji-heavy formatting inconsistent with the rest of `docs/`.
  - Reads like an **unmaintained TODO/draft** rather than a stable runbook or reference.
  - Not linked from root `README.md`, `packages/docs/`, or `public-docs/`.
- **references to it (repo search)**: none found
- **risk**: **LOW** (safe to delete; no inbound references detected)

### 2) Abandoned draft in scratch area

- **path**: `docs/scratch/daedalus-fix-plan.md`
- **size**: 1,286 bytes
- **last modified (git)**: 2025-11-23 (`2ee2f20df594e08ac7b82a7715d014ec649dc247`)
- **why remove**:
  - Explicitly marked **“Status: DRAFT”** and stored under `docs/scratch/`, which strongly signals a temporary working note.
  - Not referenced by the docs site content (`packages/docs/...`) or anywhere else in the repo.
- **references to it (repo search)**: none found
- **risk**: **MEDIUM** (could be useful historical debugging context for “Daedalus”; consider archiving to an internal knowledge base before deletion)

### 3) Outdated migration tracker/spec that no longer matches the codebase

- **path**: `MIGRATION_SPEC.md`
- **size**: 22,786 bytes
- **last modified (git)**: 2025-12-15 (`563cefe60b2fb6554d7cb600c32a2a32fbb65f3c`)
- **why remove**:
  - It documents a **Neo4j → PostgreSQL migration**, but (based on repository-wide search) it is now effectively the **only remaining place that mentions `neo4j`/`NEO4J_*`**.
  - Contains a “live progress tracker” and session notes; the file reads like a working log rather than evergreen documentation.
  - Not linked from the root `README.md` or any docs entrypoint.
- **references to it (repo search)**: none found
- **risk**: **MEDIUM** (it may be valuable as project history; if you prefer not to delete, move it to an `docs/archive/` or `docs/history/` folder and add a short note that it’s historical)

## “Verify first” docs (not recommended for removal in this audit)

These files look like planning/internal docs or long-form design notes, but I did not find strong evidence that they’re incorrect or abandoned. They are also plausible references for operators/maintainers.

- **`docs/dev-aws-eks-fat-container-plan.md`**
  - Recently updated and broadly consistent with the current repo layout (`k8s/`, `infra/`), so I’m treating it as **active** even though it’s not linked from the root README.
- **`docs/layered-architecture-patterns.md`**
  - Very long and reads partially like a migration narrative; consider a light verification pass to ensure the referenced file paths still exist and the “migration complete” claims are still accurate.
- **`packages/server/src/utils/validation.md`** and **`packages/server/src/utils/README-DELTA-ENCODER.md`**
  - Legitimate “docs near code” for maintainers; not inherently stale, but if you want docs centralized you could move/summarize them into `packages/server/README.md` later.

## Docs to preserve (high confidence)

### Primary entrypoints / active systems

- **Root overview**: `README.md`
  - Current and acts as a navigation hub to key package READMEs and active docs (e.g., `docs/er-diagram.md`).
- **Docs site**: `packages/docs/README.md` + `packages/docs/content/docs/**/*.mdx`
  - Active Next.js/Fumadocs documentation served at `/docs` (filesystem routed).
- **Agent-consumable docs**: `public-docs/README.md` + `public-docs/**`
  - Actively indexed/served by the API (`GET /api/v1/docs`), so these should not be treated as “orphans.”

### Ops / architecture references

- **DB model**: `docs/er-diagram.md` (explicitly linked from root `README.md`)
- **Disaster recovery runbook**: `docs/disaster-recovery-guide.md`
  - Includes version history and concrete, production-focused procedures.
- **Dev routing architecture**: `docs/architecture/reverse-proxy.md`
  - References the current implementation in `packages/reverse-proxy/src/index.ts`.
- **Infra automation**: `github-runners/README.md`, `github-runners/DEPLOYMENT.md`, `github-runners/USAGE.md`, `github-runners/setup-github-app.md`
  - Supports CI/CD operations; should be retained.

### Package-level READMEs

Keep the package READMEs under `packages/**` (e.g., `packages/server/README.md`, `packages/autopilot/README.md`, etc.) as they serve as localized onboarding and usage docs for each component.

## Recommended action plan

1. **Remove the LOW-risk stray doc**:
   - Delete `docs/todo-prod-deploy-plan.md`.
2. **Archive or delete MEDIUM-risk drafts/history**:
   - Decide whether to *delete* vs *archive*:
     - `docs/scratch/daedalus-fix-plan.md`
     - `MIGRATION_SPEC.md`
3. **After deletions**:
   - Run a quick repo-wide search for each removed filename to confirm no inbound references remain.
   - If you maintain external docs/wiki, add redirects or short “moved/removed” notes there if needed.

## Risks / concerns

- **Historical loss**: Removing `MIGRATION_SPEC.md` and `docs/scratch/daedalus-fix-plan.md` may discard useful institutional memory. If that history matters, prefer an archive folder (or external wiki) over deletion.
- **Non-link-based discovery**: Some docs are not linked because discovery is done via filesystem routing or server indexing; don’t treat “no inbound links” as proof a doc is unused.

## Notes / gaps

- No `LICENSE*`, `CODE_OF_CONDUCT*`, `CONTRIBUTING*`, or `CHANGELOG*` files were found at the repository root (based on filename search). If those are expected for this project, consider adding them separately (not part of the “remove outdated docs” scope).

