# Expedition Workflow - LangGraph Implementation

This directory contains the LangGraph StateGraph implementation for the expedition workflow system.

## Architecture Overview

The expedition workflow is implemented using LangGraph's StateGraph pattern, which provides:
- Type-safe state management
- Declarative workflow definition
- Built-in error handling and recovery
- Support for conditional branching
- State persistence and resumption

## Core Components

### 1. ExpeditionWorkflow.ts
The main workflow definition using LangGraph StateGraph:
- Defines the state schema using Annotations
- Creates workflow nodes for each phase
- Implements conditional routing logic
- Handles state transitions

### 2. WorkflowOrchestrator.ts
Enhanced orchestration layer that provides:
- Automatic state checkpointing
- Progress tracking and real-time updates
- Error recovery and retry logic
- Workflow resumption from checkpoints

## Workflow Phases

The expedition workflow consists of the following phases:

1. **Initializing** → **Analyzing**
   - Analyze the expedition objective
   - Determine complexity and requirements

2. **Analyzing** → **Plan Tasks**
   - Break down objective into executable tasks
   - Create task dependencies and timeline

3. **Plan Tasks** → **Select/Assign Agents**
   - If pre-selected agents exist, skip to assignment
   - Otherwise, select agents based on requirements

4. **Assign Tasks** → **Execute**
   - Assign tasks to selected agents
   - Begin parallel task execution

5. **Execute** → **Monitor Progress**
   - Track task execution in real-time
   - Handle intermediate results

6. **Monitor** → **Quality Check**
   - Validate completed tasks
   - Determine if retry is needed

7. **Quality Check** → **Synthesize/Retry**
   - If quality passes, synthesize results
   - If quality fails, retry with improvements

8. **Synthesize** → **Complete**
   - Generate final expedition report
   - Mark expedition as completed

## State Management

The workflow state includes:
```typescript
interface ExpeditionState {
  // Core identifiers
  expeditionId: string;
  userId: string;
  starshipId: string;
  
  // Workflow tracking
  currentPhase: WorkflowPhase;
  requirements: string;
  
  // Task management
  taskBreakdown: TaskBreakdown[];
  selectedAgents: AgentAssignment[];
  activeExecutions: TaskExecution[];
  completedTasks: CompletedTask[];
  
  // Quality and errors
  qualityChecks: QualityCheck[];
  errors: string[];
  retryCount: number;
  
  // Results
  finalResult?: string;
}
```

## Usage Example

```typescript
import { FirstOfficerAgent } from '../FirstOfficerAgent';
import { WorkflowOrchestrator } from './WorkflowOrchestrator';

// Initialize First Officer with selected agents
const firstOfficer = new FirstOfficerAgent(
  starshipId,
  memoryStore,
  { 
    maxRetries: 3,
    qualityThreshold: 80,
    enableParallelExecution: true 
  },
  ['agent-1', 'agent-2', 'agent-3'] // Pre-selected agents
);

// Start expedition
const result = await firstOfficer.startExpedition(
  expeditionId,
  userId,
  'Analyze market trends and create report'
);

// Resume interrupted expedition
const resumedResult = await firstOfficer.resumeExpedition(expeditionId);
```

## Error Handling

The workflow includes comprehensive error handling:

1. **Node-level errors**: Each node catches and reports errors
2. **Retry logic**: Failed tasks can be retried up to maxRetries
3. **State recovery**: Workflow can resume from last checkpoint
4. **Graceful degradation**: Partial results are preserved

## Real-time Updates

The workflow emits progress updates through:
- WebSocket events for UI updates
- Progress callbacks for monitoring
- State persistence for recovery

## Configuration

Key configuration options:
```typescript
interface FirstOfficerConfig {
  maxRetries: number;           // Max retry attempts per task
  qualityThreshold: number;     // Min quality score (0-100)
  timeoutMinutes: number;       // Overall expedition timeout
  enableParallelExecution: boolean;  // Allow parallel tasks
  autoEscalation: boolean;      // Auto-escalate on failures
}
```

## Best Practices

1. **Always provide selected agents** - Auto-selection has been removed
2. **Monitor progress** - Use progress callbacks for real-time updates
3. **Handle errors gracefully** - Check expedition status after completion
4. **Enable checkpointing** - For long-running expeditions
5. **Set appropriate timeouts** - Prevent indefinite execution

## Troubleshooting

Common issues and solutions:

1. **Workflow stuck in phase**
   - Check for infinite loops in node logic
   - Verify state transitions are updating currentPhase

2. **State persistence fails**
   - Ensure database connection is active
   - Check for serialization issues in state

3. **Agent selection fails**
   - Verify agents are deployed to starship
   - Check agent availability and skills

4. **Quality checks fail repeatedly**
   - Lower quality threshold if too strict
   - Review task requirements clarity