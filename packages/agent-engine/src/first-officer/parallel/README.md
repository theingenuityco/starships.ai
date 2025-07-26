# Parallel Task Execution Framework

A comprehensive parallel execution system for agent tasks that integrates with LangGraph workflows and provides real-time WebSocket updates.

## Overview

The Parallel Task Execution Framework enables efficient concurrent execution of multiple agent tasks while managing dependencies, resources, and providing real-time progress updates. It's designed to work seamlessly with the First Officer agent orchestration system.

## Key Features

### 1. **Concurrent Task Execution**
- Execute multiple agent tasks simultaneously
- Automatic dependency resolution and ordering
- Configurable concurrency limits
- Task grouping for optimal parallelism

### 2. **Resource Management**
- Dynamic resource allocation and tracking
- Agent workload balancing
- Resource utilization monitoring
- Automatic resource optimization

### 3. **Real-time Progress Updates**
- WebSocket-based event emission
- Task-level progress tracking
- Expedition-level progress aggregation
- Performance metrics streaming

### 4. **Failure Isolation**
- Individual task failure handling
- Retry mechanisms with exponential backoff
- Partial result recovery
- Graceful degradation

### 5. **Performance Monitoring**
- Real-time performance metrics
- Bottleneck detection
- Optimization suggestions
- Historical performance tracking

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Workflow                         │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │   Analyze   │→ │    Plan     │→ │  Select Agents   │    │
│  │  Objective  │  │   Tasks     │  │                  │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
│                            ↓                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          Parallel Execution Framework                │    │
│  │                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │    │
│  │  │ Dependency  │→ │   Task      │→ │  Resource  │  │    │
│  │  │  Resolver   │  │ Scheduler   │  │  Manager   │  │    │
│  │  └─────────────┘  └─────────────┘  └────────────┘  │    │
│  │         ↓                ↓                ↓         │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │         Parallel Task Executor               │  │    │
│  │  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐   │  │    │
│  │  │  │Task 1│  │Task 2│  │Task 3│  │Task N│   │  │    │
│  │  │  │Agent A│  │Agent B│  │Agent C│  │Agent X│   │  │    │
│  │  │  └──────┘  └──────┘  └──────┘  └──────┘   │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │         ↓                                           │    │
│  │  ┌─────────────┐  ┌──────────────┐                │    │
│  │  │ Performance │  │  WebSocket   │                │    │
│  │  │  Monitor    │  │   Emitter    │                │    │
│  │  └─────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────┘    │
│                            ↓                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │
│  │   Quality    │→ │ Synthesize  │→ │    Complete      │    │
│  │    Check     │  │  Results    │  │                  │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Basic Integration with LangGraph

```typescript
import { LangGraphWorkflow } from '../LangGraphWorkflow';
import { 
  createParallelExecutionHandler,
  createExecutionRoutingHandler 
} from './parallel/ParallelExecutionNodeHandler';
import { WebSocketEventEmitter } from './parallel/WebSocketEventEmitter';

// Create WebSocket emitter (connect to your Socket.IO server)
const wsEmitter = new WebSocketEventEmitter(socketServer);

// Create node handlers
const nodeHandlers = new Map([
  // ... other handlers ...
  
  // Parallel execution handler
  ['execute_parallel', createParallelExecutionHandler(config, taskExecutor, wsEmitter)],
  
  // Sequential execution handler (fallback)
  ['execute_sequential', createSequentialExecutionHandler(config, taskExecutor)]
]);

// Create routing handlers
const routingHandlers = new Map([
  // ... other routing handlers ...
  
  // Execution routing (decides parallel vs sequential)
  ['routeAfterPersistence', createExecutionRoutingHandler(config)]
]);

// Build workflow
const workflow = LangGraphWorkflow.createEnhancedWorkflow(
  config,
  nodeHandlers,
  routingHandlers
);
```

### Direct Usage of Parallel Framework

```typescript
import { ParallelExecutionFramework } from './parallel';
import { WebSocketEventEmitter } from './parallel';

// Create framework instance
const wsEmitter = new WebSocketEventEmitter();
const parallelFramework = new ParallelExecutionFramework(config, wsEmitter);

// Execute tasks in parallel
const execution$ = await parallelFramework.executeParallel(
  tasks,
  agentAssignments,
  expeditionId,
  userId,
  {
    maxConcurrentTasks: 5,
    taskTimeout: 300000, // 5 minutes
    retryLimit: 3,
    enableResourceOptimization: true,
    enableAdaptiveScheduling: true,
    enableFailureIsolation: true
  }
);

// Subscribe to completion events
execution$.subscribe({
  next: (completed) => {
    console.log(`Task ${completed.taskId} completed by ${completed.agentId}`);
  },
  error: (error) => {
    console.error('Execution failed:', error);
  },
  complete: () => {
    console.log('All tasks completed');
  }
});

// Monitor execution state
parallelFramework.getExecutionState().subscribe(state => {
  if (state) {
    console.log(`Progress: ${state.progress}%`);
    console.log(`Throughput: ${state.throughput} tasks/min`);
  }
});
```

### WebSocket Event Handling

```typescript
// Client-side event handling
socket.on('expedition:progress', (data) => {
  updateProgressBar(data.progress);
  updateTaskCount(data.completedTasks, data.totalTasks);
});

socket.on('task:start', (data) => {
  showTaskStartNotification(data.taskId, data.agentId);
});

socket.on('task:complete', (data) => {
  showTaskCompleteNotification(data.taskId);
  updateTaskResult(data.taskId, data.result);
});

socket.on('performance:bottleneck', (data) => {
  showPerformanceWarning(data.type, data.details);
});
```

## Configuration

### Parallel Execution Options

```typescript
interface ParallelExecutionOptions {
  // Maximum number of tasks to execute concurrently
  maxConcurrentTasks?: number; // Default: 5
  
  // Timeout for individual tasks (milliseconds)
  taskTimeout?: number; // Default: 300000 (5 minutes)
  
  // Number of retry attempts for failed tasks
  retryLimit?: number; // Default: 3
  
  // Base delay for retry backoff (milliseconds)
  retryDelay?: number; // Default: 1000
  
  // Interval for progress updates (milliseconds)
  progressUpdateInterval?: number; // Default: 5000
  
  // Enable dynamic resource optimization
  enableResourceOptimization?: boolean; // Default: true
  
  // Enable adaptive scheduling based on performance
  enableAdaptiveScheduling?: boolean; // Default: true
  
  // Enable failure isolation (continue on task failure)
  enableFailureIsolation?: boolean; // Default: true
}
```

### First Officer Config

```typescript
interface FirstOfficerConfig {
  // Maximum retry attempts
  maxRetries: number;
  
  // Quality threshold for task acceptance
  qualityThreshold: number;
  
  // Timeout for tasks (minutes)
  timeoutMinutes: number;
  
  // Enable parallel execution
  enableParallelExecution: boolean;
  
  // Other configuration options...
}
```

## Performance Optimization

### Dependency Resolution

The framework automatically analyzes task dependencies to identify opportunities for parallel execution:

```typescript
// Tasks with dependencies
const tasks = [
  { id: 'A', dependencies: [] },
  { id: 'B', dependencies: ['A'] },
  { id: 'C', dependencies: ['A'] },
  { id: 'D', dependencies: ['B', 'C'] }
];

// Execution groups identified:
// Group 1: [A] (no dependencies)
// Group 2: [B, C] (both depend only on A, can run in parallel)
// Group 3: [D] (depends on B and C)
```

### Resource Management

The framework manages resources to prevent overload:

```typescript
// Resource allocation example
const resourceManager = new ResourceManager();
await resourceManager.initializePool(agentAssignments);

// Automatic workload balancing
const rebalancing = resourceManager.rebalanceLoad();
// Moves tasks from overloaded agents to underutilized ones

// Get recommendations
const recommendations = resourceManager.getRecommendations();
// Suggests scaling up/down based on utilization
```

### Performance Monitoring

Real-time performance tracking and optimization:

```typescript
// Get performance metrics
const metrics = parallelFramework.getExecutionMetrics();
console.log('Current metrics:', metrics.current);
console.log('Trends:', metrics.trends);

// Performance report
const report = performanceMonitor.getPerformanceReport();
console.log('Average throughput:', report.averageThroughput);
console.log('Bottlenecks:', report.bottlenecks);
console.log('Recommendations:', report.recommendations);
```

## WebSocket Events

### Emitted Events

| Event | Description | Payload |
|-------|-------------|---------|
| `expedition:progress` | Overall expedition progress | `{ progress, completedTasks, totalTasks, throughput }` |
| `taskGroup:start` | Task group execution started | `{ groupId, taskCount, maxConcurrency }` |
| `taskGroup:complete` | Task group execution completed | `{ groupId, duration }` |
| `task:start` | Individual task started | `{ taskId, agentId, attempt }` |
| `task:progress` | Task progress update | `{ taskId, progress }` |
| `task:complete` | Task completed successfully | `{ taskId, result, duration }` |
| `task:failed` | Task execution failed | `{ taskId, error }` |
| `task:retry` | Task retry attempt | `{ taskId, attempt, delay }` |
| `agent:activity` | Agent activity update | `{ agentId, activity, taskId }` |
| `resource:allocated` | Resources allocated | `{ taskId, resources }` |
| `performance:bottleneck` | Performance issue detected | `{ type, details }` |

## Error Handling

### Task-Level Errors

Individual task failures are isolated and don't affect other tasks:

```typescript
// With failure isolation enabled
{
  enableFailureIsolation: true
}

// Task A fails -> Task B and C continue
// Failed task returns partial result with error details
```

### Retry Mechanism

Intelligent retry with exponential backoff:

```typescript
// Retry configuration
{
  retryLimit: 3,
  retryDelay: 1000 // Base delay
}

// Retry delays: 1s, 2s, 4s (exponential backoff)
// Priority tasks have reduced delays
```

### Recovery Strategies

```typescript
// Graceful degradation
if (criticalTaskFailed) {
  // Continue with reduced functionality
  // Return partial results
  // Log issues for review
}

// State recovery
const checkpoint = await workflowStatePersistence.recoverState(expeditionId);
// Resume from last known good state
```

## Best Practices

1. **Task Granularity**: Break large tasks into smaller, independent units for better parallelism
2. **Dependency Management**: Minimize dependencies between tasks when possible
3. **Resource Allocation**: Monitor resource utilization and adjust concurrency accordingly
4. **Error Handling**: Use failure isolation for non-critical tasks
5. **Performance Monitoring**: Act on bottleneck detections and optimization suggestions
6. **WebSocket Events**: Subscribe to relevant events for real-time UI updates

## Troubleshooting

### Common Issues

1. **Low Throughput**
   - Check resource utilization
   - Increase concurrent task limit
   - Review task dependencies

2. **High Error Rate**
   - Check agent capabilities
   - Review task requirements
   - Increase retry limits

3. **Resource Saturation**
   - Reduce concurrent tasks
   - Optimize resource allocation
   - Scale up available agents

4. **WebSocket Connection Issues**
   - Verify socket server configuration
   - Check network connectivity
   - Review event subscriptions

## Future Enhancements

- **Predictive Scheduling**: ML-based task duration prediction
- **Auto-scaling**: Dynamic agent provisioning based on load
- **Task Prioritization**: Dynamic priority adjustment based on business rules
- **Distributed Execution**: Multi-node task execution
- **Advanced Analytics**: Detailed performance analytics and visualization