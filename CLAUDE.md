# Claude Code Configuration

## Architecture Guidelines

**CRITICAL**: All code changes must follow the 6-layer architecture pattern documented in `docs/layered-architecture-patterns.md`.

### Layer Structure (ALWAYS FOLLOW):
1. **Domain Layer** (Protocol): Pure interfaces in `packages/protocol/src/domains/`
2. **Entity Layer** (Models): Validation/transformation in `packages/models/src/entities/`
3. **Repository Layer** (Models): Data access in `packages/models/src/repositories/`
4. **Service Layer** (Server): Business logic in `packages/server/src/services/`
5. **API Routes Layer** (Server): REST endpoints in `packages/server/src/routes/`
6. **Client Layer**: React hooks in `packages/client/src/hooks/`

### Key Requirements:
- NO layer jumping (routes must use services, not repositories directly)
- Use Entity classes for all data transformation
- Services handle ALL business logic
- Repositories handle ONLY simple CRUD operations
- Use Zod validation in API routes
- Use TanStack Query with hierarchical cache keys in client hooks

### Commands:
- **Lint**: `pnpm lint`
- **Type Check**: `pnpm type-check`
- **Test**: `pnpm test`
- **Build**: `pnpm build`

Always run lint and type-check after making changes.

## Local Development Reverse Proxy

### Package: `@starships/reverse-proxy`
- **Purpose**: Single entry point for local development (eliminates URL juggling)
- **Technology**: Express.js + `http-proxy-middleware` v3.0.5
- **Integration**: Uses `@starships/env` for centralized configuration

### Default Configuration:
- **Proxy Port**: `8080` (`PROXY_PORT`)
- **Frontend**: `3000` (`CLIENT_PORT`) - Next.js client
- **Backend**: `4000` (`SERVER_PORT`) - Express server
- **Entry Point**: `http://localhost:8080` (developers use this single URL)

### Routing Logic:
```
/api/*           → Backend (SERVER_URL)
/* (everything)  → Frontend (CLIENT_URL)
/_proxy/health   → Proxy health check endpoint
```

### Key Features:
- **WebSocket Support**: Enabled for both API and frontend (Next.js HMR)
- **Origin Handling**: `changeOrigin: true` for proper header forwarding
- **Path Filtering**: Uses `pathFilter` functions for precise routing
- **Health Monitoring**: Custom health endpoint with uptime and config info
- **Graceful Shutdown**: Handles SIGTERM/SIGINT signals

### Development Workflow:
- **Start Command**: `pnpm dev` (includes proxy via Turbo)
- **Hot Reload**: Uses `tsx watch` for proxy server live reload
- **Build Dependencies**: Depends on `@starships/env#build`
- **Turbo Task**: `@starships/reverse-proxy#dev` (persistent task)

### Benefits:
- **No CORS Issues**: All requests appear from same origin
- **Single URL**: Developers use `localhost:8080` instead of multiple URLs
- **Transparent WebSockets**: Next.js HMR works seamlessly through proxy

## Environment Variables

### CRITICAL: No Fallback Values
- **NEVER use fallbacks**: `process.env.VAR || 'fallback'` is forbidden
- **Fail fast approach**: Code should crash if required env vars are missing
- **Use centralized validation**: All env vars validated in `@starships/env` package

### Pattern to Follow:
```typescript
// ✅ CORRECT - Use @starships/env
import { getEnvConfig } from '@starships/env';
const config = getEnvConfig(); // Throws if missing required vars
const publicUrl = config.PUBLIC_URL;

// ❌ WRONG - Never use fallbacks
const publicUrl = process.env.PUBLIC_URL || 'http://localhost:8080';
```

### Why This Matters:
- Prevents silent failures in production
- Makes missing dependencies explicit
- Avoids security risks from dev values in production
- Better debugging and error messages