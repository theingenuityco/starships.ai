# @starships/errors

Comprehensive yet lean error handling system for starships.ai, providing developer-friendly error classes with automatic categorization and simplified constructors.

## Overview

This package provides a **lean error system** designed around practical usage patterns. It eliminates the ceremonious constructors and complex mappings found in many error systems in favor of:

- **Clear, actionable error messages**
- **Simple constructors with sensible defaults**
- **Essential properties only** - no bloat
- **Automatic categorization** - no complex mapping files
- **Easy factory functions** - quick error creation

## Quick Start

### Basic Usage

```typescript
import { AppError, ValidationError, NotFoundError, wrapError, toApiError } from '@starships/errors';

// Simple error creation
throw new ValidationError('Email is required', 'email');
throw new NotFoundError('User', userId);
throw new AppError('Something went wrong', 'CUSTOM_ERROR', 500);

// Wrap unknown errors
try {
  await riskyOperation();
} catch (error) {
  throw wrapError(error, 'User creation failed');
}

// Convert for API responses
app.use((error, req, res, next) => {
  res.status(error.statusCode || 500).json(toApiError(error));
});
```

### Common Patterns

```typescript
// Input validation
if (!email) throw new ValidationError('Email is required', 'email');

// Resource not found
const user = await findUser(id);
if (!user) throw new NotFoundError('User', id);

// Database operations
try {
  return await db.user.create(data);
} catch (error) {
  throw new DatabaseError('create', error);
}

// External API calls
try {
  return await fetch(url);
} catch (error) {
  throw new NetworkError('external-api', url, error);
}
```

## Error Types

### AppError (Base Class)

The foundation error class with automatic categorization:

```typescript
const error = new AppError('Database connection failed', 'DB_ERROR', 500);
// Automatically categorizes as 'server' based on 500 status code
```

### ValidationError (400)

For input validation failures:

```typescript
new ValidationError('Invalid email format', 'email');
new ValidationError('Password too short', 'password', { minLength: 8 });
```

### NotFoundError (404)

For missing resources:

```typescript
new NotFoundError('User', userId);
new NotFoundError('Starship', starshipId);
```

### AuthError (401) & ForbiddenError (403)

For authentication and authorization:

```typescript
new AuthError('Invalid credentials');
new ForbiddenError('Admin access required');
```

### DatabaseError (500) & NetworkError (502)

For infrastructure failures:

```typescript
new DatabaseError('create', originalError);
```

## Utility Functions

### Quick Error Creation

```typescript
import { createError, validationError, notFound } from '@starships/errors';

// Generic errors
throw createError('Custom error message', 400);

// Specific types
throw validationError('email', 'Invalid format');
throw notFound('User', '123');
```

### Error Wrapping

```typescript
import { wrapError, getErrorMessage } from '@starships/errors';

try {
  await externalService.call();
} catch (error) {
  // Wraps unknown errors into our system
  throw wrapError(error, 'External service failed');
}

// Safe message extraction
const message = getErrorMessage(unknownError);
```

### API Response Handling

```typescript
import { toApiError, fromApiResponse, isAppError } from '@starships/errors';

// Convert errors to API responses
app.use((error, req, res, next) => {
  const response = toApiError(error);
  const statusCode = isAppError(error) ? error.statusCode : 500;
  res.status(statusCode).json(response);
});

// Handle API client errors
try {
  const response = await apiClient.post('/users', data);
} catch (apiError) {
  throw fromApiResponse(apiError.response);
}
```

## Migration from Complex Error System

If you're migrating from a complex error system:

```typescript
// Old: Ceremonious constructor
throw new ValidationError('Email is required', 'email', { validation: 'email' }, requestId, path, context);

// New: Simple and clean
throw new ValidationError('Email is required', 'email');

// Old: Complex error normalization
const normalized = ErrorUtils.normalize(error, requestId, path);

// New: Simple wrapping
const wrapped = wrapError(error, 'Operation failed');
```

## Design Philosophy

**Less is More**: This error system eliminates:

- ❌ Ceremonious constructors with 8+ parameters
- ❌ Complex error code mappings (100+ codes)
- ❌ Overengineered context systems
- ❌ Properties developers never use

**Developer Experience First**: Instead focusing on:

- ✅ Clear, actionable error messages
- ✅ Simple constructors developers will actually use
- ✅ Essential properties only
- ✅ Automatic categorization and inference
- ✅ Easy patterns for common scenarios

The result: **Developers actually use the error system** instead of falling back to `new Error()`.

## Development

```bash
# Build the package
pnpm run build

# Type check
pnpm run type-check

# Run tests
pnpm run test

# Run tests with coverage
pnpm run test:coverage

# Development mode with watch
pnpm run dev
```

## Dependencies

### Core Dependencies

- **@starships/protocol** - Shared TypeScript types and interfaces

## Architecture

```
src/
├── index.ts                 # Main exports with all error classes and utilities
```

## API Reference

### Error Classes

All error classes extend the base `AppError` class and include automatic HTTP status code categorization:

- **AppError** - Base error class with automatic categorization
- **ValidationError** (400) - Input validation failures
- **NotFoundError** (404) - Missing resources
- **AuthError** (401) - Authentication failures
- **ForbiddenError** (403) - Authorization failures
- **ConflictError** (409) - Resource conflicts
- **RateLimitError** (429) - Rate limiting
- **DatabaseError** (500) - Database operation failures
- **NetworkError** (502) - External service failures
- **ServiceError** (503) - Temporary service issues

### Utility Functions

- `createError()` - Generic error creation with automatic categorization
- `wrapError()` - Wrap unknown errors into the error system
- `validationError()` - Quick validation error creation
- `notFound()` - Quick not found error creation
- `getErrorMessage()` - Safe message extraction from unknown errors
- `isAppError()` - Type guard for application errors
- `toApiError()` - Convert errors to API responses
- `fromApiResponse()` - Create errors from API responses

## Related Packages

This package is part of the starships.ai monorepo:

- [`@starships/protocol`](../protocol/) - Shared types and contracts
- [`@starships/server`](../server/) - API server implementation
- [`@starships/models`](../models/) - Database models and repositories

## License

Private package - Part of the starships.ai project
