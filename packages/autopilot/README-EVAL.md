# Template Expressions and Evaluation Engine

This document explains the comprehensive template expression system (`{{ jsExpression }}` syntax) used throughout the Autopilot workflow engine for dynamic evaluation and data access.

## Overview

The Autopilot evaluation engine enables dynamic JavaScript expressions within blueprint parameters, allowing workflows to access runtime context, transform data, and make decisions based on execution state.

## Template Syntax

Template expressions use double curly brace syntax:

```javascript
{
  {
    jsExpression;
  }
}
```

### Basic Examples

```javascript
// Simple variable access
{
  {
    state.counter;
  }
}

// Function calls
{
  {
    $lastOutputOf('http_1');
  }
}

// Complex expressions
{
  {
    state.users.length > 0 ? state.users[0].name : 'No users';
  }
}

// Environment variables
{
  {
    env('API_KEY');
  }
}
```

## Context Variables

The evaluation context provides access to runtime execution data:

### Core Context

- **`state`**: Current workflow execution state (JSON object)
- **`input`**: Current node input data
- **`outputs`**: Array of all previous node results
- **`status`**: Current execution status (`'running' | 'completed' | 'failed' | 'paused'`)
- **`currentNodeRef`**: Reference to currently executing node

### Context Structure Example

```javascript
{
  state: {
    counter: 5,
    user: { id: 123, name: "Alice" },
    apiResponses: []
  },
  input: { location: "San Francisco", units: "metric" },
  outputs: [
    { nodeRef: "start_1", items: [...] },
    { nodeRef: "http_1", items: [...] }
  ],
  status: "running",
  currentNodeRef: "transform_1"
}
```

## Helper Functions

### `$lastOutputOf(nodeRef)`

Retrieves the latest output from a specific node:

```javascript
// Get HTTP response data
{
  {
    $lastOutputOf('api_call')[0].json;
  }
}

// Get LLM response content
{
  {
    $lastOutputOf('llm_1')[0].json.choices[0].message.content;
  }
}

// Check if output exists
{
  {
    $exists($lastOutputOf('optional_node'));
  }
}
```

**Error Handling**: Throws descriptive error if nodeRef not found, including available outputs and troubleshooting guidance.

### `$input(path?)`

Extracts data from input using dot notation:

```javascript
// Get entire input
{
  {
    $input();
  }
}

// Get specific field
{
  {
    $input('user.email');
  }
}

// Nested access
{
  {
    $input('metadata.tags');
  }
}
```

### `env(key)` / `envAll()`

Secure access to environment variables and secrets:

```javascript
// Single environment variable
{
  {
    env('API_KEY');
  }
}
{
  {
    env('DATABASE_URL');
  }
}

// All environment variables
{
  {
    envAll();
  }
}
```

**Security**: Environment access is sandboxed and controlled by the execution context.

## String Evaluation Modes

The engine supports two string evaluation modes:

### Full-Only Mode (`stringEvaluationMode: 'full-only'`)

- Only evaluates when entire string is a single template expression
- Safer for embedded JSON or serialized data
- Prevents cross-scope template evaluation

```javascript
// These will be evaluated:
'{{ state.counter }}'; // → 42
"{{ $input('name') }}"; // → "Alice"

// These will NOT be evaluated (returned as-is):
'Hello {{ name }}!'; // → "Hello {{ name }}!"
"API: {{ env('URL') }}/data"; // → "API: {{ env('URL') }}/data"
```

### Allow-Partial Mode (`stringEvaluationMode: 'allow-partial'`, default)

- Evaluates templates within larger strings
- Supports string interpolation

```javascript
// All of these will be evaluated:
'{{ state.counter }}'; // → 42
"Hello {{ $input('name') }}!"; // → "Hello Alice!"
"API: {{ env('URL') }}/data"; // → "API: https://api.example.com/data"
```

## Blueprint-Safe Evaluation

The engine automatically detects and protects blueprint-like objects to prevent cross-scope evaluation:

### Protected Structures

- Objects with `nodes[]` and `edges[]` arrays (blueprints)
- `blueprint` properties containing workflow definitions
- `tools` arrays containing tool definitions with blueprints

```javascript
// This blueprint will NOT have its templates evaluated:
{
  blueprint: {
    nodes: [
      {
        parameters: {
          url: "{{ $input('endpoint') }}", // Protected from evaluation
        },
      },
    ];
  }
}
```

## Common Use Cases

### HTTP Requests

```javascript
// Dynamic URL construction
{
  url: "{{ env('BASE_URL') }}/users/{{ $input('userId') }}",
  headers: {
    "Authorization": "Bearer {{ env('API_TOKEN') }}",
    "Content-Type": "application/json"
  },
  body: {
    "timestamp": "{{ $now() }}",
    "requestId": "{{ $random() }}"
  }
}
```

### LLM Messages

```javascript
// Dynamic system prompts
{
  role: "system",
  content: "You are {{ $input('persona') }}. Current context: {{ state.context }}"
}

// User messages with data
{
  role: "user",
  content: "Analyze this data: {{ JSON.stringify($lastOutputOf('data_fetch')[0].json) }}"
}
```

### Conditional Logic

```javascript
// Conditional node evaluation
{
  condition: "{{ state.retryCount < 3 && $exists($lastOutputOf('api_call')[0].error) }}"
}

// Edge conditions
{
  from: "check_status",
  to: "retry_logic",
  condition: "{{ $lastOutputOf('check_status')[0].json.status === 'failed' }}"
}
```

### State Mutations

```javascript
// JSON Patch operations with templates
{
  mutations: [
    {
      operation: 'add',
      path: '/state/processedAt',
      value: '{{ $now() }}',
    },
    {
      operation: 'replace',
      path: '/state/counter',
      value: '{{ (state.counter || 0) + 1 }}',
    },
    {
      operation: 'add',
      path: '/state/lastResponse',
      value: "{{ $lastOutputOf('api_call')[0].json }}",
    },
  ];
}
```

## Advanced Patterns

### Conditional Expressions

```javascript
// Ternary operators
{
  {
    state.isProduction ? env('PROD_URL') : env('DEV_URL');
  }
}

// Logical operators
{
  {
    state.user && state.user.isActive;
  }
}

// Null coalescing
{
  {
    $input('timeout') ?? 5000;
  }
}
```

### Array and Object Manipulation

```javascript
// Array operations
{
  {
    state.users.filter((u) => u.active).length;
  }
}
{
  {
    state.items.map((item) => item.id);
  }
}

// Object operations
{
  {
    Object.keys(state.metadata);
  }
}
{
  {
    Object.values($lastOutputOf('aggregator')[0].json);
  }
}
```

### Complex Data Transformations

```javascript
// Transform API response
{
  {
    $lastOutputOf('api_call')[0].json.users.map((user) => ({
      id: user.user_id,
      name: `${user.first_name} ${user.last_name}`,
      email: user.email_address,
    }));
  }
}
```

## Error Handling

### Common Errors and Solutions

**Missing Node Reference**

```
Error: No output found for nodeRef="missing_node".
Current node="transform_1". Available outputs: [start_1, http_1].
This typically occurs when a template references a node from a different
workflow scope or when the node has not executed yet.
```

**Solution**: Verify node references and execution order.

**Invalid Expression Syntax**

```
Error: Expression evaluation failed for "{{ invalidSyntax }}":
Unexpected token
```

**Solution**: Check JavaScript syntax within template expressions.

**Context Access Errors**

```
Error: Cannot read property 'undefined' of undefined
```

**Solution**: Use safe navigation and null checks:

```javascript
// Instead of: {{ state.user.email }}
// Use: {{ state.user?.email ?? 'no-email' }}
```

## Validation and Security

### Expression Validation

The engine provides compile-time validation:

```typescript
const result = eval.validateExpression('{{ state.counter + 1 }}');
// Returns: { valid: true, errors: [] }
```

### Security Considerations

- **Sandboxed Execution**: Templates execute in controlled context
- **No File System Access**: Expressions cannot access file system
- **No Network Access**: No direct HTTP requests from templates
- **Environment Variable Control**: Only approved environment variables accessible
- **Blueprint Protection**: Nested blueprints protected from evaluation

### Production Recommendations

- Use `stringEvaluationMode: 'full-only'` for sensitive data
- Validate all templates before deployment
- Implement expression timeouts for long-running evaluations
- Monitor template execution for performance impact

## Best Practices

### Template Organization

```javascript
// Good: Simple, readable expressions
{
  {
    state.counter;
  }
}
{
  {
    $input('userId');
  }
}

// Avoid: Complex logic in templates
{
  {
    state.users.filter((u) => u.roles.includes('admin')).map((u) => u.permissions.reduce((acc, p) => acc.concat(p.actions), []));
  }
}

// Better: Use code nodes for complex logic
// Template: {{ state.adminPermissions }}
// Code node: state.adminPermissions = calculateAdminPermissions(state.users)
```

### Error-Safe Templates

```javascript
// Use optional chaining and defaults
{
  {
    state.user?.profile?.avatar ?? '/default-avatar.png';
  }
}

// Check existence before access
{
  {
    $exists($lastOutputOf('optional_step')) ? $lastOutputOf('optional_step')[0].json : null;
  }
}

// Provide fallbacks
{
  {
    $input('timeout') || 30000;
  }
}
```

### Performance Optimization

```javascript
// Cache expensive operations in state
// Instead of repeated complex expressions, compute once:
{
  mutations: [
    {
      operation: 'add',
      path: '/state/userSummary',
      value: '{{ computeUserSummary(state.users) }}',
    },
  ];
}

// Then reference cached result:
{
  {
    state.userSummary;
  }
}
```

## Integration Examples

### Complete Workflow Example

```json
{
  "nodes": [
    {
      "ref": "start_1",
      "type": "start",
      "parameters": {}
    },
    {
      "ref": "fetch_user",
      "type": "http_request",
      "parameters": {
        "url": "{{ env('API_BASE') }}/users/{{ $input('userId') }}",
        "headers": {
          "Authorization": "Bearer {{ env('API_TOKEN') }}"
        }
      }
    },
    {
      "ref": "process_user",
      "type": "code",
      "parameters": {
        "code": "const user = $lastOutputOf('fetch_user')[0].json; return { ...user, processed: true };"
      }
    },
    {
      "ref": "conditional_check",
      "type": "conditional",
      "parameters": {
        "condition": "{{ $lastOutputOf('process_user')[0].json.isActive }}"
      }
    },
    {
      "ref": "send_notification",
      "type": "http_request",
      "parameters": {
        "url": "{{ env('NOTIFICATION_SERVICE') }}/send",
        "method": "POST",
        "body": {
          "userId": "{{ $lastOutputOf('process_user')[0].json.id }}",
          "message": "Welcome {{ $lastOutputOf('process_user')[0].json.name }}!"
        }
      }
    }
  ],
  "edges": [
    { "ref": "e1", "from": "start_1", "to": "fetch_user" },
    { "ref": "e2", "from": "fetch_user", "to": "process_user" },
    { "ref": "e3", "from": "process_user", "to": "conditional_check" },
    {
      "ref": "e4",
      "from": "conditional_check",
      "to": "send_notification",
      "condition": "{{ $lastOutputOf('conditional_check')[0].json.result === true }}"
    }
  ]
}
```

This comprehensive template system enables powerful, dynamic workflow execution while maintaining security and performance.
