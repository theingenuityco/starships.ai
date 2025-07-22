# @starships/agent-engine - Comprehensive Testing Implementation Plan

## Executive Summary

This document outlines the detailed implementation plan for achieving 80% test coverage and comprehensive validation of the agent-engine package's AI/ML functionality.

**Current State**: 15% estimated coverage, critical gaps in core components
**Target State**: 80% coverage with comprehensive AI workflow validation
**Timeline**: 3 phases, approximately 8-12 implementation iterations

---

## Phase 2: Architecture Standardization (Priority: CRITICAL)

### 2.1 File Naming Standardization
**Actions:**
- [ ] Convert `vision-loading.test.js` → `vision-loading.test.ts`
- [ ] Remove duplicate `.d.ts` files from tests directory
- [ ] Update `setup.js` → `setup.ts` consistency
- [ ] Verify all test files follow `*.test.ts` convention

**Expected Outcome**: Consistent TypeScript test architecture

### 2.2 Jest Configuration Enhancement
**Current `jest.config.js` Additions:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 30000,
  
  // NEW: Coverage Thresholds (80% requirement)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Component-specific thresholds
    './src/first-officer/TaskExecutor.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/memory/langchain-memory.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  
  // NEW: AI/ML Testing Enhancements
  globalSetup: '<rootDir>/tests/global-setup.ts',
  globalTeardown: '<rootDir>/tests/global-teardown.ts',
  maxWorkers: 2, // Limit for AI operations
  slowTestThreshold: 10, // AI tests may be slower
}
```

### 2.3 Enhanced Test Setup
**New `tests/global-setup.ts`:**
```typescript
// Mock external AI services
process.env.OPENAI_API_KEY = 'test-key';
process.env.DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
process.env.FAISS_INDEX_PATH = './tests/fixtures/test_faiss_index';

// Create test data directories
import * as fs from 'fs';
import * as path from 'path';

export default async () => {
  const testDataDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(testDataDir, { recursive: true });
  
  console.log('🔧 Global test setup completed');
};
```

---

## Phase 3: Comprehensive Test Implementation

### 3.1 TaskExecutor.ts - Critical Priority Tests (Target: 85% Coverage)

**Test File**: `tests/unit/task-executor.test.ts`

#### 3.1.1 Core Execution Tests
```typescript
describe('TaskExecutor', () => {
  describe('Task Execution Orchestration', () => {
    it('should execute single task with proper timeout handling', async () => {
      // Test: Basic task execution with timeout validation
      // Validates: executeTasks(), timeout handling, completion notification
    });

    it('should execute parallel tasks with proper coordination', async () => {
      // Test: Multiple independent tasks executed in parallel
      // Validates: Parallel execution, progress monitoring, completion order
    });

    it('should handle task dependencies correctly', async () => {
      // Test: Sequential execution based on task dependencies
      // Validates: Dependency resolution, execution ordering, completion blocking
    });

    it('should manage execution plan creation and optimization', async () => {
      // Test: createExecutionPlan() logic
      // Validates: Agent-task mapping, workload distribution, optimization
    });
  });

  describe('Progress Monitoring', () => {
    it('should emit progress updates during task execution', async () => {
      // Test: RxJS observable progress streams
      // Validates: Progress calculation, periodic updates, completion detection
    });

    it('should calculate accurate progress estimates', async () => {
      // Test: Progress calculation algorithms
      // Validates: Time-based estimation, completion percentage, ETA calculation
    });

    it('should handle progress monitoring failures gracefully', async () => {
      // Test: Error resilience in progress monitoring
      // Validates: Error isolation, continued execution, fallback mechanisms
    });
  });

  describe('Error Handling & Retry Logic', () => {
    it('should retry failed tasks within configured limits', async () => {
      // Test: Retry mechanism with exponential backoff
      // Validates: Retry counting, backoff intervals, final failure handling
    });

    it('should handle timeout scenarios correctly', async () => {
      // Test: Task timeout handling
      // Validates: Timeout detection, cleanup, error propagation
    });

    it('should isolate task failures from other executions', async () => {
      // Test: Error isolation in parallel execution
      // Validates: Failure isolation, continued execution, partial success handling
    });
  });

  describe('Memory & Resource Management', () => {
    it('should clean up execution resources properly', async () => {
      // Test: Resource cleanup after task completion
      // Validates: Memory cleanup, observable cleanup, map clearing
    });

    it('should handle memory pressure during large executions', async () => {
      // Test: Resource management under load
      // Validates: Memory limits, execution throttling, cleanup timing
    });
  });
});
```

#### 3.1.2 Integration Tests
**Test File**: `tests/integration/task-executor-integration.test.ts`
```typescript
describe('TaskExecutor Integration', () => {
  it('should integrate with RepositoryFactory for task updates', async () => {
    // Test: Database integration for task status updates
  });

  it('should integrate with chat system for agent communication', async () => {
    // Test: Agent communication through chat interface
  });

  it('should handle database failures gracefully during execution', async () => {
    // Test: Database failure resilience
  });
});
```

### 3.2 LangChainMemoryStore.ts - Memory Management Tests (Target: 80% Coverage)

**Test File**: `tests/unit/langchain-memory.test.ts`

#### 3.2.1 Vector Store Operations
```typescript
describe('LangChainMemoryStore', () => {
  describe('Vector Store Initialization', () => {
    it('should initialize FAISS index from existing file', async () => {
      // Test: Loading existing FAISS index
      // Validates: File system operations, index loading, error handling
    });

    it('should create new FAISS index when none exists', async () => {
      // Test: New index creation
      // Validates: Index creation, initial document seeding, persistence
    });

    it('should fallback to in-memory store on initialization failure', async () => {
      // Test: Fallback mechanism for initialization failures
      // Validates: Error resilience, fallback implementation, functionality preservation
    });
  });

  describe('Semantic Search Operations', () => {
    it('should perform accurate similarity search with scoring', async () => {
      // Test: Vector similarity search accuracy
      // Validates: Embedding generation, similarity scoring, relevance filtering
    });

    it('should filter search results by session and relevance', async () => {
      // Test: Search result filtering
      // Validates: Session isolation, relevance thresholds, result ordering
    });

    it('should handle search failures gracefully', async () => {
      // Test: Search error handling
      // Validates: Error isolation, fallback responses, system stability
    });
  });

  describe('Memory Persistence', () => {
    it('should save and restore sessions correctly', async () => {
      // Test: Session persistence lifecycle
      // Validates: Save operations, load operations, data integrity
    });

    it('should handle file system errors during persistence', async () => {
      // Test: File system error resilience
      // Validates: Error handling, partial failure recovery, data consistency
    });

    it('should clean up persistent data on session clear', async () => {
      // Test: Cleanup operations
      // Validates: File deletion, memory cleanup, index updates
    });
  });

  describe('Performance & Memory Management', () => {
    it('should handle large memory stores efficiently', async () => {
      // Test: Performance under load
      // Validates: Memory usage, operation speed, resource management
    });

    it('should prevent memory leaks during extended usage', async () => {
      // Test: Memory leak prevention
      // Validates: Resource cleanup, garbage collection, memory stability
    });
  });
});
```

#### 3.2.2 Performance Benchmarks
**Test File**: `tests/performance/memory-benchmarks.test.ts`
```typescript
describe('Memory Performance Benchmarks', () => {
  it('should maintain search response times under 500ms', async () => {
    // Benchmark: Search performance validation
  });

  it('should handle concurrent access without degradation', async () => {
    // Benchmark: Concurrent operation performance
  });

  it('should maintain memory usage below defined thresholds', async () => {
    // Benchmark: Memory consumption validation
  });
});
```

### 3.3 AgentSelector.ts - Selection Algorithm Tests (Target: 80% Coverage)

**Test File**: `tests/unit/agent-selector.test.ts`

#### 3.3.1 Selection Algorithm Tests
```typescript
describe('AgentSelector', () => {
  describe('Agent Selection Logic', () => {
    it('should select agents based on skill matching algorithms', async () => {
      // Test: Skill matching algorithm accuracy
      // Validates: Keyword matching, skill scoring, selection ranking
    });

    it('should optimize task assignments using LLM enhancement', async () => {
      // Test: LLM-enhanced optimization
      // Validates: LLM integration, response parsing, assignment quality
    });

    it('should balance workload across selected agents', async () => {
      // Test: Workload balancing algorithms
      // Validates: Load distribution, capacity management, optimization
    });

    it('should handle edge cases in agent availability', async () => {
      // Test: Availability management
      // Validates: Overload detection, availability tracking, fallback selection
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should fall back to rule-based selection on LLM failures', async () => {
      // Test: LLM failure fallback
      // Validates: Error detection, fallback activation, selection quality
    });

    it('should handle scenarios with no suitable agents', async () => {
      // Test: No-match scenarios
      // Validates: Error handling, informative failures, graceful degradation
    });
  });
});
```

### 3.4 FirstOfficerAgent.ts - Workflow Integration Tests (Target: 80% Coverage)

**Test File**: `tests/integration/first-officer-workflow.test.ts`

#### 3.4.1 Workflow Execution Tests
```typescript
describe('FirstOfficerAgent Workflow', () => {
  describe('Expedition Orchestration', () => {
    it('should execute complete expedition workflow end-to-end', async () => {
      // Test: Full workflow execution
      // Validates: All workflow phases, state transitions, result generation
    });

    it('should handle workflow failures and recovery', async () => {
      // Test: Workflow error handling
      // Validates: Phase failure recovery, state consistency, error propagation
    });

    it('should manage workflow state transitions correctly', async () => {
      // Test: State management
      // Validates: Phase transitions, state persistence, consistency
    });
  });

  describe('LLM Integration', () => {
    it('should integrate with ProviderFactory for LLM operations', async () => {
      // Test: LLM provider integration
      // Validates: Provider selection, request formatting, response handling
    });

    it('should parse and validate LLM responses correctly', async () => {
      // Test: LLM response processing
      // Validates: JSON parsing, validation, error handling
    });

    it('should handle LLM failures with appropriate fallbacks', async () => {
      // Test: LLM failure resilience
      // Validates: Failure detection, fallback mechanisms, quality preservation
    });
  });
});
```

---

## Testing Strategy & Implementation Sequence

### Implementation Priority Queue
1. **Phase 2.1** - File naming standardization (1-2 hours)
2. **Phase 2.2** - Jest configuration enhancement (1-2 hours)
3. **Phase 3.1** - TaskExecutor core tests (8-12 hours)
4. **Phase 3.2** - Memory store validation tests (6-10 hours)
5. **Phase 3.3** - Agent selection tests (4-6 hours)
6. **Phase 3.4** - Workflow integration tests (6-8 hours)
7. **Performance benchmarks** - All components (4-6 hours)

### Testing Methodologies
- **Unit Tests**: Jest with comprehensive mocking
- **Integration Tests**: Real component interaction with test data
- **Performance Tests**: Benchmarking with timing and memory validation
- **AI/ML Tests**: Mocked external services, real internal logic validation

### Mock Strategy
- **External Services**: OpenAI API, FAISS operations, file system
- **Internal Dependencies**: Repository patterns, database operations
- **AI Responses**: Predefined response fixtures for consistent testing

### Success Criteria
- [ ] 80% line, branch, function, and statement coverage
- [ ] All critical AI workflows tested with realistic scenarios
- [ ] Performance benchmarks established and validated
- [ ] Error handling tested for all failure modes
- [ ] Memory management validated against leaks and efficiency
- [ ] LangChain integration tested with proper mocking

---

## Risk Mitigation

### High-Risk Areas
1. **RxJS Observable Streams** - Complex async testing with marble diagrams
2. **FAISS Vector Operations** - External dependency mocking and validation
3. **LLM Integration** - Response parsing and error handling complexity
4. **Memory Management** - Leak detection and performance validation

### Mitigation Strategies
- Comprehensive test fixtures for AI responses
- Isolated test environments for vector operations
- Performance monitoring integration
- Automated memory leak detection in CI

This plan provides the detailed roadmap for achieving comprehensive test coverage while maintaining focus on AI/ML specific validation requirements.