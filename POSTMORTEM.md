# starships.ai — Postmortem

> This is the honest account of what we built, what we tried, what broke, and why we shut down. Written May 2026.

---

## What it was

starships.ai was an AI agent automation platform. The core idea: give teams a workspace where they could deploy agents, wire them to real tools and third-party services via connectors, and run work through conversations or scheduled jobs — without writing infrastructure code.

The execution engine (Autopilot) was a JSON-defined DAG runner with parallel execution, event-driven resumption (agents could pause and wait for a webhook), streaming SSE output, and an optional remote gRPC runner. Agents could call tools, trigger connector actions, and the platform handled auth injection so blueprints never touched raw secrets.

It was a full-stack production SaaS: multi-tenant, Stripe billing, usage ledger, OAuth, Kubernetes-deployed, the works.

---

## Timeline

<!-- Fill in approximate dates and milestones: -->
<!-- - [Month Year]: Project started, initial team -->
<!-- - [Month Year]: First working Autopilot engine -->
<!-- - [Month Year]: Collaborators departed, became solo -->
<!-- - [Month Year]: First paying customer / beta users -->
<!-- - [Month Year]: Pivot attempts -->
<!-- - [Month Year]: Decision to wind down -->

---

## What we tried

<!-- Describe the positioning pivots: what audiences were targeted, what messaging was tested, what go-to-market approaches were taken. Be honest about what didn't land and why. -->

---

## What worked

<!-- Things that worked technically, things that customers responded to, things you're proud of -->

---

## What didn't work

### Positioning never crystallized

The most consistent feedback was "people get confused what to do with this." The product had genuine capability but no clear job-to-be-done that cut through cleanly. We tried multiple framings — none landed fast enough.

### The market moved under us

When we started, the tooling landscape for AI agents was thin. By the time we were shipping features, MCP (Model Context Protocol), the Claude Agent SDK, Mastra, and n8n had absorbed large portions of the value proposition we were building toward. The window for a proprietary orchestration platform narrowed significantly.

### Solo execution against a large codebase

After collaborators departed, the surface area of the codebase — a full monorepo with a custom DAG engine, multi-tenant backend, and production SaaS UI — became difficult to iterate on fast enough to find product-market fit before runway ran out.

### Lead-gen pivot was too slow

A late pivot toward using the platform as a lead-gen tool was identified as a direction, but executing it against the size of the existing codebase was too slow relative to the remaining runway.

---

## Why we shut down

3 months of runway remaining, no organic traction, market had moved. The honest calculus: continuing to iterate had a low expected value compared to stopping cleanly, open-sourcing the work, and moving on.

---

## What we'd do differently

<!-- Honest reflection: earlier bets, different scope, different market timing, different go-to-market, etc. -->

---

## The codebase as a reference

Even though the product didn't find its market, the technical work is solid. If you're building:

- A **multi-agent orchestration system** — the Autopilot engine (`packages/autopilot/`) has a working DAG runner with event-driven resumption, parallel branches, and streaming
- A **connector/tool framework** — the auth-injection model (HostRuntime) keeps blueprints clean of credentials
- A **multi-tenant SaaS backend** — workspace isolation, JWT, Stripe billing, usage ledger patterns are all here
- A **production Next.js + Express monorepo** — the Turbo setup, shared types, and build pipeline are a reasonable starting point

Fork it, learn from it, steal what's useful.

---

## Contact

Built by Rudraprasad Das. Find me on GitHub: [@brayn003](https://github.com/brayn003)
