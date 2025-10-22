# Validation Utility Documentation

## Overview

The `validateData` function provides centralized validation logic across all API routes, ensuring consistent error handling and response formatting. It replaces the duplicate validation functions that were previously scattered across individual route files.

## Key Features

- **Centralized Logic**: Single validation function used across all routes
- **Consistent Error Handling**: Standardized error responses with field-level details
- **Schema Transformation**: Automatic application of defaults and type coercion
- **Security**: Input sanitization and injection prevention
- **TypeScript Support**: Full type safety with generic return types

## Basic Usage

```typescript
import { validateData } from '@/utils/validation';
import { IdSchema, PaginationSchema } from '@/schemas/common';

// Body validation
const bodyValidation = validateData(LoginSchema, req.body, res, 'login data');
if (!bodyValidation) return; // Error already sent to client
const { email, password } = bodyValidation;

// Parameter validation
const paramValidation = validateData(
  z.object({ id: IdSchema }), 
  req.params, 
  res, 
  'user parameter'
);
if (!paramValidation) return;
const { id } = paramValidation;

// Query validation with defaults
const queryValidation = validateData(PaginationSchema, req.query, res, 'pagination');
if (!queryValidation) return;
const { page, limit } = queryValidation; // Defaults applied automatically
```

## Error Response Format

### Validation Errors (400)
```json
{
  "error": {
    "message": "Invalid email format",
    "code": "VALIDATION_ERROR",
    "type": "VALIDATION_ERROR",
    "field": "email",
    "context": "login data",
    "validationErrors": [
      {
        "path": "email",
        "message": "Invalid email format", 
        "code": "invalid_string"
      }
    ]
  }
}
```

### Internal Errors (500)
```json
{
  "error": {
    "message": "login data validation error",
    "code": "INTERNAL_SERVER_ERROR",
    "type": "INTERNAL_SERVER_ERROR"
  }
}
```

## Testing Scenarios

When testing validation, ensure coverage of:

1. **Successful validation** with various data types
2. **Default value application** for optional fields
3. **Type coercion** (string to number, etc.)
4. **Single field errors** with proper field paths
5. **Multiple field errors** with all errors reported
6. **Nested object validation** with dot-notation paths
7. **Array validation** with index-based paths
8. **Missing required fields**
9. **Edge cases** like empty objects and null values
10. **Error handling** for non-Zod exceptions

## Migration Notes

This function replaces the following duplicate validation patterns:

```typescript
// OLD: Local validation functions (removed)
const validateData = <T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null => {
  try {
    return schema.parse(data);
  } catch (error) {
    // ... duplicate error handling
  }
};

// NEW: Centralized validation (use this)
import { validateData } from '@/utils/validation';
```

## Security Considerations

- Always validate input before processing
- Schema validation prevents injection attacks
- Error messages are sanitized to prevent information leakage
- Rate limiting should be applied at middleware level, not in validation
- Parameter validation prevents malformed requests

## Performance Notes

- Validation is synchronous and fast
- Zod schemas are compiled once and reused
- Error response generation is optimized
- Consider caching complex schemas for high-traffic endpoints