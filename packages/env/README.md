# @starships/env

A simplified environment configuration package for starships.ai that provides a single `getConfig()` function to read all environment variables from the root `.env` file with typed keys.

## Overview

This package replaces the more complex `@starships/env-config` with a lean, single-purpose solution that:

- Reads environment variables from the root `.env` file
- Returns all configuration with proper TypeScript typing
- Provides sensible defaults for development
- Has minimal complexity and no client/server separation

## Usage

```typescript
import { getConfig } from '@starships/env';

const config = getConfig();

console.log(config.PORT); // number
console.log(config.NODE_ENV); // string
console.log(config.NEO4J_URI); // string
// ... all other environment variables with proper typing
```

## Available Configuration

The `getConfig()` function returns an `EnvironmentConfig` object with all environment variables properly typed, including:

### Server Configuration
- `PORT` (number) - Server port, defaults to 4000
- `NODE_ENV` (string) - Environment, defaults to 'development' 
- `LOG_LEVEL` (string) - Log level, defaults to 'info'

### URLs
- `CLIENT_URL` (string) - Frontend URL, defaults to 'http://localhost:3000'
- `SERVER_URL` (string) - Backend URL, defaults to 'http://localhost:4000'

### Database Configuration
- `NEO4J_URI` (string) - Neo4j connection URI
- `NEO4J_USERNAME` (string) - Neo4j username
- `NEO4J_PASSWORD` (string) - Neo4j password
- `NEO4J_DATABASE` (string) - Neo4j database name

### LLM Provider Configuration
- `OPENAI_API_KEY` (string, optional) - OpenAI API key
- `ANTHROPIC_API_KEY` (string, optional) - Anthropic API key
- `DEFAULT_LLM_PROVIDER` ('openai' | 'anthropic' | '') - Default provider
- `DEFAULT_CHAT_MODEL` (string) - Default model name
- `DEFAULT_MODEL_ID` (string) - Default model ID
- `DEFAULT_TEMPERATURE` (number) - Default temperature
- `DEFAULT_MAX_TOKENS` (number) - Default max tokens

### Authentication & Payments
- `JWT_SECRET` (string) - JWT signing secret
- `STRIPE_SECRET_KEY` (string) - Stripe secret key
- `STRIPE_PUBLISHABLE_KEY` (string) - Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` (string, optional) - Stripe webhook secret

And many more...

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
import { getConfig } from '@starships/env';
```

The `getConfig()` function now returns the complete configuration object instead of requiring separate client/server configurations.