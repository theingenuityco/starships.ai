# Daedalus: Tool-first Protocol Fix Plan

Status: DRAFT

Objective

- Ensure Daedalus executes the full tool-creation flow (lint → create → verify → smoke-test) without stalling after tool_list.

Constraints

- Keep implementation lean (no extra bloat).
- Don't change data model or engine semantics; only tighten prompt/consistency.
- Seeds must continue to work when app starts (templates seeded and tools deployed for Daedalus automatically).

Current behavior (from logs)

- LLM exposes correct tool functions via function-calling (tool_create, tool_update, tool_get, tool_list, blueprint_lint, tool_test).
- Daedalus calls tool_list once, then returns a long planning monologue and stops; it does not call blueprint_lint/tool_create.
- secureEnv is present (tool_list succeeds). state.tools is correctly wired (LLM tool_calls emitted).

Root causes

- Prompt lacks a strict "act over explain" protocol, so the LLM narrates instead of continuing tool_calls.
- Misconceptions reinforced by prompt text (e.g., blueprint_lint signature confusion; “minimal create then patch”).
- Function name vs slug can remain ambiguous unless spelled out (snake_case function name vs kebab-case slug).

Changes to implement

1. System Prompt Patch (Tool-first
