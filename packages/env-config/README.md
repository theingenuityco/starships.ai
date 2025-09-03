# Environment Configuration Package

Centralized environment variable management for the Starships.ai monorepo.

## Overview

This package provides:
- Type-safe environment variable loading
- Validation of required variables
- Centralized configuration from root `.env` file
- Separate server and client environment handling

## Usage

### Server-side (Node.js packages)

```typescript
import { getServerConfig } from '@starships/env-config';

const env = getServerConfig();
console.log(env.PORT); // Type-safe access
```

### Client-side (Next.js)

```typescript
import { getClientConfig } from '@starships/env-config';

const env = getClientConfig();
console.log(env.NEXT_PUBLIC_API_URL); // Type-safe access
```

For Next.js, also use the client-side env utility:

```typescript
import { env, getApiBaseUrl } from '@starships/client/src/lib/env';

// Access environment variables
const apiUrl = getApiBaseUrl();
// JWT authentication doesn't require client-side environment variables
```

### Full Configuration

```typescript
import { getConfig } from '@starships/env-config';

const env = getConfig();
// Access to both server and client variables
```

## Environment Variables

All environment variables are loaded from the root `.env` file.

### Server Variables
- `PORT` - Server port (default: 4000)
- `NODE_ENV` - Environment (development/production/test)
- `NEO4J_*` - Neo4j database configuration
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- And more...

### Client Variables (Next.js)
- `NEXT_PUBLIC_API_URL` - Backend API URL

## Validation

The package automatically validates:
- Required API keys based on selected LLM provider
- Required authentication configuration in production
- Proper data types for numeric values

## Error Handling

```typescript
try {
  const env = getServerConfig();
} catch (error) {
  if (error instanceof EnvironmentValidationError) {
    console.error('Missing variables:', error.missingVariables);
  }
}
``` 