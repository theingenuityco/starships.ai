# starships.ai Monorepo

starships.ai is a Node.js + TypeScript monorepo that orchestrates multiple Discord bots powered by [Open WebUI](https://github.com/open-webui/open-webui) agents.

> **Phase 1** focuses purely on laying the technical foundation—no business logic yet.

## Packages

| Package | Description |
|---------|-------------|
| `@starships/bridge-core` | Core orchestration logic that syncs Discord bots with Open WebUI agents |
| `@starships/server` | Express.js server that receives Discord webhook events and dispatches them to agents |

## Tech Stack

- **Monorepo tooling:** [pnpm Workspaces](https://pnpm.io/workspaces) + [Turborepo](https://turbo.build/)
- **Language:** TypeScript (strict mode, project references)
- **Lint & Format:** ESLint + Prettier
- **Runtime libraries (to be used later):** Discord.js, Express, ioredis, axios, dotenv, etc.

## Getting Started

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Start development mode**

   ```bash
   pnpm dev
   ```

   Turborepo will run package-level `dev` tasks in parallel.

3. **Build all packages**

   ```bash
   pnpm build
   ```

4. **Lint the codebase**

   ```bash
   pnpm lint
   ```

> The project is in its infancy. Feel free to open issues or PRs to discuss improvements.
