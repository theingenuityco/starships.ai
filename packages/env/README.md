# @starships/env

A simplified environment configuration package for starships.ai that provides a single `getEnvConfig()` function to read all environment variables from the root `.env` file with typed keys.

## Overview

This package replaces the more complex `@starships/env-config` with a lean, single-purpose solution that:

- Reads environment variables from the root `.env` file
- Returns all configuration with proper TypeScript typing
- Provides sensible defaults for development
- Has minimal complexity and no client/server separation

## Usage

```typescript
import { getEnvConfig } from '@starships/env';

const config = getEnvConfig();

console.log(config.SERVER_PORT); // number
console.log(config.NODE_ENV); // string
console.log(config.NEO4J_URI); // string
// ... all other environment variables with proper typing
```

## Available Configuration

The `getEnvConfig()` function returns an `EnvironmentConfig` object with all environment variables properly typed, including:

### Server Configuration

- `SERVER_PORT` (number) - Server port, defaults to 4000
- `CLIENT_PORT` (number) - Client port, defaults to 3000
- `NODE_ENV` (string) - Environment, defaults to 'development'
- `LOG_LEVEL` (string) - Log level, defaults to 'info'

### URLs

- `PUBLIC_URL` (string) - Public URL, defaults to 'http://localhost:3000'
- `CLIENT_URL` (string) - Frontend URL, defaults to 'http://localhost:3000'
- `SERVER_URL` (string) - Backend URL, defaults to 'http://localhost:4000'

### Database Configuration

- `NEO4J_URI` (string) - Neo4j connection URI, defaults to 'bolt://localhost:7687'
- `NEO4J_USERNAME` (string) - Neo4j username, defaults to 'neo4j'
- `NEO4J_PASSWORD` (string) - Neo4j password, defaults to 'password'
- `NEO4J_DATABASE` (string) - Neo4j database name, defaults to 'neo4j'

### LLM Provider Configuration

- `OPENAI_API_KEY` (string, optional) - OpenAI API key
- `ANTHROPIC_API_KEY` (string, optional) - Anthropic API key
- `OPENROUTER_API_KEY` (string, optional) - OpenRouter API key for accessing multiple LLM models
- `DEFAULT_LLM_PROVIDER` ('openai' | 'anthropic' | '') - Default provider, defaults to 'openai'
- `DEFAULT_CHAT_MODEL` (string) - Default model name, defaults to 'gpt-4o'

### Authentication & Payments

- `JWT_SECRET` (string) - JWT signing secret
- `STRIPE_SECRET_KEY` (string) - Stripe secret key
- `STRIPE_PUBLISHABLE_KEY` (string) - Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` (string, optional) - Stripe webhook secret
- `STRIPE_PRICE_CRUISER_MONTHLY` (string, optional) - Stripe price ID for cruiser monthly plan
- `STRIPE_PRICE_CRUISER_YEARLY` (string, optional) - Stripe price ID for cruiser yearly plan
- `STRIPE_PRICE_DRAUGHT_MONTHLY` (string, optional) - Stripe price ID for draught monthly plan
- `STRIPE_PRICE_DRAUGHT_YEARLY` (string, optional) - Stripe price ID for draught yearly plan

### Analytics

- `GA_MEASUREMENT_ID` (string, optional) - Google Analytics measurement ID

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm run build

# Type check
pnpm run type-check

# Lint
pnpm run lint
```

## Migration from @starships/env-config

Replace imports:

```typescript
// Before
import { getConfig } from '@starships/env-config';

// After
import { getEnvConfig } from '@starships/env';
```

The `getEnvConfig()` function now returns the complete configuration object instead of requiring separate client/server configurations.
