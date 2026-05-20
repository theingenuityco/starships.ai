# Screenshots

The landing page references these files. Drop PNGs (1440×900 or similar 16:10) at these exact paths and they'll render automatically.

Use realistic data — real-looking agent names like *"Operations Analyst"*, real conversation text, real connector logos. Pick one theme (dark or light) and stick with it. Light files (~250-400 KB after compression) keep the page fast.

## Hero strip (4 shots, top of page)

- `01-room.png` — A room/conversation with a named agent mid-action. Tool call visible ("Calling LinkedIn.search_profiles…" or similar). Multiple messages, recent timestamps, sidebar visible.
- `02-agent-builder.png` — Agent builder view: name, role, system prompt with real text, model selector, tools list with several enabled, avatar slot.
- `03-connectors.png` — Connectors page listing 5-6 connected services (LinkedIn, Stripe, GitHub, Discord, Postgres, generic HTTP). Status badges visible.
- `04-approval.png` — Tool approval moment inline in a conversation. Action visible ("Send email to anna@example.com" or similar), Approve / Deny buttons.

## Capability sections (4 shots, deeper down)

- `05-workspace.png` — Wide view showing rooms list + a conversation. Multiple named agents visible. The "Slack-shaped surface" angle.
- `06-connectors-detail.png` — Detail view of a connector — OAuth flow, scopes, actions catalog. Or a second angle on the connectors page emphasizing the framework.
- `07-workflow.png` — DAG / workflow visualization. If no graph view exists, capture a conversation showing a multi-step agent execution (plan → tool call → result → next call → answer).
- `08-approval-detail.png` — Detail of the approval flow — per-tool, per-agent permissions UI. Or a fuller view of an approval being granted with the audit trail.

## Optional

- Drop additional shots into this folder and reference them in the landing components as you iterate.
