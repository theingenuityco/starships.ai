# Current zip bundle formats (starships.ai)

This document captures the **exact zip bundle shapes and hashing semantics** currently implemented by the main API, so the Bundle Registry can store and serve artifacts without diverging from import/analyze/apply behavior.

## 1) Agent + tool bundle (\"agent bundle\")

### Zip layout

- `manifest.json`
- `agents/<name>.json` (0..N)
- `tools/<name>.json` (0..N)

Where:
- Each `agents/*.json` and `tools/*.json` file is a JSON **Import/Export container** (`schemaVersion: \"1\"`) matching the `ImportExportContainerV1` shape.
- File names are derived from `container.metadata.fromSlug` with safe sanitization and collision suffixes (`-2`, `-3`, ...).

### Manifest shape

`manifest.json` includes:
- `schemaVersion: \"1\"`
- `kind: \"bundle\"`
- `exportedAt: <iso string>`
- `entities.tools[]` and `entities.agents[]`, each entry containing:
  - `kind`: `\"tool\"` or `\"agent\"`
  - `file`: a relative path like `tools/foo.json` or `agents/bar.json`
  - `fromSlug` / `fromStarshipSlug` (optional, informational)

### Import allowlist

Import rejects manifest entries whose `file` does not match:
- `^(agents|tools)\\/[\\w.-]+\\.json$`

### Conflict analysis hashing

During `import-bundle/analyze` and `import-bundle/apply`, each entity is compared against destination starship entities using:

- **Tools**: `computeToolContentHash({ name, description, parameters, blueprint, transforms, mutations, condition, isEnabled, status })`
- **Agents**: `computeAgentContentHash({ name, role, description, model, temperature, maxTokens, timeout, reasoning, systemPrompt, state, blueprint, category, previewPrompts, assignedToolSlugs })`

The resulting hex digest is surfaced to the client as `bundleHash` per entity.

## 2) Room bundle (\"room + resources bundle\")

### Zip layout

- `manifest.json`
- `rooms/<name>.json` (1..N)
- `views/<name>.json` (0..N)
- `datasets/<name>.json` (0..N)
- `task-boards/<name>.json` (0..N)
- `agents/<name>.json` (0..N)
- `tools/<name>.json` (0..N)

All `*/<name>.json` entries are `ImportExportContainerV1` containers (same schemaVersion), but for kinds:
`agent`, `tool`, `room`, `view`, `dataset`, `task_board`.

### Manifest shape

Like agent bundles, but `entities` includes:
- `rooms`, `views`, `datasets`, `taskBoards`, `agents`, `tools`

### Import allowlist

Import rejects manifest entries whose `file` does not match:
- `^(agents|tools|rooms|views|datasets|task-boards)\\/[\\w.-]+\\.json$`

### Conflict analysis hashing

Room bundles use the same tool/agent hashing as agent bundles, and use the following **bundle hash** for the other kinds:

- **View**: `sha256(stableStringify({ name, description, root, runtimeConfig }))`
- **Dataset**: `sha256(stableStringify({ name, description, columns, primaryKey }))` (with `primaryKey` normalized to `null` when absent)
- **Task board**: `sha256(stableStringify({ name, description }))`
- **Room**: `sha256(stableStringify({ name, isPrivate, topic }))` (with `topic` normalized to `null` when absent)

`stableStringify` is a deterministic JSON stringification that:
- sorts object keys recursively
- preserves array order
- replaces circular references with the string `\"[Circular]\"` (defensive; should not occur in these payloads)

## 3) Registry artifact hashing recommendation

Zip bytes are not guaranteed to be stable across rebuilds (metadata / ordering can vary), so the registry should compute both:

- **`artifact_sha256`**: SHA-256 of the raw zip bytes (integrity check)
- **`bundle_hash`** (dedupe key): SHA-256 over the **normalized content**:
  - iterate zip entries by `entryName` sorted ascending
  - for each file entry, hash `entryName + \"\\n\" + <file bytes>`
  - exclude directory entries

This keeps dedupe stable even if zip metadata changes.

