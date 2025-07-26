# Enhanced First Officer Agent V2 - Integration Guide

## Overview

The Enhanced First Officer Agent V2 (`EnhancedFirstOfficerAgentV2`) extends the base First Officer capabilities with:

1. **Vision Parsing** - Automatically extracts actionable requirements from expedition vision
2. **Parallel Task Execution** - Executes tasks concurrently with dependency management
3. **Real-time WebSocket Updates** - Provides live progress updates via Socket.IO
4. **Enhanced Quality Assurance** - Intelligent retry logic with agent reassignment
5. **Resource Optimization** - Dynamic resource allocation and load balancing

## Key Features

### 1. Vision-Based Requirement Extraction

The agent automatically parses the starship's vision to extract:
- Goals aligned with the expedition objective
- Constraints to be respected
- Success criteria for validation
- Priority and complexity assessment

```typescript
// Vision requirements are automatically extracted and integrated
const visionRequirements = await parseVisionRequirements(starshipId, objective);
```

### 2. Parallel Execution Framework

Tasks are executed in parallel with:
- Dependency graph analysis
- Optimal concurrency calculation
- Resource pooling and allocation
- Failure isolation
- Adaptive scheduling

```typescript
// Parallel execution with real-time monitoring
const execution$ = await parallelExecutor.executeParallel(
  tasks,
  assignments,
  expeditionId,
  userId,
  options
);
```

### 3. WebSocket Event Architecture

Real-time events emitted during execution:

**Expedition Events:**
- `expedition:vision-parsed` - Vision requirements extracted
- `expedition:execution-start` - Parallel execution initiated
- `expedition:progress` - Overall progress updates
- `expedition:detailed-progress` - Metrics and resource utilization

**Task Events:**
- `task:start` - Task execution started
- `task:progress` - Task progress update
- `task:complete` - Task completed successfully
- `task:failed` - Task execution failed
- `task:retry` - Task retry initiated
- `task:reassigned` - Task reassigned to different agent

**Performance Events:**
- `performance:bottleneck` - Performance issue detected
- `performance:optimization` - Optimization applied

### 4. Quality Assurance & Retry Logic

Enhanced quality checks with:
- Automatic quality scoring
- Intelligent retry orchestration
- Alternative agent selection for failures
- Escalation to specialist agents

## Integration Steps

### 1. Initialize the Enhanced First Officer

```typescript
import { EnhancedFirstOfficerAgentV2 } from '@starships/agent-engine';
import { WebSocketEventEmitter } from '@starships/agent-engine';
import { LangChainMemoryStore } from '@starships/agent-engine';

// Initialize dependencies
const memoryStore = new LangChainMemoryStore({
  sessionId: 'expedition-session',
  maxMemorySize: 100
});

const wsEmitter = new WebSocketEventEmitter();
wsEmitter.setSocketServer(socketIOServer); // Your Socket.IO server

// Configure enhanced features
const config = {
  enableVisionParsing: true,
  enableParallelExecution: true,
  autoEscalation: true,
  parallelExecutionOptions: {
    maxConcurrentTasks: 5,
    taskTimeout: 300000, // 5 minutes
    enableResourceOptimization: true,
    enableAdaptiveScheduling: true
  },
  wsEventEmitter: wsEmitter
};

// Initialize with pre-selected agents (REQUIRED)
const selectedAgentIds = ['agent-001', 'agent-002', 'agent-003'];

const firstOfficer = new EnhancedFirstOfficerAgentV2(
  starshipId,
  memoryStore,
  config,
  selectedAgentIds
);
```

### 2. Start an Expedition

```typescript
// Start expedition with vision parsing and parallel execution
const result = await firstOfficer.startExpedition(
  expeditionId,
  userId,
  objective
);
```

### 3. Monitor Real-time Progress

```typescript
// Subscribe to progress events
wsEmitter.on('expedition:progress', (data) => {
  console.log(`Progress: ${data.progress}% complete`);
  // Update UI progress bar
});

wsEmitter.on('task:complete', (data) => {
  console.log(`Task ${data.taskId} completed`);
  // Update task list UI
});
```

### 4. Handle Quality Failures

```typescript
// Reassign failed task to specialist
await firstOfficer.reassignTask(
  expeditionId,
  failedTaskId,
  specialistAgentId,
  'Quality check failed - escalating to specialist'
);
```

### 5. Get Execution Metrics

```typescript
// Get detailed performance metrics
const metrics = await firstOfficer.getExecutionMetrics(expeditionId);
console.log('Execution metrics:', {
  activeTaskCount: metrics.activeTaskCount,
  throughput: metrics.throughput,
  resourceUtilization: metrics.resourceUtilization
});
```

## Configuration Options

### Enhanced Configuration

```typescript
interface EnhancedFirstOfficerConfig {
  // Base configuration
  maxRetries: number;
  qualityThreshold: number;
  timeoutMinutes: number;
  requireUserApproval: boolean;
  enableParallelExecution: boolean;
  autoEscalation: boolean;
  
  // Enhanced features
  enableVisionParsing: boolean;
  
  // Parallel execution options
  parallelExecutionOptions?: {
    maxConcurrentTasks: number;      // Max tasks running simultaneously
    taskTimeout: number;             // Individual task timeout (ms)
    retryDelay?: number;            // Delay between retries (ms)
    progressUpdateInterval?: number; // Progress update frequency (ms)
    enableResourceOptimization?: boolean;
    enableAdaptiveScheduling?: boolean;
    enableFailureIsolation?: boolean;
  };
  
  // WebSocket emitter
  wsEventEmitter?: WebSocketEventEmitter;
}
```

## Architecture

### Component Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                    EnhancedFirstOfficerAgentV2                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │Vision Parser │  │ First Officer   │  │Parallel Executor │  │
│  │              │  │ (Base Agent)    │  │                  │  │
│  └──────┬───────┘  └────────┬────────┘  └────────┬─────────┘  │
│         │                    │                     │            │
│         ▼                    ▼                     ▼            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                 LangGraph Workflow Engine                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐            │
│         ▼                    ▼                    ▼            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ WebSocket    │  │ Resource     │  │ Performance      │    │
│  │ Emitter      │  │ Manager      │  │ Monitor          │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Execution Flow

1. **Vision Parsing** → Extract requirements from starship vision
2. **Objective Analysis** → Analyze complexity and requirements
3. **Task Planning** → Create task breakdown with dependencies
4. **Agent Selection** → Use pre-selected agents for assignment
5. **Parallel Execution** → Execute tasks concurrently
6. **Progress Monitoring** → Real-time updates via WebSocket
7. **Quality Assurance** → Validate results and retry if needed
8. **Result Synthesis** → Combine results into final output

## Best Practices

1. **Always provide pre-selected agents** - The enhanced agent requires agents to be selected during expedition creation

2. **Configure WebSocket server** - Set up Socket.IO server for real-time updates in production

3. **Set appropriate timeouts** - Configure task timeouts based on expected execution time

4. **Monitor resource utilization** - Use metrics to optimize concurrency settings

5. **Handle failures gracefully** - Implement retry logic and agent reassignment for critical tasks

## Example Use Cases

### 1. Complex Software Development

```typescript
const objective = "Build a microservices architecture with API gateway, service mesh, and monitoring";
// Will parse vision for architectural principles
// Execute development tasks in parallel
// Monitor progress in real-time
```

### 2. Data Analysis Pipeline

```typescript
const objective = "Create end-to-end data pipeline with ETL, analysis, and visualization";
// Parse vision for data governance requirements
// Parallel execution of data processing tasks
// Quality checks on data accuracy
```

### 3. Research Project

```typescript
const objective = "Conduct market research and competitive analysis for new product";
// Extract research goals from vision
// Coordinate multiple research agents
// Synthesize findings with quality validation
```

## Troubleshooting

### Common Issues

1. **No agents selected**
   - Error: "FirstOfficerAgent requires at least one agent to be selected"
   - Solution: Provide selectedAgentIds during initialization

2. **WebSocket events not received**
   - Check Socket.IO server configuration
   - Ensure wsEmitter.setSocketServer() is called

3. **Tasks timing out**
   - Increase taskTimeout in parallelExecutionOptions
   - Check agent availability and resource allocation

4. **Low throughput**
   - Increase maxConcurrentTasks
   - Enable adaptive scheduling
   - Review task dependencies for bottlenecks

## API Reference

See the TypeScript interfaces and JSDoc comments in:
- `/src/first-officer/EnhancedFirstOfficerAgentV2.ts`
- `/src/first-officer/parallel/ParallelExecutionFramework.ts`
- `/src/first-officer/parallel/WebSocketEventEmitter.ts`