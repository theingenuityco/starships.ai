🚀 PROMPT FOR CURSOR (v2 – ambiguities resolved)

You are refactoring an existing monorepo called "starships.ai".

---
### Current state
- `packages/server` → a traditional REST API (keep it as-is; admin or future routes can live here).
- `packages/bridge-core` → mainly Discord-specific helpers, some shared types.
- LLM interaction goes through **Open WebUI** (must be removed).

---
### New goal
Build a **Multi-Channel-Persona (MCP) Server** in a brand-new workspace package `packages/mcp-server` that owns all agent logic and exposes an HTTP/SSE API.  No Discord, no Open WebUI.  All chat platforms will use adapters later (not in this scope).

All ambiguity from the previous spec has been resolved below.

---
## 1. HIGH-LEVEL OBJECTIVES
1. **Create fresh package** `packages/mcp-server`; do **NOT** delete or rename `packages/server`.
2. Remove Discord & Open WebUI dependencies from the new flow.
3. **Add package** `packages/agent-engine` that contains:
   - LLM provider abstraction
   - `MemoryStore` & `PersonaRegistry` (moved here)
   - Prompt builder & chat facade
4. **Add package** `packages/protocol` with shared TS interfaces so future adapters compile cleanly.
5. MCP Server must expose a **v1 HTTP API** with **Server-Sent Events (SSE)** for streaming.  WebSockets are out of scope for now.
6. **Usage accounting**:
   - Capture and return `usage` **ONLY** if the selected provider supplies it (OpenAI does, many others don't).
   - Provider interface therefore returns `{ reply: string; usage?: UsageStats }` where `usage` is optional.
7. Skip all adapter-auth design; adapters are out of scope for this sprint.

---
## 2. FINAL PACKAGE LAYOUT
```
root/
  packages/
    agent-engine/
      src/
        index.ts           # chat facade
        memoryStore.ts     # moved from bridge-core
        registry.ts        # moved & renamed from bridge-core
        llm/
          provider.ts      # interface
          openai.ts        # provider impl
          mock.ts          # tests
        prompt/builder.ts
        __tests__/
    mcp-server/
      src/
        index.ts           # Express bootstrap
        api/
          chat.ts          # POST /v1/chat + SSE
          agents.ts        # GET /v1/agents
          memory.ts        # POST /v1/memory/reset
        util/
        middlewares/
      Dockerfile
    protocol/
      src/index.ts         # ChatRequest, ChatResponse, UsageStats
    server/                # unchanged – may host future admin APIs
    bridge-core/           # Discord helpers will be trimmed later
  …
```

---
## 3. PUBLIC HTTP API SPEC (v1)
```
GET  /v1/agents
  → 200 Array<AgentConfig>

POST /v1/chat
  Body <ChatRequest>:
  {
    agent_id:   string,
    user_id:    string,        // opaque per-client id
    channel_id?:string,
    message:    string,
    stream?:    boolean        // if true, upgrade to SSE
  }

  Non-stream: → 200 <ChatResponse>
    {
      reply:  string,
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

  Stream (Content-Type: text/event-stream):
    data: {"delta":"Hel"}\n
    data: {"delta":"lo!"}\n
    data: [DONE]\n

POST /v1/memory/reset
  Body: { agent_id, user_id, channel_id? }
  → 204

Health: GET / returns "mcp-server running".  CORS enabled.
```

---
## 4. STEP-BY-STEP IMPLEMENTATION PLAN
### PHASE 0 — Workspace Prep
1. `git checkout -b feat/mcp-server`
2. Add **agent-engine**, **mcp-server**, **protocol** to `pnpm-workspace.yaml` and TS path aliases.

### PHASE 1 — protocol pkg
1. `packages/protocol/src/index.ts`
   - export interfaces: `ChatRequest`, `ChatResponse`, `UsageStats`, `AgentConfig`.

### PHASE 2 — agent-engine pkg
1. Move existing `MemoryStore` and `PersonaRegistry` code here; refactor imports.
2. `llm/provider.ts`
   ```ts
   export interface LLMProvider {
     complete(prompt: LLMChatPrompt, opts: { stream?: boolean }): Promise<LLMResult>;
   }
   ```
3. `llm/openai.ts` implements it, mapping OpenAI response → `{ reply, usage? }`.
4. `prompt/builder.ts` concatenates `systemPrompt` + `memory` + `user`.
5. `index.ts` exposes `chat({ agent, userMessage, memory, stream })`.
6. Jest tests use `llm/mock.ts` that returns canned replies.

### PHASE 3 — mcp-server pkg
1. `src/index.ts`
   - load dotenv
   - create Express app, JSON & CORS middleware
   - mount `/v1` router
   - start on `PORT` (default 4000)
2. `/api/chat.ts`
   - validate body using zod or manual checks
   - fetch agent via `PersonaRegistry`
   - build `sessionKey = MemoryStore.makeKey(user_id, agent_id, channel_id)`
   - get memory, call `AgentEngine.chat`
   - persist memory
   - send JSON or SSE depending on `stream`
   - include `usage` only if defined
3. `/api/agents.ts` returns cached list.
4. `/api/memory.ts` deletes memory session and returns 204.

### PHASE 4 — Docker & Env
1. `.env.example`
   ```env
   OPENAI_API_KEY=
   PROVIDER=openai
   ```
2. `packages/mcp-server/Dockerfile`
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY . .
   RUN pnpm install --frozen-lockfile && pnpm run --filter mcp-server build
   CMD ["node","mcp-server/dist/index.js"]
   ```

### PHASE 5 — Docs & CI
1. Update root `README.md` with new architecture diagram (see Section 6).
2. Add `docs/ARCHITECTURE.md` describing provider plug-in design.
3. Add GitHub Action: lint + test + build.

---
## 5. ENVIRONMENT VARIABLES
Required
- `OPENAI_API_KEY` – used when `PROVIDER=openai`
Optional
- `PROVIDER=openai|mock` – defaults to `openai`
- `PERSONA_REGISTRY_URL` or `AGENTS_JSON`
- `MEMORY_TTL_MINUTES=60`
- `PORT=4000`
- `LOG_LEVEL=info|debug`

---
## 6. REFERENCE DIAGRAM
```
Persona Registry ─┐
                  ▼
            ┌───────────────┐
            │  mcp-server   │  (Express)
            │───────────────│
            │ AgentEngine   │
            │ MemoryStore   │
            └───────────────┘
                  │
                  ▼
           LLM Provider(s)
```
_Adapters (Discord-adapter, Slack-adapter, Web client) will POST `/v1/chat` or use SSE for streaming._

---
## 7. OUT-OF-SCOPE (DO NOT IMPLEMENT NOW)
- Discord adapter
- WebSocket support
- Adapter authentication / API keys
- Token usage persistence beyond response payload

---
*End of spec* 