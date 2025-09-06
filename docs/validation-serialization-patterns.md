# Validation and Serialization Patterns for Repositories

This document outlines the standardized validation and serialization patterns implemented in the SessionRepository, which should be adopted across all repositories in the starships.ai project.

## Overview

We have introduced professional validation and serialization libraries that provide:

- **Type-safe validation** using BaseRepository methods
- **Professional serialization** using class-transformer decorators
- **Consistent error handling** with standardized error contexts
- **Maintainable patterns** that reduce code duplication

## Key Components

### 1. Entity Classes with Decorators

**Location**: `packages/models/src/entities/`

Example: [`SessionEntity.ts`](packages/models/src/entities/SessionEntity.ts)

```typescript
import { SerializableModel, Transformers } from '@/helpers/serializer';
import { Transform, Expose } from 'class-transformer';

export class SessionEntity extends SerializableModel implements SessionModel {
  @Expose()
  @Transform(({ value }) => value)
  id!: string;

  @Expose()
  @Transformers.DateTransform()
  createdAt!: string;

  @Expose()
  @Transformers.JsonTransform()
  metadata?: Record<string, unknown>;

  // Validation constants for repositories
  static readonly VALIDATION = {
    REQUIRED_FIELDS: ['id', 'createdAt', 'lastActivityAt', 'messageCount', 'status'] as const,
    STATUS_VALUES: ['active', 'paused', 'completed', 'archived'] as const,
    FIELD_TYPES: {
      id: 'string',
      messageCount: 'number',
      status: 'string',
    } as const,
    ENUM_CONSTRAINTS: {
      status: ['active', 'paused', 'completed', 'archived'],
    } as const,
  } as const;
}
```

### 2. BaseRepository Methods

**Available validation methods:**

- [`validateRequired()`](packages/models/src/repositories/BaseRepository.ts:320) - Validate required fields
- [`validateTypes()`](packages/models/src/repositories/BaseRepository.ts:341) - Validate field types
- [`validateEnums()`](packages/models/src/repositories/BaseRepository.ts:393) - Validate enum values
- [`validateStringLengths()`](packages/models/src/repositories/BaseRepository.ts:362) - Validate string lengths

**Available serialization methods:**

- [`serializeForDatabase()`](packages/models/src/repositories/BaseRepository.ts:565) - Serialize for storage
- [`deserializeFromDatabase()`](packages/models/src/repositories/BaseRepository.ts:583) - Deserialize from storage
- [`mapFromDatabaseRecord()`](packages/models/src/repositories/BaseRepository.ts:627) - Consistent field transformation

## Implementation Patterns

### 1. Create Method with Validation

```typescript
async create(entity: Omit<SessionModel, 'id' | 'createdAt' | 'updatedAt'>, starshipId?: string): Promise<SessionModel> {
  return this.executeWithErrorHandling(
    async () => {
      // Validate required fields
      this.validateRequired(entity, ['lastActivityAt', 'messageCount', 'status'], 'create');

      // Validate field types
      this.validateTypes(entity, {
        lastActivityAt: 'string',
        messageCount: 'number',
        status: 'string'
      }, 'create');

      // Validate enum values
      this.validateEnums(entity, {
        status: ['active', 'paused', 'completed', 'archived']
      }, 'create');

      // ... rest of implementation
    },
    'create',
    'Session'
  );
}
```

### 2. Update Method with Selective Validation

```typescript
async update(id: string, updates: Partial<SessionModel>): Promise<SessionModel | null> {
  return this.executeWithErrorHandling(
    async () => {
      // Only validate fields that are being updated
      if (updates.status !== undefined) {
        this.validateEnums(updates, {
          status: ['active', 'paused', 'completed', 'archived']
        }, 'update');
      }

      // ... rest of implementation
    },
    'update',
    'Session',
    id
  );
}
```

### 3. Consistent Database Mapping

**Replace legacy mapping methods with:**

```typescript
// OLD - Manual mapping with custom logic
private mapToSession(sessionModel: any): SessionModel {
  // Custom JSON parsing, defaults, etc.
}

// NEW - Standardized mapping
return this.mapFromDatabaseRecord<SessionModel>(record, {
  jsonFields: ['metadata'],
  defaultValues: {
    messageCount: 0,
    totalTokens: 0,
    status: 'active'
  }
});
```

## Benefits

### 1. Type Safety

- Proper typing with class-transformer decorators
- Compile-time validation of field types and constraints
- IDE support with autocomplete and error detection

### 2. Consistent Validation

- Standardized validation rules across all repositories
- Centralized error handling with proper context
- Professional error responses with field-level details

### 3. Better Serialization

- Automatic JSON parsing/stringification
- Date transformation handling
- Consistent default value application

### 4. Maintainability

- Centralized validation logic reduces duplication
- Easy to audit and maintain validation rules
- Consistent patterns across the codebase

## Migration Guide for Other Repositories

### Step 1: Create Entity Class

Create an entity class in `packages/models/src/entities/` with proper decorators and validation constants.

### Step 2: Update Repository Imports

```typescript
import { YourEntity } from '@/entities/YourEntity';
```

### Step 3: Replace Manual Validation

Replace manual validation with BaseRepository methods:

- `validateRequired()` for required field checks
- `validateTypes()` for type validation
- `validateEnums()` for enum validation
- `validateStringLengths()` for length constraints

### Step 4: Replace Manual Mapping

Replace custom mapping methods with `mapFromDatabaseRecord()`:

- Specify `jsonFields` for automatic JSON parsing
- Specify `defaultValues` for consistent defaults
- Remove manual JSON parsing logic

### Step 5: Update Error Handling

Ensure all operations use `executeWithErrorHandling()` for consistent error context.

## Examples in Codebase

- **Implemented**: [`SessionRepository`](packages/models/src/repositories/SessionRepository.ts) - Full implementation with validation and serialization
- **Available utilities**: [`ModelSerializer`](packages/models/src/helpers/serializer.ts) - Serialization helpers and decorators
- **Base patterns**: [`BaseRepository`](packages/models/src/repositories/BaseRepository.ts) - All available validation and serialization methods

## Next Steps

1. Apply these patterns to other repositories in the project
2. Create entity classes for other domain models
3. Gradually migrate legacy validation and mapping logic
4. Ensure consistent error handling across all repositories
