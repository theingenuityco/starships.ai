# First Officer Agent - Expedition Orchestration System

The First Officer Agent is the core orchestration engine for the Expedition Orchestration System, implementing hierarchical coordination with LangGraph workflows, parallel task execution, and quality validation.

## Overview

The First Officer Agent coordinates crew members (agents) to complete complex expeditions by:

1. **Analyzing objectives** - Understanding requirements and complexity
2. **Planning tasks** - Breaking down objectives into executable tasks
3. **Selecting agents** - Choosing optimal crew members using rule-based + LLM selection
4. **Assigning tasks** - Distributing work with clear instructions
5. **Monitoring progress** - Tracking execution with parallel processing support
6. **Synthesizing results** - Combining individual results into final expedition outcome

## Architecture

### Core Components

- **FirstOfficerAgent** - Main orchestration class with workflow management
- **AgentSelector** - Rule-based + LLM agent selection logic
- **TaskExecutor** - Parallel task execution and monitoring
- **QualityValidator** - Result validation and retry logic
- **ChatCoordinator** - Hybrid integration with existing chat system

### Workflow Phases

1. `initializing` - Setting up expedition
2. `analyzing` - Objective analysis and complexity assessment
3. `decomposing` - Task breakdown and planning
4. `assigning` - Agent selection and task assignment
5. `coordinating` - Task execution and progress monitoring
6. `synthesizing` - Result compilation and quality validation
7. `completed` - Expedition finished successfully
8. `failed` - Expedition failed or cancelled

## Usage

### Basic Usage

```typescript
import { FirstOfficerAgent, LangChainMemoryStore } from '@starships/agent-engine';

// Initialize memory store
const memoryStore = new LangChainMemoryStore();

// Create First Officer Agent
const firstOfficer = new FirstOfficerAgent(
  'starship-id',
  memoryStore,
  {
    maxRetries: 3,
    qualityThreshold: 70,
    timeoutMinutes: 60,
    enableParallelExecution: true
  }
);

// Start expedition
const result = await firstOfficer.startExpedition(
  'expedition-id',
  'user-id',
  'Create a comprehensive market analysis report for Q4 2024'
);

console.log('Expedition completed:', result);
```

### Configuration Options

```typescript
interface FirstOfficerConfig {
  maxRetries: number;           // Maximum retry attempts for failed tasks
  qualityThreshold: number;     // Minimum quality score (0-100)
  timeoutMinutes: number;       // Task execution timeout
  requireUserApproval: boolean; // Require user approval for critical decisions
  enableParallelExecution: boolean; // Enable parallel task execution
  autoEscalation: boolean;      // Auto-escalate to user when issues occur
}
```

### Agent Selection

The AgentSelector uses a hybrid approach:

1. **Rule-based filtering** - Keyword matching and skill assessment
2. **LLM enhancement** - Intelligent assignment optimization
3. **Workload balancing** - Distribute tasks evenly across agents

```typescript
const agentSelector = new AgentSelector('starship-id');
await agentSelector.initialize();

const assignments = await agentSelector.selectAgents(tasks, {
  requiredSkills: ['analysis', 'research', 'writing'],
  preferredSkills: ['finance', 'market-research'],
  maxAgents: 3,
  workloadBalance: true
});
```

### Quality Validation

The QualityValidator ensures task results meet standards:

```typescript
const qualityValidator = new QualityValidator(config);

const qualityCheck = await qualityValidator.validateTaskResult(
  task,
  result,
  agentId
);

if (!qualityCheck.approved && qualityValidator.shouldRetryTask(task.id)) {
  // Retry with feedback
  const feedback = qualityValidator.getRetryFeedback(task.id);
  // ... retry logic
}
```

### Chat Integration

The ChatCoordinator provides seamless integration with the existing chat system:

```typescript
const chatCoordinator = new ChatCoordinator(
  memoryStore,
  expeditionId,
  userId,
  starshipId
);

// Send coordination messages
await chatCoordinator.sendPhaseUpdate(currentPhase, nextPhase, progress);
await chatCoordinator.sendTaskAssignment(agentName, taskTitle, description);
await chatCoordinator.sendProgressReport(progress);

// Handle user responses
const response = await chatCoordinator.handleUserResponse(userMessage);
```

## Integration Points

### Existing Systems

- **ProviderFactory** - Uses existing LLM provider infrastructure
- **Chat Function** - Integrates with existing `chat()` function
- **Memory Store** - Uses existing LangChain memory system
- **Repositories** - Integrates with expedition data persistence

### Database Integration

- **ExpeditionRepository** - Manages expedition lifecycle
- **ExpeditionTaskRepository** - Handles task CRUD operations
- **ExpeditionMessageRepository** - Stores coordination messages
- **ExpeditionResultRepository** - Manages final deliverables

## Workflow State Management

The First Officer maintains comprehensive state throughout expedition execution:

```typescript
interface FirstOfficerState {
  expeditionId: string;
  currentPhase: WorkflowPhase;
  requirements: string;
  taskBreakdown: TaskBreakdown[];
  agentAssignments: Record<string, string[]>;
  agentResults: Record<string, string>;
  finalResult?: string;
  analysis?: ObjectiveAnalysis;
  userId: string;
  starshipId: string;
  errors?: string[];
  retryCount: number;
  lastUpdated: string;
}
```

## Error Handling and Recovery

- **Automatic retries** with configurable limits
- **Quality-based retry logic** with improvement feedback
- **Escalation to user** when automatic recovery fails
- **Comprehensive error logging** and state persistence

## Real-time Updates

- **Progress monitoring** with RxJS observables
- **Chat coordination** messages for user visibility
- **WebSocket integration** ready for real-time updates
- **State persistence** for workflow recovery

## Future Enhancements

- **Full LangGraph integration** when dependency is available
- **Advanced parallel execution** with dependency management
- **Machine learning** for agent selection optimization
- **Custom workflow** definitions for different expedition types
- **Performance analytics** and optimization recommendations

## Dependencies

- `@langchain/core` - Core LangChain functionality
- `@langchain/openai` - OpenAI provider integration
- `@langchain/anthropic` - Anthropic provider integration
- `rxjs` - Reactive programming for task execution
- `@starships/models` - Database repositories
- `@starships/protocol` - Type definitions

## Notes

- The current implementation uses a simplified workflow engine
- LangGraph integration will be added when the dependency is available
- RxJS is used for task execution monitoring but may need to be made optional
- The system is designed to be highly configurable and extensible