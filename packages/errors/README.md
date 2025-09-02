# @starships/errors

Lean error handling system for Starships.ai providing standardized error classes and utilities.

## Overview

This package contains the core error handling system used across all Starships.ai packages. It provides:

- **BaseError**: Abstract base class for all application errors
- **Specific Error Classes**: ValidationError, NotFoundError, InternalServerError
- **Error Utilities**: ErrorFactory, ErrorUtils for creating and handling errors
- **Error Categories**: Enum for error classification

## Usage

```typescript
import { ValidationError, ErrorFactory, ErrorUtils } from '@starships/errors';

// Create errors directly
throw new ValidationError('Invalid input', 'email');

// Use ErrorFactory
throw ErrorFactory.validation('Invalid email format', 'email');

// Handle unknown errors
const normalizedError = ErrorUtils.normalize(someError);
```

## Error Classes

### ValidationError (400)
For input validation failures and malformed requests.

### NotFoundError (404) 
For when requested resources don't exist.

### InternalServerError (500)
For unexpected internal errors.

## Design Principles

- **Lean**: Contains only the essential error classes actually used
- **Consistent**: Standardized error structure across all packages
- **Type-safe**: Full TypeScript support with proper inheritance
- **Structured**: Includes metadata for logging and debugging