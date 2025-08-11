# Simplified Expedition Flow Design

## Live Status Tracker

**Last Updated**: 2025-01-08  
**Current Phase**: Design & Architecture (Complete)  
**Active Task**: Ready to begin Phase C - Core Implementation  
**Overall Progress**: 50%

### Phase Progress Status
```
Phase A: Research & Context Building      [✓] 100%
├─ A1: Core Architecture Research         [✓] Complete
├─ A2: WorkflowDSL Deep Dive             [✓] Complete  
├─ A3: LangGraph Integration Study       [✓] Complete
└─ A4: Frontend Integration Analysis     [✓] Complete

Phase B: Design & Architecture           [✓] 100%
├─ B1: State Management Design           [✓] Complete
├─ B2: Workflow Architecture Design      [✓] Complete
├─ B3: API Design                        [✓] Complete
└─ B4: Frontend Component Design         [✓] Complete

Phase C: Core Implementation             [ ] 0%
├─ C1: Backend Core - Types & Services   [ ] Not Started
├─ C2: WorkflowDSL Integration           [ ] Not Started
└─ C3: API Implementation                [ ] Not Started

Phase D: Frontend Implementation         [ ] 0%
├─ D1: Core UI Components                [ ] Not Started
└─ D2: Integration & Polish              [ ] Not Started

Phase E: Testing & Validation            [ ] 0%
├─ E1: Unit Testing                      [ ] Not Started
├─ E2: Integration Testing               [ ] Not Started
└─ E3: User Experience Testing           [ ] Not Started
```

### Current Working Context
**Active Design Task**: Design phase complete - Ready for implementation  
**Completed Deliverables**: A1-A4 research docs, B1-state-management-design.md, B2-workflow-architecture-design.md, B3-api-design.md, B4-frontend-component-design.md  
**Blocked Items**: None  
**Next Actions**: Begin Phase C implementation starting with backend core types and services

---

## Overview

This document outlines the redesign of the expedition system from the current complex 10+ node workflow to a streamlined 4-phase flow that provides better user experience and clearer execution semantics.

## Current Problems

1. **Complex Flow**: 10+ workflow nodes create confusion and hard-to-debug issues
2. **Unclear Phases**: Users don't understand where they are in the process
3. **No Clear Execution Trigger**: Execution starts automatically without user control
4. **Memory Issues**: Context doesn't persist well between workflow nodes
5. **Mixed Responsibilities**: Planning and execution are interleaved confusingly

## New Simplified Flow

```
START → REFINE → PLAN → EXECUTE → RESULT → END
```

### Phase 1: REFINE (Interactive Clarification)
**Purpose**: First Officer clarifies and refines the mission understanding

**Status**: `'draft'` → `'refining'`

**What Happens**:
- First Officer analyzes the initial mission description
- Reviews expedition vision and any additional context
- Engages in interactive chat with user to ask clarifying questions
- Refines understanding through back-and-forth conversation
- Stores the refined mission understanding in LangGraph memory for later phases

**User Experience**:
- Expedition shows status as "Refining Mission"
- Chat interface is active for clarifying questions
- First Officer asks intelligent questions about scope, requirements, constraints
- User provides clarifications through natural conversation

**Technical Implementation**:
- Consolidates current `analyze_objective` node functionality
- Uses existing chat system from `FirstOfficerService.handleUserMessage()`
- Stores context in LangGraph MemorySaver for persistence
- Determines when enough clarification has been gathered

**Exit Criteria**: 
- First Officer has sufficient understanding of the mission
- No more clarifying questions needed
- Refined mission stored in memory

### Phase 2: PLAN (Task & Workflow Creation)
**Purpose**: Create detailed execution plan with tasks and workflow

**Status**: `'refining'` → `'planning'`

**What Happens**:
- Retrieves refined mission from LangGraph memory
- Breaks down mission into specific, actionable tasks
- Assigns tasks to the pre-selected agents based on their capabilities
- Creates a WorkflowDSL that defines the execution flow
- Presents the plan to user for review and approval

**User Experience**:
- Expedition shows status as "Creating Plan"
- User sees task breakdown with agent assignments
- WorkflowDSL is visualized (ASCII art or diagram)
- User can review the plan before approving execution
- "Start Execution" button becomes available after plan review

**Technical Implementation**:
- Consolidates current `plan_tasks`, `select_agents`, `assign_tasks`, `create_workflow_dsl` nodes
- Uses existing WorkflowDSL types and generation logic
- Leverages pre-selected agents from expedition creation
- Creates visual representation of workflow for user review

**Exit Criteria**:
- Tasks are clearly defined with agent assignments
- WorkflowDSL is created and valid
- Plan is ready for user approval

### Phase 3: EXECUTE (User Approval + Workflow Execution)
**Purpose**: Execute the approved workflow with real-time monitoring

**Status**: `'planning'` → `'executing'`

**What Happens**:
- User reviews the WorkflowDSL and task assignments
- User clicks "Start Execution" to begin actual work
- WorkflowDSL is executed using the existing workflow engine
- Real-time progress tracking and agent coordination
- Handles task execution, dependencies, and error recovery

**User Experience**:
- User sees the complete plan before execution starts
- Clear "Start Execution" button provides user control
- Real-time progress updates show task completion
- Agent activities are visible through existing WebSocket system
- Can monitor progress but execution runs automatically once started

**Technical Implementation**:
- Uses existing `WorkflowExecutionService` for DSL execution
- Leverages current real-time WebSocket progress tracking
- Maintains existing agent coordination and error handling
- Existing quality checks and retry mechanisms remain intact

**Exit Criteria**:
- All workflow nodes have been executed successfully
- Final outputs are collected from all agents
- Execution is complete or failed with clear error state

### Phase 4: RESULT (Synthesis & Summary)
**Purpose**: Synthesize results into final expedition deliverable

**Status**: `'executing'` → `'completed'`

**What Happens**:
- First Officer collects all execution results from agents
- Synthesizes individual task outputs into coherent final result
- Creates expedition summary with key outcomes
- Stores final result in expedition record

**User Experience**:
- Expedition shows status as "Synthesizing Results"
- Final deliverable is presented to user
- Summary includes what was accomplished and key outcomes
- Expedition is marked as completed

**Technical Implementation**:
- Uses existing `synthesize_results` functionality
- Consolidates results from WorkflowDSL execution
- Creates final expedition result record
- Updates expedition status to completed

**Exit Criteria**:
- Final result is synthesized and stored
- Expedition is marked as completed
- All resources are cleaned up

## Status Flow

```
Expedition Status Flow:
draft → refining → planning → executing → completed
                              ↓
                           failed/cancelled
```

## Memory Management

**LangGraph Memory Strategy**:
- Each phase stores its context in LangGraph MemorySaver
- Memory key: `expedition-{expeditionId}-{userId}`
- Context flows between phases automatically
- Enables pause/resume functionality at phase boundaries

**Memory Structure**:
```typescript
{
  expeditionId: string,
  userId: string,
  starshipId: string,
  
  // REFINE phase outputs
  refinedMission: string,
  clarifications: ConversationMessage[],
  requirements: string[],
  constraints: string[],
  
  // PLAN phase outputs  
  taskBreakdown: TaskBreakdown[],
  agentAssignments: Record<string, string[]>,
  workflowDSL: WorkflowDSL,
  
  // EXECUTE phase outputs
  executionResults: Map<string, WorkflowNodeResult>,
  agentOutputs: Record<string, any>,
  
  // RESULT phase outputs
  finalResult: string,
  expeditionSummary: string
}
```

## User Interface Changes

### Expedition Detail Page
1. **Clear Phase Indicator**: Shows current phase (Refining, Planning, Executing, Results)
2. **Phase-Specific Content**:
   - **Refining**: Active chat interface for clarifications
   - **Planning**: Task breakdown, agent assignments, workflow visualization
   - **Executing**: Real-time progress tracking, agent activities
   - **Results**: Final deliverable and summary

### New UI Components
1. **"Start Execution" Button**: Only appears after planning phase
2. **Workflow Visualization**: Shows WorkflowDSL as ASCII art or diagram  
3. **Phase Progress Indicator**: Visual progress through the 4 phases
4. **Interactive Planning Review**: User can examine plan before execution

## Technical Architecture Changes

### 1. ExpeditionWorkflow.ts Simplification
Replace 10+ node complex graph with 4-node linear workflow:
```typescript
START → refine_mission → plan_workflow → execute_workflow → synthesize_result → END
```

### 2. FirstOfficerService Updates
- `startExpedition()` begins in `'refining'` phase with chat active
- New `progressToPlanning()` method transitions phases
- New `startExecution()` method triggered by user button
- Enhanced memory management for cross-phase context

### 3. New API Endpoints
```typescript
// Transition expedition to next phase
POST /expeditions/:id/progress-phase

// Start execution after planning approval
POST /expeditions/:id/start-execution

// Get phase-specific data
GET /expeditions/:id/phase-data
```

### 4. Database Schema Updates
```sql
-- Update expedition status enum
ALTER TYPE expedition_status ADD VALUE 'refining';
-- 'planning' and 'executing' already exist, just need to align usage
```

## Systemic Implementation Plan

This plan combines research, context-gathering, and implementation phases to ensure deep understanding before building.

### Phase A: Research & Context Building (Week 1-2)

Before implementing, gain comprehensive understanding of the existing codebase and architectural patterns.

#### A1: Core Architecture Research
**Objective**: Understand the current expedition and workflow systems

**Files to Study**:
- [ ] `packages/protocol/src/types/expedition.ts` - Study all expedition types and status flows
- [ ] `packages/protocol/src/types/workflow.ts` - Understand WorkflowDSL structure and execution model
- [ ] `packages/agent-engine/src/first-officer/types.ts` - Review FirstOfficer state management patterns
- [ ] `packages/server/src/services/ExpeditionService.ts` - Understand current expedition orchestration
- [ ] `packages/server/src/services/FirstOfficerService.ts` - Study agent coordination patterns

**Research Questions**:
- How does LangGraph memory persistence work in the current system?
- What is the relationship between Expedition, WorkflowDSL, and FirstOfficer states?
- How are agents currently selected and assigned to expeditions?
- What WebSocket events are used for real-time updates?

**Deliverable**: Create architectural understanding document with current system flow diagrams

#### A2: WorkflowDSL Deep Dive
**Objective**: Understand how WorkflowDSL execution works to leverage it in execute phase

**Files to Study**:
- [ ] `packages/server/src/services/WorkflowExecutionService.ts` - Study DSL execution engine
- [ ] `packages/server/src/services/WorkflowGenerationService.ts` - Understand how workflows are created
- [ ] `packages/server/src/services/BasicNodeHandlers.ts` - Review node execution patterns
- [ ] `packages/server/src/services/AgentNodeHandler.ts` - Study agent task execution
- [ ] `packages/server/src/services/ConditionalNodeHandler.ts` - Understand conditional logic
- [ ] `packages/server/src/services/UserPromptNodeHandler.ts` - Review user interaction patterns

**Research Questions**:
- How are WorkflowDSL nodes executed in sequence?
- What context is passed between workflow nodes?
- How does error handling and retry logic work in workflows?
- How are agent tasks coordinated within workflows?

**Deliverable**: WorkflowDSL execution flow documentation with integration points for expedition phases

#### A3: LangGraph Integration Study  
**Objective**: Understand memory management and state transitions in LangGraph

**Files to Study**:
- [ ] `packages/agent-engine/src/first-officer/workflow/ExpeditionWorkflow.ts` - Current LangGraph implementation
- [ ] `packages/agent-engine/src/first-officer/FirstOfficerAgent.ts` - Agent-LangGraph integration
- [ ] `packages/agent-engine/src/first-officer/StatePersistence.ts` - State management patterns

**External Research**:
- [ ] LangGraph documentation on StateGraph and MemorySaver
- [ ] LangGraph best practices for phase-based workflows  
- [ ] LangGraph interrupt and resume patterns

**Research Questions**:
- How does LangGraph MemorySaver work for persistent state?
- What are the patterns for conditional phase transitions?
- How can we interrupt workflows for user approval?
- How is context passed between LangGraph nodes?

**Deliverable**: LangGraph integration guide with memory management patterns for 4-phase workflow

#### A4: Frontend Integration Analysis
**Objective**: Understand current UI patterns and WebSocket integration

**Files to Study**:
- [ ] `packages/client/src/components/expeditions/ExpeditionDetails.tsx` - Current expedition UI
- [ ] `packages/client/src/components/expeditions/ExpeditionChat.tsx` - Chat interface patterns
- [ ] `packages/client/src/hooks/useExpeditionData.ts` - Data fetching patterns
- [ ] `packages/client/src/hooks/useExpeditionChat.ts` - Real-time chat integration
- [ ] `packages/client/src/lib/expedition-socket-api.ts` - WebSocket event patterns

**Research Questions**:
- How are expedition status updates reflected in the UI?
- What WebSocket events drive real-time updates?
- How is the chat interface integrated with expedition workflows?
- What are the current UI patterns for workflow visualization?

**Deliverable**: Frontend integration requirements with UI component specifications

### Phase B: Design & Architecture (Week 2-3)

Build detailed technical specifications based on research findings.

#### B1: State Management Design
**Objective**: Design the 4-phase state transition system

**Tasks**:
- [ ] Design ExpeditionState schema for 4 phases
- [ ] Define LangGraph memory structure for cross-phase context
- [ ] Design phase transition validation rules
- [ ] Create state persistence strategy

**Research Dependencies**: A1, A3
**Deliverable**: State management specification with transition diagrams

#### B2: Workflow Architecture Design  
**Objective**: Design the simplified LangGraph workflow

**Tasks**:
- [ ] Design 4-node LangGraph workflow structure
- [ ] Define node handler interfaces for each phase
- [ ] Design memory passing patterns between phases
- [ ] Plan integration with WorkflowDSL execution

**Research Dependencies**: A2, A3
**Deliverable**: Workflow architecture specification with node definitions

#### B3: API Design
**Objective**: Design backend APIs for 4-phase expedition management

**Tasks**:
- [ ] Design phase progression endpoints
- [ ] Design user execution trigger API
- [ ] Design phase-specific data retrieval APIs
- [ ] Plan WebSocket event schema for real-time updates

**Research Dependencies**: A1, A4
**Deliverable**: API specification with endpoint definitions and event schemas

#### B4: Frontend Component Design
**Objective**: Design UI components for phase-based expedition experience

**Tasks**:
- [ ] Design phase indicator component
- [ ] Design "Start Execution" button and workflow approval UI
- [ ] Design phase-specific content rendering
- [ ] Plan WorkflowDSL visualization component

**Research Dependencies**: A4, B2
**Deliverable**: UI component specifications with wireframes

### Phase C: Core Implementation (Week 3-5)

Implement the core 4-phase system based on research and design.

#### C1: Backend Core - Types & Services
**Implementation Order**:

1. **Update Core Types** (Day 1)
   - [ ] Update `ExpeditionStatus` enum with new phases
   - [ ] Add 4-phase state types to expedition protocol
   - [ ] Update WorkflowPhase alignment

2. **Implement Simplified LangGraph Workflow** (Day 2-3)
   - [ ] Create new `SimplifiedExpeditionWorkflow.ts`
   - [ ] Implement 4-node workflow: refine → plan → execute → result
   - [ ] Add memory management for cross-phase context
   - [ ] Implement phase transition conditions

3. **Update FirstOfficerService** (Day 4-5)
   - [ ] Modify `startExpedition()` to begin in refining phase
   - [ ] Implement phase-specific handler methods
   - [ ] Add memory persistence and retrieval
   - [ ] Integrate with chat system for refine phase

4. **Update ExpeditionService** (Day 6-7)
   - [ ] Add phase progression methods
   - [ ] Implement user execution trigger
   - [ ] Update expedition status management
   - [ ] Add phase-specific data retrieval

**Dependencies**: Phase A research, Phase B design
**Deliverable**: Working 4-phase backend system

#### C2: WorkflowDSL Integration
**Implementation Order**:

1. **Plan Phase Integration** (Day 8-9)
   - [ ] Connect task breakdown to WorkflowDSL generation  
   - [ ] Integrate agent assignment with DSL nodes
   - [ ] Add workflow visualization generation

2. **Execute Phase Integration** (Day 10-11)
   - [ ] Integrate WorkflowExecutionService with execute phase
   - [ ] Connect real-time progress tracking
   - [ ] Implement error handling and retry logic

**Dependencies**: C1, A2 research
**Deliverable**: Integrated WorkflowDSL execution within expedition phases

#### C3: API Implementation
**Implementation Order**:

1. **New Expedition Endpoints** (Day 12-13)
   - [ ] Add phase progression endpoints
   - [ ] Implement user execution trigger endpoint
   - [ ] Add phase-specific data endpoints

2. **WebSocket Updates** (Day 14)
   - [ ] Add phase transition events
   - [ ] Update real-time progress events
   - [ ] Test event integration

**Dependencies**: C1, B3 design
**Deliverable**: Complete API for 4-phase expedition management

### Phase D: Frontend Implementation (Week 5-6)

Build the user interface for the 4-phase expedition experience.

#### D1: Core UI Components
**Implementation Order**:

1. **Phase Management Components** (Day 15-16)
   - [ ] Build phase indicator component
   - [ ] Create phase-specific content containers
   - [ ] Implement phase transition UI logic

2. **Interactive Components** (Day 17-18)  
   - [ ] Build "Start Execution" button with approval flow
   - [ ] Create WorkflowDSL visualization component
   - [ ] Implement real-time phase updates

**Dependencies**: C3, B4 design
**Deliverable**: Core UI components for 4-phase expeditions

#### D2: Integration & Polish
**Implementation Order**:

1. **Expedition Detail Page Updates** (Day 19-20)
   - [ ] Integrate phase-based UI components
   - [ ] Update expedition status rendering
   - [ ] Add phase-specific action buttons

2. **Real-time Integration** (Day 21)
   - [ ] Connect WebSocket events to phase updates
   - [ ] Test real-time phase transitions
   - [ ] Validate user experience flow

**Dependencies**: D1, C3
**Deliverable**: Complete frontend implementation

### Phase E: Testing & Validation (Week 6-7)

Comprehensive testing of the 4-phase expedition system.

#### E1: Unit Testing
- [ ] Test each phase transition logic
- [ ] Test LangGraph memory persistence
- [ ] Test WorkflowDSL integration
- [ ] Test API endpoints and validation

#### E2: Integration Testing  
- [ ] Test complete 4-phase flow end-to-end
- [ ] Test user interaction patterns
- [ ] Test real-time WebSocket integration
- [ ] Test error handling and recovery

#### E3: User Experience Testing
- [ ] Test expedition creation → completion flow
- [ ] Validate phase-specific UI behavior  
- [ ] Test "Start Execution" approval flow
- [ ] Validate WorkflowDSL visualization

**Dependencies**: All previous phases
**Deliverable**: Fully tested 4-phase expedition system

## Success Criteria

### Research Phase Success
- [ ] Clear understanding of current architecture documented
- [ ] Integration points with WorkflowDSL identified
- [ ] LangGraph patterns and memory management understood
- [ ] Frontend integration requirements specified

### Implementation Phase Success
- [ ] 4-phase expedition flow working end-to-end
- [ ] Users can refine missions through interactive chat
- [ ] Plans are generated and visualized for user approval  
- [ ] "Start Execution" triggers WorkflowDSL execution
- [ ] Results are synthesized and presented clearly

### System Quality Success
- [ ] Memory context flows seamlessly between phases
- [ ] Real-time updates work throughout all phases
- [ ] Error handling is robust at each phase
- [ ] User experience is intuitive and clear

## Benefits of New Design

1. **Clear User Experience**: 4 distinct phases users can understand
2. **User Control**: Explicit execution trigger via "Start Execution" button
3. **Better Error Handling**: Failures contained within phases
4. **Improved Memory**: LangGraph memory carries context between phases
5. **Easier Debugging**: Linear flow easier to troubleshoot
6. **Interactive Refinement**: Natural conversation during mission clarification
7. **Flexible Planning**: Users can review and understand plan before execution
8. **Reusable Components**: Existing WorkflowDSL execution engine unchanged

## Fresh Implementation Approach

This simplified expedition flow is designed as the **founding feature** of the expedition system. No backward compatibility, feature flags, or migrations are required - this is the new standard implementation.

## Implementation Considerations

1. **Memory Management**: Use LangGraph MemorySaver with proper cleanup
2. **Phase Transitions**: Validate state before allowing phase progression
3. **User Experience**: Provide clear feedback during each phase
4. **Error Recovery**: Allow manual intervention if phase fails

## Success Metrics

1. **User Experience**: Clear understanding of expedition progress
2. **Execution Control**: Users successfully control when execution starts
3. **Memory Efficiency**: Reliable context retention between phases
4. **System Simplicity**: Streamlined development with 4-phase architecture