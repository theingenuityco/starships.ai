# A1: Core Architecture Analysis

**Research Phase**: A1 - Core Architecture Research  
**Completed**: 2025-01-08  
**Files Studied**: expedition.ts, ExpeditionService.ts, FirstOfficerService.ts

## Current System Architecture

### 1. Expedition Entity Model

**Expedition Status Flow (Current):**
```
draft → planning → in-progress → completed/failed/cancelled
```

**Core Entities:**
- **Expedition**: Main container with starshipId, mission, assignedAgents, status
- **ExpeditionTask**: Individual work items with agent assignments and dependencies  
- **ExpeditionMessage**: Chat system with chain-of-thought capabilities
- **ExpeditionResult**: Final deliverables with quality assessments
- **AgentActivity**: Real-time agent activity tracking

### 2. Service Architecture (Current)

**ExpeditionService (Orchestrator):**
```
ExpeditionService
├── ExpeditionLifecycleService (CRUD operations)
├── TaskOrchestrationService (Task management)  
├── AgentCoordinationService (Agent selection/assignment)
├── ExpeditionValidationService (Validation logic)
└── FirstOfficerService (Agent coordination)
```

**Key Orchestration Flow:**
1. User creates expedition → `ExpeditionService.createExpedition()`
2. Expedition starts → `ExpeditionService.startExpedition()` 
3. Status updated to 'planning' → Calls `FirstOfficerService.startExpedition()`
4. FirstOfficer manages LangGraph workflow → Updates status to 'in-progress'
5. Execution completes → Status updated to 'completed'

### 3. FirstOfficer Agent Coordination

**Agent Management:**
- **activeAgents**: Map<expeditionId, FirstOfficerAgent>
- **memoryStores**: Map<expeditionId, LangChainMemoryStore>
- **MCP-enabled agents**: Created with WebSocket callbacks for real-time updates

**Memory & State Management:**
- LangChainMemoryStore per expedition for context persistence
- Memory keys: `first-officer-{userId}-{expeditionId}`
- State persisted across workflow phases

**Real-time Communication:**
- WebSocket message emission callbacks
- Agent activity events via WebSocketEventEmitter
- Status updates broadcast to `expedition:{expeditionId}` rooms

### 4. Current Workflow Phases (Complex)

**WorkflowPhase Enum (9 phases):**
```
initializing → analyzing → decomposing → plan_tasks → 
assigning → coordinating → synthesizing → 
waiting_for_approval → completed/failed
```

**LangGraph Implementation (ExpeditionWorkflow.ts):**
- 10+ workflow nodes with complex conditional routing
- Memory management via StateGraph annotations
- Interrupt patterns for user approval

## Key Insights for Simplified Flow

### 1. Status Mapping for 4-Phase Flow

**Current → Simplified Mapping:**
```
draft         → draft (unchanged)
planning      → refining (rename existing)  
in-progress   → planning/executing (split current phase)
completed     → completed (unchanged)
failed        → failed (unchanged)
cancelled     → cancelled (unchanged)
```

**New Status Flow:**
```
draft → refining → planning → executing → completed/failed/cancelled
```

### 2. Memory Management Strategy

**Keep Existing Pattern:**
- LangChainMemoryStore per expedition works well
- Memory key pattern: `expedition-{expeditionId}-{userId}`
- Context flows between phases via memory

**Enhanced for 4-Phase:**
```javascript
// Memory structure for 4-phase flow
{
  expeditionId: string,
  currentPhase: 'refining' | 'planning' | 'executing' | 'result',
  
  // REFINE phase context
  refinedMission: string,
  clarifications: ConversationMessage[],
  userRequirements: string[],
  
  // PLAN phase context  
  taskBreakdown: TaskBreakdown[],
  agentAssignments: Record<string, string[]>,
  workflowDSL: WorkflowDSL,
  
  // EXECUTE phase context
  executionResults: Map<string, WorkflowNodeResult>,
  
  // RESULT phase context
  finalResult: string
}
```

### 3. Service Integration Points

**ExpeditionService Updates Needed:**
- Add phase progression methods: `progressToPlanning()`, `startExecution()`
- Update status management for 4-phase flow
- Add user execution trigger endpoint

**FirstOfficerService Updates Needed:**
- Modify `startExpedition()` to begin in 'refining' phase
- Add phase-specific handler methods
- Enhanced memory management for cross-phase context
- Integration with chat system for refining phase

### 4. WebSocket Event Strategy

**Keep Existing Events:**
- `expedition:created`, `expedition:started`, `expedition:completed`
- `message:sent` for real-time chat
- Agent activity events

**Add New Phase Events:**
```javascript
'expedition:phase-changed'  // Phase transitions
'expedition:plan-ready'     // Plan phase complete, ready for approval
'expedition:execution-started' // Execute phase begins
'expedition:result-ready'   // Result phase complete
```

## Integration with WorkflowDSL

### Current WorkflowDSL System
- **WorkflowExecutionService**: Executes DSL workflows
- **Node Handlers**: Agent, Conditional, UserPrompt, Output nodes
- **Real-time Progress**: WebSocket updates during execution

### 4-Phase Integration Strategy
- **PLAN Phase**: Generate WorkflowDSL from task breakdown
- **EXECUTE Phase**: Use existing WorkflowExecutionService to run DSL
- **No Changes Needed**: WorkflowDSL execution engine works as-is

## Recommendations for Implementation

### 1. Keep What Works
- Service composition architecture (ExpeditionService + specialized services)
- LangChainMemoryStore for state persistence
- WebSocket real-time updates
- MCP-enabled FirstOfficer agents
- WorkflowDSL execution engine

### 2. Simplify What's Complex
- Replace 10+ node LangGraph workflow with 4-phase linear flow
- Consolidate WorkflowPhase enum to match 4 phases
- Streamline status transitions

### 3. Add What's Missing
- Interactive chat during refining phase
- User execution trigger ("Start Execution" button)
- Phase-specific data endpoints
- WorkflowDSL visualization for user approval

### 4. Architecture Decisions
- **Memory Strategy**: Enhance existing LangChainMemoryStore pattern
- **Phase Transitions**: Linear flow with validation gates
- **User Control**: Explicit execution trigger in planning phase
- **Real-time Updates**: Extend existing WebSocket event system

## Research Questions Answered

### Q: How does LangGraph memory persistence work?
**A**: Uses LangChainMemoryStore with sessionKey pattern `first-officer-{userId}-{expeditionId}`. Memory persists across workflow phases and can be retrieved for context.

### Q: What is relationship between Expedition, WorkflowDSL, and FirstOfficer states?
**A**: 
- **Expedition**: Database entity with status and basic info
- **FirstOfficer**: Agent instance that manages LangGraph workflow state  
- **WorkflowDSL**: Generated in plan phase, executed in execute phase
- Memory flows between all three via LangChainMemoryStore

### Q: How are agents selected and assigned?
**A**: Agents are pre-selected during expedition creation, stored in `expedition.assignedAgents[]`. FirstOfficer uses these for task assignments.

### Q: What WebSocket events are used?
**A**: `expedition:*` events for status changes, `message:sent` for chat, agent activity events for real-time progress tracking.

## Next Steps

This analysis provides the foundation for **Phase A2: WorkflowDSL Deep Dive**. Key integration points identified for connecting 4-phase flow with existing WorkflowDSL execution engine.