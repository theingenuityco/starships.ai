# Legacy connector bundles (parked)

These are the declarative connector templates from before the migration to code-driven
connectors. They are **parked for reference only** — they are no longer loaded, registered,
or executable.

## Why they're here

Connectors are now code: each is a `ConnectorDefinition` in `@starships/connectors` that
registers via `registerCode()` and owns its actions as plain TypeScript functions executed
server-side by `ConnectorActionExecutor`. The `{{ }}` template DSL interpreter (and the
`new Function` evaluator that powered it) has been removed, so these JSON templates can no
longer run.

The live connectors are `github`, `starships`, and `system` (see
`packages/connectors/src/connectors/`).

## If you want to bring one back

Port it to a code connector: create `packages/connectors/src/connectors/<provider>/` with an
`index.ts` (auth strategy + `actions`) and one `defineAction` per action, then register it in
`ConnectorRegistryClient.registerCodeConnectors()`. Use these templates as the spec for paths,
params, and request shaping.
