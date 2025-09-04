# @starships/errors

Lean error handling system for Starships.ai providing standardized error classes, utilities, and error mappings.

## Overview

This package contains the core error handling system used across all Starships.ai packages. It provides:

- **BaseError**: Abstract base class for all application errors
- **Specific Error Classes**: ValidationError, NotFoundError, InternalServerError, etc.
- **Error Utilities**: ErrorUtils for creating and handling errors
- **Error Categories**: Enum for error classification
- **Error Mappings**: Standardized error codes with HTTP status and category mappings

## Usage

### Basic Error Handling

```typescript
import { ValidationError, ErrorUtils } from '@starships/errors';

// Create errors directly
throw new ValidationError('Invalid input', 'email');

// Handle unknown errors
const normalizedError = ErrorUtils.normalize(someError);
```

### Error Mappings

```typescript
import { StandardErrorCode, ErrorMappingUtils, getHttpStatusCode, getErrorCategory, isRetryableError } from '@starships/errors';

// Get HTTP status code for an error
const status = getHttpStatusCode('VALIDATION_ERROR'); // 400
const status2 = ErrorMappingUtils.getHttpStatusCode('VALIDATION_ERROR'); // 400

// Get error category
const category = getErrorCategory('DATABASE_ERROR'); // ErrorCategory.DATABASE

// Check if error is retryable
const canRetry = isRetryableError('TIMEOUT_ERROR'); // true

// Get all error codes for a category
const validationErrors = ErrorMappingUtils.getErrorCodesByCategory(ErrorCategory.VALIDATION);

// Get all error codes for a status code
const clientErrors = ErrorMappingUtils.getErrorCodesByStatusCode(400);
```

## Error Classes

### ValidationError (400)

For input validation failures and malformed requests.

### AuthenticationError (401)

For authentication failures and unauthorized access.

### AuthorizationError (403)

For authorization failures and forbidden operations.

### NotFoundError (404)

For when requested resources don't exist.

### ConflictError (409)

For resource conflicts and business rule violations.

### DatabaseError (500)

For database operation failures.

### NetworkError (502/503)

For network and external service failures.

### InternalServerError (500)

For unexpected internal errors.

### RateLimitError (429)

For rate limiting and quota exceeded scenarios.

### ServiceUnavailableError (503)

For temporary service unavailability.

## Error Mappings

The package provides comprehensive error code mappings:

### StandardErrorCode

A union type containing all standardized error codes used across the platform:

- Validation errors: `VALIDATION_ERROR`, `INVALID_INPUT`, etc.
- Authentication: `AUTHENTICATION_REQUIRED`, `TOKEN_EXPIRED`, etc.
- Authorization: `ACCESS_DENIED`, `INSUFFICIENT_PERMISSIONS`, etc.
- Not Found: `RESOURCE_NOT_FOUND`, `EXPEDITION_NOT_FOUND`, etc.
- Conflicts: `RESOURCE_ALREADY_EXISTS`, `EXPEDITION_ALREADY_STARTED`, etc.
- Database: `DATABASE_ERROR`, `DATABASE_CONNECTION_FAILED`, etc.
- Network: `NETWORK_ERROR`, `SERVICE_UNREACHABLE`, etc.
- Internal: `INTERNAL_SERVER_ERROR`, `CONFIGURATION_ERROR`, etc.

### HTTP Status Mapping

Each error code is mapped to appropriate HTTP status codes (400, 401, 403, 404, 409, 429, 500, etc.)

### Category Mapping

Each error code is categorized using the `ErrorCategory` enum for consistent error classification.

### Utility Functions

- `getHttpStatusCode(code)`: Get HTTP status for error code
- `getErrorCategory(code)`: Get category for error code
- `isRetryableError(code)`: Check if error should be retried
- `shouldLogError(statusCode)`: Check if error should be logged

### ErrorMappingUtils Class

Advanced utilities for working with error mappings:

- `getErrorCodesByCategory(category)`: Get all codes for a category
- `getErrorCodesByStatusCode(status)`: Get all codes for a status code

## Design Principles

- **Lean**: Contains only the essential error classes actually used
- **Consistent**: Standardized error structure across all packages
- **Type-safe**: Full TypeScript support with proper inheritance
- **Structured**: Includes metadata for logging and debugging
- **Comprehensive**: Complete error code mappings for all scenarios
