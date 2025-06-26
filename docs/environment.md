# Environment Variables

This document describes the centralized environment variable management system for the starships.ai application.

## Overview

Environment variables are now centrally managed using the `@starships/env-config` package and loaded from the root `.env` file. This provides:

- **Single source of truth**: All variables defined in root `.env`
- **Type safety**: TypeScript interfaces for all environment variables
- **Validation**: Runtime validation of required variables
- **Cross-package consistency**: Shared configuration across server and client

## Architecture

```
Root .env file
    ↓
@starships/env-config package
    ↓
├── Server packages (direct import)
└── Client package (via next.config.js + lib/env.ts)
```

## Environment Variables

### Server Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | Port number for the HTTP server |
| `NODE_ENV` | No | `development` | Application environment (development, production, test) |
| `LOG_LEVEL` | No | `info` | Logging level |

### Deployment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDEPLOY_SECRET` | No | `changeme` | Bearer token for GitHub Actions webhook |

### Neo4j Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEO4J_URI` | No | `bolt://localhost:7687` | Neo4j database URI |
| `NEO4J_USERNAME` | No | `neo4j` | Neo4j database username |
| `NEO4J_PASSWORD` | No | `password` | Neo4j database password |
| `NEO4J_DATABASE` | No | `neo4j` | Neo4j database name |

### LLM Provider Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Conditional | - | OpenAI API key (required if using OpenAI models) |
| `ANTHROPIC_API_KEY` | Conditional | - | Anthropic API key (required if using Anthropic models) |

### Default Model Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEFAULT_LLM_PROVIDER` | No | `openai` | Default LLM provider (`openai` or `anthropic`) |
| `DEFAULT_CHAT_MODEL` | No | `gpt-4` | Default chat model name |
| `DEFAULT_EMBEDDING_MODEL` | No | `text-embedding-3-small` | Default embedding model for vector search |
| `DEFAULT_MODEL_ID` | No | `default-openai-gpt4` | Default model identifier |
| `DEFAULT_TEMPERATURE` | No | `0.7` | Default temperature for LLM responses (0.0-1.0) |
| `DEFAULT_MAX_TOKENS` | No | `4096` | Default maximum tokens for LLM responses |

### Vector Store Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FAISS_INDEX_PATH` | No | `./data/faiss_index` | Path to store FAISS vector index files |

### Kinde Authentication Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KINDE_CLIENT_ID` | Production | - | Kinde client ID |
| `KINDE_CLIENT_SECRET` | Production | - | Kinde client secret |
| `KINDE_ISSUER_URL` | Production | - | Kinde domain (e.g., https://your-subdomain.kinde.com) |
| `KINDE_SITE_URL` | No | `http://localhost:3000` | Your application URL |
| `KINDE_POST_LOGIN_REDIRECT_URL` | No | `http://localhost:3000` | Post-login redirect URL |
| `KINDE_POST_LOGOUT_REDIRECT_URL` | No | `http://localhost:3000` | Post-logout redirect URL |
| `KINDE_DEBUG_MODE` | No | `false` | Enable debug mode for development |

### Client-specific Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | - | Backend API URL (empty uses Next.js proxy) |

## Usage

### Server Packages

```typescript
import { getServerConfig } from '@starships/env-config';

const env = getServerConfig();
console.log(env.PORT); // Type-safe access
console.log(env.KINDE_CLIENT_ID); // Available in server context
```

### Client Package (Next.js)

```typescript
import { env, getApiBaseUrl } from '@starships/client/src/lib/env';

// Type-safe environment access
const apiUrl = getApiBaseUrl();
const kindeClientId = env.kinde.CLIENT_ID; // Server-side only
const publicApiUrl = env.client.NEXT_PUBLIC_API_URL; // Browser-safe
```

### Direct env-config Usage in Client

```typescript
import { getClientConfig } from '@starships/env-config';

const env = getClientConfig();
console.log(env.NEXT_PUBLIC_API_URL); // Type-safe access
```

## Configuration Files

### Root .env File Structure

```bash
# Server Configuration
PORT=4000
NODE_ENV=development
LOG_LEVEL=info

# Deployment
REDEPLOY_SECRET=changeme

# External Services
DISCORD_BOT_TOKEN=
OPEN_WEBUI_BASE_URL=

# OpenAI Configuration
OPENAI_API_KEY=sk-...

# Anthropic Configuration  
ANTHROPIC_API_KEY=sk-ant-...

# LLM Provider Defaults
DEFAULT_LLM_PROVIDER=openai
DEFAULT_CHAT_MODEL=gpt-4
DEFAULT_EMBEDDING_MODEL=text-embedding-3-small

# FAISS Vector Store
FAISS_INDEX_PATH=./data/faiss_index

# Neo4j Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

# Kinde Authentication Configuration (used by both server and client)
KINDE_CLIENT_ID=your_kinde_client_id
KINDE_CLIENT_SECRET=your_kinde_client_secret
KINDE_ISSUER_URL=https://your_subdomain.kinde.com
KINDE_SITE_URL=http://localhost:3000
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
KINDE_DEBUG_MODE=true

# Client-specific Environment Variables
NEXT_PUBLIC_API_URL=
```

## Validation

The environment configuration includes automatic validation:

- **LLM Provider Keys**: Validates that the correct API key is provided based on `DEFAULT_LLM_PROVIDER`
- **Production Requirements**: Validates required Kinde variables in production
- **Type Safety**: All variables are properly typed and validated at runtime

## Migration from Old System

The old system had separate `.env` files in each package. The new system:

1. ✅ **Centralizes** all variables in root `.env`
2. ✅ **Removes** package-specific `.env` files
3. ✅ **Provides** type safety across all packages
4. ✅ **Maintains** Next.js compatibility
5. ✅ **Validates** required variables at startup

## Notes

- Copy `.env.example` to `.env` and fill in your values
- The `@starships/env-config` package automatically loads from root `.env`
- Next.js environment variables are handled in `next.config.js` for proper client-side exposure
- All packages now have consistent, type-safe environment access 