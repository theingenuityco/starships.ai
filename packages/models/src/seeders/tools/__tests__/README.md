# Tool Testing Infrastructure

End-to-end test suite for tool templates using autopilot Tool node integration.

## Overview

This test suite provides comprehensive testing for all tool templates in the `seed/tools` directory, validating:

- **Tool Structure** - Validates tool definition completeness and format
- **Parameter Schema** - Tests input parameter definitions and requirements
- **Blueprint Structure** - Validates workflow nodes, edges, and connectivity
- **Template Configuration** - Verifies template metadata and example usage
- **End-to-End Execution** - Tests tools through autopilot engine
- **Error Handling** - Validates proper error responses and edge cases

## Test Files

### Individual Tool Tests

- [`calculator.test.ts`](./calculator.test.ts) - Mathematical expression evaluation tool
- [`echo.test.ts`](./echo.test.ts) - Simple input/output testing utility
- [`time.test.ts`](./time.test.ts) - Current time generation with timezone support
- [`blueprint-lint.test.ts`](./blueprint-lint.test.ts) - Blueprint validation tool
- [`tool-list.test.ts`](./tool-list.test.ts) - API-based tool listing functionality

### Test Infrastructure

- [`tool-test-helper.ts`](./tool-test-helper.ts) - Core testing utilities and helper classes
- [`index.test.ts`](./index.test.ts) - Integration tests across all tools
- [`setup.ts`](./setup.ts) - Jest configuration and global test setup

## Key Components

### ToolTestHelper Class

The `ToolTestHelper` class provides comprehensive testing capabilities:

```typescript
import { ToolTestHelper, CommonToolTestData } from './tool-test-helper';

const testHelper = new ToolTestHelper(toolParams, toolTemplate, 'tool-name');

// Validate tool structure
const structureResult = testHelper.testToolStructure();

// Test parameter schema
const schemaResult = testHelper.testParameterSchema();

// Test blueprint connectivity
const blueprintResult = testHelper.testBlueprintStructure();

// Execute tool end-to-end
const result = await testHelper.executeToolViaEngine(input, mockEnv);

// Run all validation tests
const validation = testHelper.runAllValidationTests();
```

### Mock Environment

For tools requiring API access, use the mock environment:

```typescript
// Mock API environment
const mockEnv = {
  BASE_URL: 'https://api.test.com',
  AUTH_TOKEN: 'mock-auth-token',
  STARSHIP_ID: 'test-starship-123',
};

const result = await testHelper.executeToolViaEngine(input, mockEnv);
```

### Common Test Data

Pre-defined test inputs for common scenarios:

```typescript
import { CommonToolTestData } from './tool-test-helper';

// Calculator tool input
const calcInput = CommonToolTestData.VALID_CALCULATOR_INPUT;

// Echo tool input
const echoInput = CommonToolTestData.VALID_ECHO_INPUT;

// Time tool input
const timeInput = CommonToolTestData.VALID_TIME_INPUT;

// Mock API environment
const apiEnv = CommonToolTestData.MOCK_API_ENV;

// Valid blueprint structure
const blueprint = CommonToolTestData.VALID_BLUEPRINT;
```

## Running Tests

### All Tool Tests

```bash
# Run all tool tests
pnpm test src/seeders/tools/__tests__

# Run with coverage
pnpm test --coverage src/seeders/tools/__tests__

# Run in watch mode
pnpm test --watch src/seeders/tools/__tests__
```

### Individual Tool Tests

```bash
# Test specific tool
pnpm test src/seeders/tools/__tests__/calculator.test.ts

# Test with verbose output
pnpm test --verbose src/seeders/tools/__tests__/echo.test.ts
```

### Integration Tests

```bash
# Run integration tests across all tools
pnpm test src/seeders/tools/__tests__/index.test.ts
```

## Test Categories

### 1. Tool Structure Tests

Validates basic tool definition:

- Required fields (name, description, parameters, blueprint)
- Field types and formats
- Template consistency

### 2. Parameter Schema Tests

Validates input parameters:

- Schema structure (type: 'object', properties)
- Required vs optional parameters
- Parameter descriptions and types
- Validation rules

### 3. Blueprint Structure Tests

Validates workflow blueprints:

- Node and edge arrays
- Node types (start, end, code, etc.)
- Node references and connectivity
- Edge relationships

### 4. Execution Tests

End-to-end tool execution:

- Valid input processing
- Expected output format
- Error handling
- Performance (execution time)
- Event emission

### 5. Error Handling Tests

Edge cases and error conditions:

- Missing required parameters
- Invalid parameter types
- Malformed input data
- Environment variable issues
- Security validation

## Test Patterns

### Standard Test Structure

Each tool test follows this pattern:

```typescript
describe('Tool Name', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(toolParams, toolTemplate, 'tool-name');
    testHelper.clearEventLogs();
  });

  describe('Tool Structure', () => {
    // Structure validation tests
  });

  describe('Parameter Schema', () => {
    // Parameter validation tests
  });

  describe('Blueprint Structure', () => {
    // Blueprint validation tests
  });

  describe('Template Configuration', () => {
    // Template consistency tests
  });

  describe('Tool Execution', () => {
    // End-to-end execution tests
  });

  describe('Error Handling', () => {
    // Error condition tests
  });

  describe('All Validation Tests', () => {
    // Comprehensive validation
  });
});
```

### Assertion Patterns

Common test assertions:

```typescript
// Structure validation
expect(result.valid).toBe(true);
expect(result.errors).toHaveLength(0);

// Execution success
expect(result.success).toBe(true);
expect(result.result).toBeDefined();

// Error handling
expect(result.success).toBe(false);
expect(result.error).toContain('expected error message');

// Performance
expect(result.duration).toBeLessThan(5000);

// Event emission
const events = testHelper.getEventLogs();
expect(events.length).toBeGreaterThan(0);
```

## Tool-Specific Notes

### Calculator Tool

- Tests mathematical expression evaluation
- Validates security (no eval, limited characters)
- Tests precedence (2 + 3 \* 4 = 14)

### Echo Tool

- Tests simple input/output reflection
- Validates metadata handling
- Tests special characters and Unicode

### Time Tool

- Tests timezone support
- Validates format options (ISO, locale, timestamp)
- Tests default parameter handling

### Blueprint Lint Tool

- Tests blueprint validation logic
- Validates node type checking
- Tests connectivity validation

### Tool List Tool

- Tests API integration patterns
- Validates environment variable requirements
- Tests HTTP request preparation

## Extending Tests

### Adding New Tool Tests

1. Create test file: `src/seeders/tools/__tests__/your-tool.test.ts`
2. Import tool definition and template
3. Follow standard test structure pattern
4. Add tool-specific test cases
5. Update integration tests

### Custom Test Utilities

Add helper methods to `ToolTestHelper`:

```typescript
// Add to ToolTestHelper class
async executeWithRetry(input: unknown, retries = 3): Promise<ExecutionTestResult> {
  for (let i = 0; i < retries; i++) {
    const result = await this.executeToolViaEngine(input);
    if (result.success) return result;
  }
  throw new Error('Tool execution failed after retries');
}
```

## Troubleshooting

### Common Issues

1. **TypeScript Errors**: Ensure proper type annotations and imports
2. **Mock Environment**: API tools require proper mock environment setup
3. **Execution Timeouts**: Increase Jest timeout for slow tools
4. **Blueprint Validation**: Ensure blueprints have start/end nodes

### Debug Tips

```typescript
// Enable event logging
testHelper.clearEventLogs();
await testHelper.executeToolViaEngine(input);
console.log('Events:', testHelper.getEventLogs());

// Check validation details
const validation = testHelper.runAllValidationTests();
if (validation.errors.length > 0) {
  console.error('Validation errors:', validation.errors);
}
```

## Performance Considerations

- Tool execution tests have 30-second timeout
- Large test suites may take several minutes
- Use `--maxWorkers=1` for debugging
- Mock external dependencies to improve speed

## Contributing

When adding new tools:

1. Create comprehensive test coverage
2. Follow established patterns
3. Include error handling tests
4. Update integration tests
5. Document tool-specific behavior

This testing infrastructure ensures all tools work correctly with the autopilot engine and provides confidence in tool reliability and functionality.
