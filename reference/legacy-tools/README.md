# Legacy tool definitions (archived for reference)

This folder preserves the old **"tools" abstraction** content after it was removed
from the live product. Agents now act through **connector actions**
(`search_actions` / `run_action`) driven by the code-native CLI loop, and the
tools data model (`tools`, `agent_tools`, `starship_tools`, `room_tools`),
repositories, routes, and UI were deleted.

Nothing here is built, served, or imported by any package. It is kept only so the
original tool blueprints can be consulted later (e.g. when re-implementing an
equivalent capability as a connector action).

## Contents

- `bundles/` — the former `packages/bundle-service/bundles/tools/` default tool
  bundle: `manifest.json`, `bundle.meta.json`, and `tools/*.json` (one JSON
  blueprint per tool). These used to be deployed into the `tools` table on
  starship creation.
- `generate-bundles-from-templates.mjs` — the former bundle-service script that
  generated these bundles from the `tool_templates` / `agent_template_tool_templates`
  tables (both already dropped by migration 183). Non-functional; reference only.

## Why kept, not deleted

The blueprints encode useful intent (parameters, descriptions, transforms) for
capabilities like `read-url`, `read-older-messages`, doc/file/task operations,
etc. Keeping them avoids re-deriving that intent from scratch if any are ported
to the connector-action model.
