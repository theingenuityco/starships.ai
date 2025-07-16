# @starships/models Testing Fixes Plan

## Overview
This document outlines the identified issues with the test setup and provides a comprehensive plan to fix them.

## Issues Identified

### 1. All tests are not running
**Problem**: Only `packages/models/tests/unit/connection.test.ts` runs when using `pnpm --filter @starships/models run test`

**Root Cause**: 
- The default `test` script was configured to run only unit tests (excluding integration tests)
- Integration tests exist but were ignored by the default Jest configuration
- The test runner was not configured to run both unit and integration tests

### 2. TypeScript issue in StarshipRepository
**Problem**: Type mismatch between interface and implementation

**Root Cause**: 
- Interface in `types.ts` defined: `create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt'>)`
- Implementation in `StarshipRepository.ts` had: `create(entity: Omit<Starship, 'id' | 'createdAt'>)`
- Missing `maxAgents` and `updatedAt` exclusions caused TypeScript compilation errors

## Fixes Applied

### ✅ Fixed TypeScript Issue
**File**: [`packages/models/src/repositories/StarshipRepository.ts`](packages/models/src/repositories/StarshipRepository.ts:35)
```typescript
// BEFORE
async create(entity: Omit<Starship, 'id' | 'createdAt'>): Promise<Starship>

// AFTER  
async create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt'>): Promise<Starship>
```

### ✅ Fixed TypeScript Project Configuration
**File**: [`packages/models/tsconfig.json`](packages/models/tsconfig.json:24)
```json
{
  "compilerOptions": {
    // ... other options
    "composite": true  // Added this line
  }
}
```

### ✅ Fixed Test Script Configuration
**File**: [`packages/models/package.json`](packages/models/package.json:11)
```json
{
  "scripts": {
    "test": "pnpm run test:unit && pnpm run test:integration",
    "test:unit": "jest",
    "test:integration": "jest --config jest.integration.config.js",
    // ... other scripts
  }
}
```

## Current Test Structure

### Unit Tests
- **Location**: `packages/models/tests/unit/`
- **Config**: [`jest.config.js`](packages/models/jest.config.js)
- **Files**: 
  - [`connection.test.ts`](packages/models/tests/unit/connection.test.ts) ✅
- **Purpose**: Test individual units with mocked dependencies

### Integration Tests
- **Location**: `packages/models/tests/integration/`
- **Config**: [`jest.integration.config.js`](packages/models/jest.integration.config.js)
- **Files**:
  - [`agent-repository.test.ts`](packages/models/tests/integration/repositories/agent-repository.test.ts) ✅
  - [`channel-repository.test.ts`](packages/models/tests/integration/repositories/channel-repository.test.ts) ✅
  - [`codex-repository.test.ts`](packages/models/tests/integration/repositories/codex-repository.test.ts) ✅
  - [`llm-repository.test.ts`](packages/models/tests/integration/repositories/llm-repository.test.ts) ✅
  - [`starship-repository.test.ts`](packages/models/tests/integration/repositories/starship-repository.test.ts) ✅
  - [`user-repository.test.ts`](packages/models/tests/integration/repositories/user-repository.test.ts) ✅
  - [`vision-repository.test.ts`](packages/models/tests/integration/repositories/vision-repository.test.ts) ✅
- **Purpose**: Test with real Neo4j database using Testcontainers

## Test Execution Strategy

### Sequential Execution
The new test script runs tests sequentially:
1. **Unit Tests First**: Fast, isolated tests with mocks
2. **Integration Tests Second**: Slower, real database tests

### Available Commands
```bash
# Run all tests (unit + integration)
pnpm --filter @starships/models run test

# Run only unit tests
pnpm --filter @starships/models run test:unit

# Run only integration tests  
pnpm --filter @starships/models run test:integration

# Run tests in watch mode (unit tests only)
pnpm --filter @starships/models run test:watch

# Run tests with coverage
pnpm --filter @starships/models run test:coverage
```

## Verification Steps

### 1. Verify TypeScript Compilation
```bash
cd packages/models
pnpm run build
```
**Expected**: No TypeScript errors

### 2. Verify Unit Tests
```bash
cd packages/models  
pnpm run test:unit
```
**Expected**: `connection.test.ts` runs successfully

### 3. Verify Integration Tests
```bash
cd packages/models
pnpm run test:integration
```
**Expected**: All 7 repository integration tests run successfully

### 4. Verify Full Test Suite
```bash
cd packages/models
pnpm run test
```
**Expected**: Both unit and integration tests run in sequence

## Testing Infrastructure

### Test Helpers
- **Neo4j Setup**: [`tests/helpers/neo4j-setup.ts`](packages/models/tests/helpers/neo4j-setup.ts)
- **Neo4j Teardown**: [`tests/helpers/neo4j-teardown.ts`](packages/models/tests/helpers/neo4j-teardown.ts)
- **Test Container**: [`tests/helpers/neo4j-testcontainer.ts`](packages/models/tests/helpers/neo4j-testcontainer.ts)

### Test Configuration
- **Unit Test Setup**: [`tests/setup.ts`](packages/models/tests/setup.ts)
- **Integration Setup**: [`tests/integration-setup.ts`](packages/models/tests/integration-setup.ts)
- **UUID Mocking**: [`tests/__mocks__/uuid.ts`](packages/models/tests/__mocks__/uuid.ts)

## Success Metrics

### Before Fixes
- ❌ Only 1 test file running (`connection.test.ts`)
- ❌ TypeScript compilation errors
- ❌ Integration tests ignored

### After Fixes
- ✅ 8 test files running (1 unit + 7 integration)
- ✅ No TypeScript compilation errors
- ✅ Both unit and integration tests execute
- ✅ Sequential test execution for reliable results

## Next Steps

### 1. Add More Unit Tests
Consider adding unit tests for:
- [`repository-factory.test.ts`](packages/models/tests/unit/repository-factory.test.ts)
- [`services/aether-core-service.test.ts`](packages/models/tests/unit/services/aether-core-service.test.ts)

### 2. Enhance Integration Tests
Consider adding workflow tests:
- [`workflows/agent-deployment.test.ts`](packages/models/tests/integration/workflows/agent-deployment.test.ts)
- [`workflows/codex-versioning.test.ts`](packages/models/tests/integration/workflows/codex-versioning.test.ts)

### 3. CI/CD Integration
Ensure GitHub Actions workflow includes:
- Both unit and integration test execution
- Neo4j service container setup
- Proper test result reporting

## Conclusion

Both critical issues have been resolved:
1. **Test execution**: Now runs all tests (unit + integration) 
2. **TypeScript compilation**: Fixed interface/implementation mismatch

The test suite is now fully functional and ready for comprehensive testing of the `@starships/models` package.