# Stray Documentation Analysis (No Deletions Performed)

Date: 2026-01-02  
Repo root: `/workspace`

## Executive Summary

This repo contains **89 documentation-like files** (Markdown/MDX/README/TXT): `public-docs/` (45), `packages/**` (27), `docs/` (7), `github-runners/` (5), `.github/` (3), plus root `README.md` and `MIGRATION_SPEC.md`.

I flagged **9 candidate stray docs** across these categories:

- **HIGH confidence** (very likely safe to remove or archive): 5 files
- **MEDIUM confidence** (likely outdated / misleading, but might be intentionally retained): 2 files
- **LOW confidence** (orphaned but potentially still valuable operational docs): 2 files

Key themes:

- **Obsolete migration plan**: `MIGRATION_SPEC.md` is the **only remaining Neo4j reference** in the entire repo.
- **Docs that contradict current code**: at least two docs describe files/classes/features that **do not exist** or are **not used**.
- **Orphaned internal docs**: several `docs/` files have **no inbound links** from `README.md`, the docs site, `public-docs/`, or code/config.

## Exploration Process (Multi-pass)

### 1) Catalog all documentation

Counted doc-like files by top-level folder:

- `public-docs/`: **45**
- `packages/`: **27**
- `docs/`: **7**
- `github-runners/`: **5**
- `.github/ISSUE_TEMPLATE/`: **3**
- Root: `README.md`, `MIGRATION_SPEC.md`

### 2) Map code + doc references

Observed two “official” documentation systems that are **consumed by the product**:

- **Agent-consumable markdown index**: `@starships/server` indexes markdown by walking a docs directory (default `public-docs/`).
  - Evidence: `packages/server/src/routes/docs.ts` resolves and walks `public-docs/` (and also supports `packages/docs/.source` mounts).
- **Human docs site**: `@starships/docs` (Next.js + Fumadocs) renders MDX from `packages/docs/content/docs/**` with navigation driven by `meta.json`.
  - Evidence: `packages/docs/content/docs/meta.json` includes `"pages": ["getting-started", "core-concepts", "agents", "nodes"]` and each subfolder has its own `meta.json`.

For inbound reference detection, I used:

- **Exact-path scans** across code/config/docs (good for `docs/foo.md` style references).
- **Doc-to-doc reference graph** by scanning markdown text for `*.md` / `*.mdx` tokens and resolving relative paths (captures `./x.md`, `charts/foo.md`, backticks, etc.).

### 3) Analyze freshness

Collected per-file “last touched” commit info via `git log -n 1 -- <path>` for each flagged candidate (included below under each finding).

### 4) Check for duplicates

Looked for:

- Two files covering the same deployment plan with conflicting formatting/content
- Two doc systems covering the same topic (intentional vs redundant)

### 5) Assess relevance vs current implementation

Cross-checked claims against the codebase via targeted searches, e.g.:

- `neo4j` appears **only** in `MIGRATION_SPEC.md`
- `AutopilotStreamService`, `safeApplyPatch`, and `packages/client/src/lib/jsonPatch.ts` are **absent**, despite being referenced in a doc
- `processingStatus`, `importance`, `threadDepth` appear **only** in a UI README (not implemented)
- `createEntityWithAutoId` appears only in a test helper, not in actual repositories (architecture doc example is stale)

### 6) Identify orphans

“Orphan” here means: **not linked** from root `README.md`, other docs, docs site nav (`meta.json`), `public-docs` entrypoints, or code/config.

The main orphan cluster is `docs/` (excluding `docs/er-diagram.md`, which is referenced).

---

## Detailed Findings (Organized by Category)

### Category A — Obsolete docs about removed features (HIGH)

#### 1) `/workspace/MIGRATION_SPEC.md`

- **Reason for flagging**: **Outdated/obsolete** (migration plan for a DB that is already removed)
- **Evidence**
  - **Only remaining Neo4j reference** in the entire repo: searching for `neo4j` yields matches **only in this file**.
  - No inbound references from docs/code/config (not linked from `README.md`, docs site nav, or `public-docs`).
  - Content reads like a “progress tracker” and includes an internal “Last Updated” timestamp (`2025-09-30`) that no longer reflects the repo state.
- **Freshness**: last commit touching file: `2025-12-15` (`563cefe6` “fix: db-driven connectors (#480)”)
- **Confidence**: **HIGH**

---

### Category B — Duplicate/broken docs (HIGH)

#### 2) `/workspace/docs/todo-prod-deploy-plan.md`

- **Reason for flagging**: **Duplicate / malformed doc** (looks like accidentally double-fenced markdown, and not a “TODO plan” anymore)
- **Evidence**
  - File begins with ` ````markdown ` and an extra nested ```markdown fence, which breaks normal rendering and strongly suggests a pasted artifact.
  - Not referenced from `README.md`, docs site, `public-docs`, or code/config (no inbound references).
  - Overlaps heavily with other AWS/EKS deployment documentation in `docs/` (same topic area with conflicting structure).
- **Freshness**: last commit touching file: `2026-01-02` (`89a5a4c3` “chore: Docs workflow filename updates (#545)”)
- **Confidence**: **HIGH**

---

### Category C — Draft/WIP docs left behind (HIGH)

#### 3) `/workspace/docs/scratch/daedalus-fix-plan.md`

- **Reason for flagging**: **Draft/WIP** in a scratch folder; likely superseded by the formal docs site content
- **Evidence**
  - Explicitly labeled **“Status: DRAFT”**.
  - No inbound references from `README.md`, docs site nav, `public-docs`, or code/config.
  - There is an official Daedalus page in the docs site: `packages/docs/content/docs/agents/daedalus.mdx`, suggesting this “fix plan” is not user-facing documentation and may be leftover internal notes.
- **Freshness**: last commit touching file: `2025-11-23` (`2ee2f20d` “feat: connectors (#444)”)
- **Confidence**: **HIGH**

---

### Category D — Docs that contradict current implementation (HIGH)

#### 4) `/workspace/packages/client/src/components/conversation/README.md`

- **Reason for flagging**: **Misleading/outdated**; describes features not present in the codebase
- **Evidence**
  - The doc describes message fields and UI behavior like `processingStatus`, `importance`, `threadDepth`, “voice recording”, etc.
  - Searches for key terms show they exist **only in this README** and not in the actual client implementation:
    - `processingStatus`: only in this README
    - `importance`: only in this README
    - `threadDepth`: only in this README
  - No inbound references (not linked from other docs or root `README.md`).
- **Freshness**: last commit touching file: `2026-01-02` (`73325b0d` “chore: Documentation updates starships.ai (#518)”)
- **Confidence**: **HIGH**

#### 5) `/workspace/packages/server/src/utils/README-DELTA-ENCODER.md`

- **Reason for flagging**: **Outdated/incorrect**; references files/classes that do not exist and a streaming architecture not present
- **Evidence**
  - Mentions `AutopilotStreamService` and `packages/server/src/services/AutopilotStreamService.ts`, but there is **no such file** in the repo.
  - Mentions client-side JSON patch support at `packages/client/src/lib/jsonPatch.ts` and a `safeApplyPatch` helper, but neither exists.
  - `DeltaEncoder` itself exists (`packages/server/src/utils/DeltaEncoder.ts`), but appears **unused** outside this README (no code imports/usage found).
  - No inbound references from other docs or code/config.
- **Freshness**: last commit touching file: `2025-09-22` (`508557bf` “feat: daedalus runtime (#260)”)
- **Confidence**: **HIGH**

---

### Category E — Architecture docs likely stale (MEDIUM)

#### 6) `/workspace/docs/layered-architecture-patterns.md`

- **Reason for flagging**: **Potentially stale** and unlinked; examples don’t match current code patterns
- **Evidence**
  - Includes repository examples using `createEntityWithAutoId`, but this symbol appears only in a **test helper** (`packages/models/src/tests/database-mock-helper.ts`) and not in the production repositories, suggesting the doc drifted.
  - Not referenced from `README.md`, docs site nav, `public-docs`, or code/config.
  - Very large, prescriptive doc; if unmaintained, it can become a source of architectural misinformation.
- **Freshness**: last commit touching file: `2025-10-02` (`7c2493de` “feat: migrating db to postgres (#274)”)
- **Confidence**: **MEDIUM**

#### 7) `/workspace/docs/architecture/reverse-proxy.md`

- **Reason for flagging**: **Orphaned** internal architecture doc; could be valid but is “floating”
- **Evidence**
  - Not referenced from root `README.md` or other docs.
  - Describes the dev reverse-proxy flow and points to `packages/reverse-proxy/src/index.ts`, but without any inbound navigation it’s hard to discover/maintain.
- **Freshness**: last commit touching file: `2025-10-27` (`24853c57` “feat: more bugs fixes (#377)”)
- **Confidence**: **MEDIUM**

---

### Category F — Orphaned operational docs (LOW)

These are not “wrong” on their face, and some were updated very recently, but they are **not discoverable** (no inbound links). I’m flagging them as “stray-ish” only because your mission includes orphan detection and relevance review.

#### 8) `/workspace/docs/dev-aws-eks-fat-container-plan.md`

- **Reason for flagging**: Orphaned; deployment plan doc not linked from anywhere
- **Evidence**
  - No inbound references from root `README.md` or other docs.
  - Mentions legacy DigitalOcean migration context, which may or may not still be relevant to current deployment.
- **Freshness**: last commit touching file: `2026-01-02` (`89834fce` “chore: Postgres separate statefulset docs (#551)”)
- **Confidence**: **LOW**

#### 9) `/workspace/docs/disaster-recovery-guide.md`

- **Reason for flagging**: Orphaned; runbook is not linked from anywhere
- **Evidence**
  - No inbound references from root `README.md` or other docs.
  - Appears to be a serious operational runbook; likely should be linked from a “Deployment/Operations” section rather than removed.
- **Freshness**: last commit touching file: `2026-01-02` (`a4188304` “docs: fix disaster recovery guide accuracy (#554)”)
- **Confidence**: **LOW**

---

## Potential Duplicates / Overlaps (Not Immediate Removal Candidates)

These are not flagged for removal by default, but they are clear sources of redundancy:

- **Two parallel docs systems covering overlapping concepts**
  - `public-docs/` contains blueprint/node reference material for agent consumption.
  - `packages/docs/content/docs/**` contains human docs site material (also includes “nodes/reference” and “agents/daedalus”).
  - This duplication can be intentional (different audiences), but it increases maintenance cost and the risk of contradictions.

- **Multiple deployment/ops documents in `docs/`**
  - `docs/dev-aws-eks-fat-container-plan.md`, `docs/disaster-recovery-guide.md`, and `docs/todo-prod-deploy-plan.md` cluster around AWS/EKS ops.
  - Consider consolidating into a single “Deployment/Operations” section and deleting broken/duplicate remnants.

---

## Complete File Paths List (Flagged Candidates)

Use this list as the input set for a cleanup agent (no changes made yet):

1. `/workspace/MIGRATION_SPEC.md`
2. `/workspace/docs/todo-prod-deploy-plan.md`
3. `/workspace/docs/scratch/daedalus-fix-plan.md`
4. `/workspace/packages/client/src/components/conversation/README.md`
5. `/workspace/packages/server/src/utils/README-DELTA-ENCODER.md`
6. `/workspace/docs/layered-architecture-patterns.md`
7. `/workspace/docs/architecture/reverse-proxy.md`
8. `/workspace/docs/dev-aws-eks-fat-container-plan.md`
9. `/workspace/docs/disaster-recovery-guide.md`

