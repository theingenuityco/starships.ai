# JSON Patch Transform System for Autopilot

## Overview

The autopilot package now uses a JSON Patch-based transform system for state mutations, replacing the previous JSONata assignment expressions. This provides a more standardized, predictable, and powerful way to modify execution state.

## Key Changes

### 1. Transform Structure

**Before** (`transform`):

```typescript
{
  transform: ['state.counter := state.counter + 1', 'state.lastUpdated := $now()'];
}
```

**After** (`transforms`):

```typescript
{
  transforms: [
    { operation: 'replace', path: '/state/counter', value: '{{ state.counter + 1 }}' },
    { operation: 'add', path: '/state/lastUpdated', value: '{{ $now() }}' },
  ];
}
```

### 2. JSON Patch Operations

The system supports all standard JSON Patch operations:

- **`add`** - Add a new value at the specified path
- **`replace`** - Replace an existing value at the specified path
- **`remove`** - Remove a value at the specified path
- **`copy`** - Copy a value from one path to another
- **`move`** - Move a value from one path to another
- **`test`** - Test that a value at a path matches expected value

### 3. Template Support

Values can be static or use template expressions with `{{ }}` syntax:

```typescript
{
  transforms: [
    { operation: 'add', path: '/state/userId', value: 'user-123' }, // Static value
    { operation: 'add', path: '/state/timestamp', value: '{{ $now() }}' }, // Template
    { operation: 'replace', path: '/state/count', value: '{{ state.count + 1 }}' }, // Dynamic
  ];
}
```

## Implementation Details

### TransformOperation Interface

```typescript
interface TransformOperation {
  /** JSON Patch operation type */
  operation: 'add' | 'replace' | 'remove' | 'copy' | 'move' | 'test';
  /** JSON Pointer path (e.g., "/state/counter", "/state/user/name") */
  path: string;
  /** Value to apply - can be static value or template expression {{ }} */
  value?: unknown;
  /** For copy/move operations - source path */
  from?: string;
}
```

### BaseParams Interface

All node parameters now extend from:

```typescript
interface BaseParams {
  transforms?: TransformOperation[];
}
```

### Path Requirements

- All paths must start with `/state` to ensure only execution state is modified
- Paths follow JSON Pointer format (RFC 6901)
- Array operations use `-` for append: `/state/list/-`

## Usage Examples

### Basic State Management

```typescript
{
  ref: 'init',
  type: 'start',
  parameters: {
    transforms: [
      { operation: 'add', path: '/state/session', value: { id: '{{ $random() }}', startTime: '{{ $now() }}' } },
      { operation: 'add', path: '/state/counters', value: { requests: 0, errors: 0 } }
    ]
  }
}
```

### Array Operations

```typescript
{
  ref: 'track-request',
  type: 'http_request',
  parameters: {
    url: 'https://api.example.com/data',
    transforms: [
      // Add to array
      { operation: 'add', path: '/state/requestHistory/-', value: { url: 'https://api.example.com/data', timestamp: '{{ $now() }}' } },
      // Increment counter
      { operation: 'replace', path: '/state/counters/requests', value: '{{ state.counters.requests + 1 }}' }
    ]
  }
}
```

### Complex State Updates

```typescript
{
  ref: 'process-user',
  type: 'agent',
  parameters: {
    // ... agent config
    transforms: [
      // Update user status
      { operation: 'replace', path: '/state/user/status', value: '{{ state.user.lastLogin > $dateTime($now(), "-30 days") ? "active" : "inactive" }}' },

      // Copy current metrics to backup
      { operation: 'copy', path: '/state/backup/metrics', from: '/state/metrics' },

      // Move old session data
      { operation: 'move', path: '/state/archive/lastSession', from: '/state/currentSession' },

      // Remove temporary data
      { operation: 'remove', path: '/state/temp' }
    ]
  }
}
```

### Conditional Operations

```typescript
{
  ref: 'conditional-update',
  type: 'conditional',
  parameters: {
    expression: 'state.user.tier = "premium"',
    transforms: [
      // Test current value
      { operation: 'test', path: '/state/user/tier', value: 'premium' },

      // Add premium features
      { operation: 'add', path: '/state/features/premium', value: true },
      { operation: 'add', path: '/state/limits/apiCalls', value: 10000 }
    ]
  }
}
```

## Benefits

1. **Standardized**: Uses RFC 6901 JSON Patch standard
2. **Atomic**: All transforms in an array are applied atomically with rollback on failure
3. **Powerful**: Supports all JSON Patch operations for comprehensive state manipulation
4. **Safe**: Path validation ensures only `/state` can be modified
5. **Template-aware**: Values can use template expressions for dynamic content
6. **Type-safe**: Full TypeScript support with proper operation types
7. **Validated**: Operations are validated at blueprint parse time

## Migration Guide

To migrate existing `transform` properties:

1. Rename `transform` → `transforms`
2. Convert JSONata assignments to JSON Patch operations:
   - `state.field := value` → `{ operation: 'add', path: '/state/field', value: value }`
   - `state.field := $now()` → `{ operation: 'add', path: '/state/field', value: '{{ $now() }}' }`
   - Complex expressions → Use template expressions in `value`

3. Update array operations:
   - `$append(array, item)` → `{ operation: 'add', path: '/state/array/-', value: item }`

4. Path format:
   - `state.nested.field` → `/state/nested/field`

## Error Handling

The system provides comprehensive validation:

- Invalid operation types
- Missing required properties (value for add/replace, from for copy/move)
- Invalid paths (must start with `/state`)
- Template expression syntax errors
- JSON Patch application failures with automatic rollback

All validation occurs at blueprint parsing time, catching errors before execution.

## Performance

- Uses `fast-json-patch` library for efficient patch operations
- State snapshots use deep cloning for safe rollback
- Atomic operations ensure consistency
- Template expressions are resolved once per transform

This new system provides a more robust, standardized approach to state management while maintaining the flexibility and power needed for complex workflow orchestration.
