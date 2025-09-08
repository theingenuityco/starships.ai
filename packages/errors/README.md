# @starships/errors

Lean error handling system for Starships.ai - focused on dev-friendly messages and simple patterns developers actually use.

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
new NetworkError('stripe-api', '/v1/customers', originalError);
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
