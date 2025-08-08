# 🎯 Workflow DSL Integration Plan

## 📋 **Overview**

This document outlines the plan for integrating a Workflow DSL (Domain Specific Language) system into the expedition orchestration flow. The DSL will provide users with visual transparency and control over how their expeditions execute.

## 🔄 **Enhanced Expedition Flow**

### **Current Flow**
```
START → analyze_objective → plan_tasks → select_agents → 
assign_tasks → execute_tasks → monitor_progress → 
quality_check → synthesize_results → END
```

### **New Flow with Workflow DSL**
```
START → analyze_objective → plan_tasks → select_agents → 
assign_tasks → create_workflow_dsl → user_approval_workflow → 
execute_tasks → monitor_progress → quality_check → synthesize_results → END
```

## 🏗️ **Architecture Principles**

### **Design Decisions Made**
- ✅ **Generic & Modular**: DSL is not domain-specific, handles pure data flow
- ✅ **Sequential Execution**: No parallel processing (simplified for initial implementation)  
- ✅ **Separate Concerns**: Workflow structure separate from execution logic
- ✅ **User Control**: Mandatory approval step before execution
- ✅ **JSONata Integration**: Safe expression evaluation for conditionals
- ✅ **No Backward Compatibility**: All expeditions use the new DSL system

### **Key Components**
1. **Workflow DSL Creation** - LLM generates workflow graph from task breakdown
2. **User Approval System** - Visual workflow approval with modification capabilities
3. **DSL-Driven Execution** - Sequential execution following workflow graph
4. **Conditional Logic** - JSONata expressions for data-driven routing
5. **User Interaction Points** - Dedicated user prompt nodes

## 🎨 **Workflow DSL Structure**

### **Core Types (Clean Architecture)**
```typescript
// NEW: Clean workflow DSL types (replacing old ExpeditionWorkflowState)
interface WorkflowDSL {
  id: string;
  expeditionId: string;
  nodes: WorkflowDSLNode[];
  edges: WorkflowDSLEdge[];
  visualization: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
}

interface WorkflowDSLNode {
  id: string;
  type: string; // 'agent', 'conditional', 'user_prompt', 'output'
  name: string;
  description: string;
  estimatedTime?: number;
  parameters: Record<string, any>;
  metadata?: Record<string, any>;
}

interface WorkflowDSLEdge {
  id: string;
  from: string;
  to: string;
  condition?: string; // Condition key for routing
  metadata?: Record<string, any>;
}
```

### **Node Types**

#### **1. Agent Nodes**
Execute work via AI agents
```typescript
interface AgentNodeParameters {
  agentId: string;
  taskIds: string[];
}
```

#### **2. Conditional Nodes** 
Data-driven routing using JSONata expressions
```typescript
interface ConditionalNodeParameters {
  sourceNodeId: string;
  expression: string; // JSONata expression
  conditions: Record<string, string>; // conditionKey → JSONata boolean expression
}
```

#### **3. User Prompt Nodes**
User interaction and decision points
```typescript
interface UserPromptNodeParameters {
  promptText: string;
  choices: string[];
  sourceNodeId?: string; // Optional context from previous node
}
```

## 🔧 **Implementation Architecture**

### **Modular Node Handler System**
```typescript
interface WorkflowNodeHandler {
  type: string;
  execute(node: WorkflowNode, context: WorkflowExecutionState): Promise<WorkflowNodeResult>;
  validate(node: WorkflowNode): WorkflowValidationResult;
  getVisualization(node: WorkflowNode): string;
}
```

### **Registry Pattern**
```typescript
interface WorkflowNodeRegistry {
  register(handler: WorkflowNodeHandler): void;
  getHandler(type: string): WorkflowNodeHandler | null;
  getAllHandlers(): WorkflowNodeHandler[];
}
```

### **Service Layer**
- **WorkflowExecutionService**: Handles workflow execution
- **WorkflowGenerationService**: LLM-powered DSL generation and validation
- **WorkflowApprovalService**: User approval workflow management

## 🎯 **Conditional Logic with JSONata**

### **Safe Expression Evaluation**
- Uses JSONata library for secure expression parsing
- No arbitrary code execution risks
- Powerful JSON querying and transformation capabilities

### **Example Conditional Patterns**

#### **Quality Gate**
```typescript
{
  sourceNodeId: 'data_agent',
  expression: 'qualityScore',
  conditions: {
    'high_quality': 'result >= 80',
    'low_quality': 'result < 80'
  }
}
```

#### **Multi-way Branching**
```typescript
{
  sourceNodeId: 'analysis_agent', 
  expression: 'confidence',
  conditions: {
    'high_confidence': 'result >= 0.9',
    'medium_confidence': 'result >= 0.7 and result < 0.9',
    'low_confidence': 'result < 0.7'
  }
}
```

#### **Complex Data Checks**
```typescript
{
  sourceNodeId: 'validator',
  expression: '{ "errors": $count(errors), "score": qualityScore }',
  conditions: {
    'excellent': 'result.score >= 95 and result.errors = 0',
    'good': 'result.score >= 80 and result.errors <= 2', 
    'poor': 'result.score < 80 or result.errors > 2'
  }
}
```

## 📊 **Workflow Visualization**

### **ASCII Format (Initial)**
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Data Agent  │───▶│ Quality≥80%? │───▶│ Report Agent│
└─────────────┘    └──────────────┘    └─────────────┘
                           │
                           ▼ (No)
                   ┌──────────────┐
                   │ Retry Agent  │───┐
                   └──────────────┘   │
                           ▲          │
                           └──────────┘
```

### **Future Formats**
- Mermaid diagrams
- DOT/Graphviz
- Interactive web components

## 🔄 **LangGraph Integration**

### **New Workflow Nodes**
- `create_workflow_dsl`: Generate workflow DSL from task breakdown
- `user_approval_workflow`: Handle user approval with interrupts

### **Modified Workflow Edges**
```typescript
// assign_tasks → create_workflow_dsl → user_approval_workflow → execute_tasks

.addConditionalEdges(
  'assign_tasks',
  (state) => 'create_workflow_dsl',
  { 'create_workflow_dsl': 'create_workflow_dsl' }
)

.addConditionalEdges(
  'user_approval_workflow', 
  (state) => {
    if (state.workflow?.approvalStatus === 'approved') return 'execute_tasks';
    return 'user_approval_workflow'; // Wait for approval
  },
  { 'execute_tasks': 'execute_tasks', 'user_approval_workflow': 'user_approval_workflow' }
)
```

## 📋 **LINEAR EXECUTION PLAN**

### 🎯 **Execution Strategy**
- **Linear Dependencies**: Each step builds on the previous ones
- **Incremental Testing**: Test after each major step
- **Clear Validation**: Specific criteria for step completion
- **Risk Mitigation**: Early validation of critical components

---

## 📦 **PHASE 1: FOUNDATION (Weeks 1-2)**

### **Step 1.1: Setup Dependencies & Environment**
**Duration**: 1 day  
**Dependencies**: None  

**Tasks:**
1. Install JSONata in server package
   ```bash
   cd packages/server && npm install jsonata@^2.0.5
   ```
2. Create workflow constants file
   ```typescript
   // packages/server/src/constants/workflow.ts
   export const WORKFLOW_CONFIG = {
     APPROVAL_TIMEOUT_MINUTES: 30,
     MAX_CONDITIONAL_DEPTH: 10,
     USER_PROMPT_TIMEOUT_MINUTES: 60,
     JSONATA_EXPRESSION_TIMEOUT_MS: 5000,
     MAX_WORKFLOW_NODES: 50,
     MAX_WORKFLOW_EDGES: 100
   } as const;
   ```

**Validation Criteria:**
- [ ] JSONata imported and basic expression can be evaluated
- [ ] Constants file created and imported successfully
- [ ] Build passes without errors

---

### **Step 1.2: Define Core Types & Remove Old Types**
**Duration**: 1 day  
**Dependencies**: Step 1.1  

**Tasks:**
1. Remove old ExpeditionWorkflowState from protocol types
2. Create workflow types file
   ```typescript
   // packages/protocol/src/types/workflow.ts
   // Use WorkflowDSL instead of Workflow to avoid confusion
   interface WorkflowDSL {
     id: string;
     expeditionId: string;
     nodes: WorkflowDSLNode[];  // Renamed from WorkflowNode
     edges: WorkflowDSLEdge[];  // Renamed from WorkflowEdge
     // ... other fields
   }
   ```
3. Export workflow types from protocol package
4. Update protocol package exports
5. Update all references to use new naming convention

**Validation Criteria:**
- [ ] Old ExpeditionWorkflowState removed from codebase
- [ ] All new workflow interfaces defined with clear naming
- [ ] Types can be imported in server package
- [ ] TypeScript compilation passes
- [ ] No naming conflicts with existing types

---

### **Step 1.3: Database Schema Creation**
**Duration**: 2 days  
**Dependencies**: Step 1.2  

**Tasks:**
1. Create workflow database migration
   ```sql
   -- Create workflows table
   CREATE TABLE workflows (
     id VARCHAR(255) PRIMARY KEY,
     expedition_id VARCHAR(255) NOT NULL,
     nodes JSON NOT NULL,
     edges JSON NOT NULL,
     visualization TEXT,
     approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     approved_at TIMESTAMP NULL,
     FOREIGN KEY (expedition_id) REFERENCES expeditions(id) ON DELETE CASCADE,
     INDEX idx_expedition_id (expedition_id),
     INDEX idx_approval_status (approval_status)
   );

   -- Create workflow runtime states table
   CREATE TABLE workflow_runtime_states (
     id VARCHAR(255) PRIMARY KEY,
     workflow_id VARCHAR(255) NOT NULL,
     current_node_id VARCHAR(255),
     status ENUM('not_started', 'running', 'paused', 'completed', 'failed') DEFAULT 'not_started',
     execution_results JSON,
     start_time TIMESTAMP NULL,
     end_time TIMESTAMP NULL,
     paused_at TIMESTAMP NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
     INDEX idx_workflow_id (workflow_id),
     INDEX idx_status (status)
   );

   -- Add workflow_id to expeditions table
   ALTER TABLE expeditions ADD COLUMN workflow_id VARCHAR(255) NULL;
   ALTER TABLE expeditions ADD CONSTRAINT fk_expedition_workflow 
     FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL;
   ```

2. Add cleanup migration to drop old workflowState column
   ```sql
   -- Cleanup: Remove old workflowState column
   ALTER TABLE expeditions DROP COLUMN IF EXISTS workflowState;
   ```
3. Run migration on development database
4. Update models to include workflow tables

**Validation Criteria:**
- [ ] Migration runs successfully
- [ ] New workflow tables created with correct schema
- [ ] Old workflowState column removed from expeditions
- [ ] Foreign key constraints working
- [ ] Can insert/query basic workflow records

---

### **Step 1.4: Create Workflow Repository**
**Duration**: 1 day  
**Dependencies**: Step 1.3  

**Tasks:**
1. Create WorkflowRepository class
   ```typescript
   // packages/models/src/repositories/WorkflowRepository.ts
   export class WorkflowRepository {
     async create(workflow: Omit<Workflow, 'id' | 'createdAt'>): Promise<Workflow>
     async findById(id: string): Promise<Workflow | null>
     async findByExpeditionId(expeditionId: string): Promise<Workflow[]>
     async update(id: string, updates: Partial<Workflow>): Promise<Workflow | null>
     async updateApprovalStatus(id: string, status: Workflow['approvalStatus'], approvedAt?: string): Promise<boolean>
     async delete(id: string): Promise<boolean>
   }
   ```

2. Create WorkflowRuntimeStateRepository class
3. Add repositories to RepositoryFactory

**Validation Criteria:**
- [ ] Repository CRUD operations work
- [ ] Can create, read, update, delete workflows
- [ ] Approval status updates work correctly
- [ ] Runtime state tracking functional

---

### **Step 1.5: Basic Workflow Generation Service**
**Duration**: 2 days  
**Dependencies**: Step 1.4  

**Tasks:**
1. Create WorkflowGenerationService
   ```typescript
   // packages/server/src/services/WorkflowGenerationService.ts
   export class WorkflowGenerationService {
     async generateWorkflow(request: WorkflowGenerationRequest): Promise<WorkflowGenerationResult>
     async validateWorkflow(workflow: Workflow): Promise<WorkflowValidationResult>
     async visualizeWorkflow(workflow: Workflow, config: VisualizationConfig): Promise<VisualizationResult>
   }
   ```

2. Implement basic workflow generation (simple linear workflow first)
3. Implement ASCII visualization
4. Implement basic validation

**Validation Criteria:**
- [ ] Can generate simple linear workflow from task breakdown
- [ ] ASCII visualization renders correctly
- [ ] Basic validation catches structural errors
- [ ] Service integrates with repository

---

## ⚙️ **PHASE 2: LANGRAPH INTEGRATION (Week 3)**

### **Step 2.1: Extend ExpeditionState & Remove Old Implementation**
**Duration**: 2 days  
**Dependencies**: Step 1.5  

**Tasks:**
1. Remove old ExpeditionWorkflowState interface from protocol types
2. Remove workflowState handling from ExpeditionRepository
3. Remove parallel execution support from FirstOfficer configuration
4. Modify ExpeditionStateAnnotation in ExpeditionWorkflow.ts
   ```typescript
   const ExpeditionStateAnnotation = Annotation.Root({
     // ... existing fields ...
     
     // NEW: Workflow DSL fields (replacing old workflowState)
     workflowDSL: Annotation<WorkflowDSL | undefined>(),
     currentWorkflowNode: Annotation<string | undefined>(),
     workflowRuntimeState: Annotation<WorkflowRuntimeState | undefined>(),
   });
   ```
5. Update expedition creation to enforce pre-selected agents constraint
6. Update FirstOfficer config to disable parallel execution

**Validation Criteria:**
- [ ] Old ExpeditionWorkflowState removed from codebase
- [ ] ExpeditionState compiles with new WorkflowDSL fields
- [ ] Parallel execution disabled in FirstOfficer config
- [ ] LangGraph workflow still functions with sequential-only execution
- [ ] Pre-selected agents constraint enforced
- [ ] No references to old workflowState remain

---

### **Step 2.2: Create Workflow DSL Generation Node**
**Duration**: 2 days  
**Dependencies**: Step 2.1  

**Tasks:**
1. Add createWorkflowDSLNode to FirstOfficerAgent
   ```typescript
   private async createWorkflowDSLNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
     // Generate workflow from task breakdown and agent assignments
     const workflow = await this.workflowGenerationService.generateWorkflow({
       expeditionId: state.expeditionId,
       taskBreakdown: state.taskBreakdown,
       selectedAgents: state.selectedAgents || [],
       objective: state.requirements,
       complexity: state.objectiveAnalysis?.complexity || 'moderate'
     });
     
     return {
       currentPhase: 'waiting_for_approval',
       workflowDSL: workflow.workflow,
       lastUpdated: new Date().toISOString()
     };
   }
   ```

2. Update workflow handlers registration
3. Add workflow generation service injection

**Validation Criteria:**
- [ ] Node generates workflow from expedition data
- [ ] Workflow stored in expedition state
- [ ] Phase transitions correctly to waiting_for_approval

---

### **Step 2.3: Create User Approval Workflow Node**
**Duration**: 2 days  
**Dependencies**: Step 2.2  

**Tasks:**
1. Add userApprovalWorkflowNode to FirstOfficerAgent
   ```typescript
   private async userApprovalWorkflowNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
     // Check if workflow has been approved
     if (state.workflowDSL?.approvalStatus === 'approved') {
       return {
         currentPhase: 'coordinating',
         lastUpdated: new Date().toISOString()
       };
     }
     
     // Still waiting for approval - interrupt execution
     return { currentPhase: 'waiting_for_approval' };
   }
   ```

2. Implement LangGraph interrupt mechanism
3. Add approval status checking logic

**Validation Criteria:**
- [ ] Node correctly checks approval status
- [ ] Workflow execution pauses for approval
- [ ] Continues execution after approval
- [ ] Handles rejection properly

---

### **Step 2.4: Update Workflow Edges**
**Duration**: 1 day  
**Dependencies**: Step 2.3  

**Tasks:**
1. Modify ExpeditionWorkflow.ts edges
   ```typescript
   // assign_tasks → create_workflow_dsl → user_approval_workflow → execute_tasks
   
   .addConditionalEdges(
     'assign_tasks',
     (state) => {
       if (state.currentPhase === 'failed') return 'handle_error';
       return 'create_workflow_dsl';
     },
     {
       'create_workflow_dsl': 'create_workflow_dsl',
       'handle_error': 'handle_error'
     }
   )
   
   .addConditionalEdges(
     'create_workflow_dsl',
     (state) => {
       if (state.currentPhase === 'failed') return 'handle_error';
       return 'user_approval_workflow';
     },
     {
       'user_approval_workflow': 'user_approval_workflow', 
       'handle_error': 'handle_error'
     }
   )
   
   .addConditionalEdges(
     'user_approval_workflow',
     (state) => {
       if (state.workflowDSL?.approvalStatus === 'approved') return 'execute_tasks';
       return 'user_approval_workflow'; // Keep waiting
     },
     {
       'execute_tasks': 'execute_tasks',
       'user_approval_workflow': 'user_approval_workflow'
     }
   )
   ```

**Validation Criteria:**
- [ ] Workflow follows new execution path
- [ ] Creates DSL after task assignment
- [ ] Waits for approval before execution
- [ ] Error handling works at each step

---

## 🌐 **PHASE 3: API LAYER (Week 4)**

### **Step 3.1: Workflow Management Endpoints**
**Duration**: 2 days  
**Dependencies**: Step 2.4  

**Tasks:**
1. Create workflow routes file
   ```typescript
   // packages/server/src/routes/workflows.ts
   router.get('/:expeditionId/workflow', getWorkflow);
   router.post('/:expeditionId/workflow/approve', approveWorkflow); 
   router.post('/:expeditionId/workflow/reject', rejectWorkflow);
   router.put('/:expeditionId/workflow', updateWorkflow);
   router.post('/:expeditionId/workflow/visualize', visualizeWorkflow);
   ```

2. Implement route handlers
3. Add to main app routing
4. Add authentication middleware

**Validation Criteria:**
- [ ] Can retrieve workflow for expedition
- [ ] Approval/rejection updates workflow status
- [ ] Visualization endpoint returns ASCII art
- [ ] Authentication works on all endpoints

---

### **Step 3.2: Execution Monitoring Endpoints**
**Duration**: 1 day  
**Dependencies**: Step 3.1  

**Tasks:**
1. Add execution monitoring routes
   ```typescript
   router.get('/:expeditionId/workflow/execution-status', getExecutionStatus);
   router.post('/:expeditionId/workflow/pause', pauseWorkflow);
   router.post('/:expeditionId/workflow/resume', resumeWorkflow);
   ```

2. Implement execution status tracking
3. Add pause/resume functionality stubs

**Validation Criteria:**
- [ ] Can retrieve execution status
- [ ] Pause/resume endpoints accessible
- [ ] Status updates reflect workflow state

---

### **Step 3.3: User Prompt Endpoints**
**Duration**: 1 day  
**Dependencies**: Step 3.2  

**Tasks:**
1. Add user prompt routes
   ```typescript
   router.get('/:expeditionId/user-prompts/pending', getPendingPrompts);
   router.post('/:expeditionId/user-prompt/:promptId/respond', respondToPrompt);
   ```

2. Implement prompt management
3. Add prompt response handling

**Validation Criteria:**
- [ ] Can retrieve pending user prompts
- [ ] Can respond to prompts
- [ ] Responses trigger workflow continuation

---

### **Step 3.4: WebSocket Event Integration**
**Duration**: 2 days  
**Dependencies**: Step 3.3  

**Tasks:**
1. Add workflow events to existing expedition WebSocket events
   ```typescript
   // Extended expedition event types
   'expedition:workflow-dsl-generated'
   'expedition:workflow-dsl-approved'
   'expedition:workflow-dsl-rejected' 
   'expedition:workflow-execution-started'
   'expedition:workflow-node-executing'
   'expedition:workflow-node-completed'
   'expedition:workflow-user-prompt-required'
   ```

2. Emit events from appropriate services
3. Test event propagation

**Validation Criteria:**
- [ ] Events emit correctly from backend
- [ ] Event payloads contain expected data
- [ ] Events can be received by test client

---

## 💻 **PHASE 4: FRONTEND INTEGRATION (Week 5)**

### **Step 4.1: Basic Workflow Visualization Component**
**Duration**: 2 days  
**Dependencies**: Step 3.4  

**Tasks:**
1. Create WorkflowVisualization component
   ```typescript
   // packages/client/src/components/workflow/WorkflowVisualization.tsx
   interface WorkflowVisualizationProps {
     workflow: Workflow;
     currentNodeId?: string;
     onNodeClick?: (nodeId: string) => void;
   }
   ```

2. Implement ASCII rendering
3. Add basic interactivity
4. Style with CSS

**Validation Criteria:**
- [ ] Renders workflow ASCII visualization
- [ ] Shows current executing node
- [ ] Handles different workflow structures
- [ ] Responsive design works

---

### **Step 4.2: Workflow Approval Modal**
**Duration**: 2 days  
**Dependencies**: Step 4.1  

**Tasks:**
1. Create WorkflowApprovalModal component
   ```typescript
   interface WorkflowApprovalModalProps {
     workflow: Workflow;
     isOpen: boolean;
     onApprove: () => void;
     onReject: () => void;
     onClose: () => void;
   }
   ```

2. Add approval/rejection buttons
3. Integrate with API endpoints
4. Add loading states

**Validation Criteria:**
- [ ] Modal displays workflow visualization
- [ ] Approve/reject buttons work
- [ ] Loading states during API calls
- [ ] Success/error handling

---

### **Step 4.3: Expedition Dashboard Integration**
**Duration**: 2 days  
**Dependencies**: Step 4.2  

**Tasks:**
1. Update ExpeditionDashboard to show workflow
2. Add workflow approval step to expedition flow
3. Integrate WebSocket events
4. Add workflow status indicators

**Validation Criteria:**
- [ ] Workflow appears in expedition dashboard
- [ ] Approval flow works end-to-end
- [ ] Real-time updates via WebSocket
- [ ] Status indicators show correct state

---

### **Step 4.4: State Management Integration**
**Duration**: 1 day  
**Dependencies**: Step 4.3  

**Tasks:**
1. Add workflow state slice
   ```typescript
   // packages/client/src/store/workflowSlice.ts
   interface WorkflowState {
     currentWorkflow: Workflow | null;
     approvalPending: boolean;
     executionStatus: WorkflowRuntimeState | null;
   }
   ```

2. Add workflow actions and reducers
3. Connect components to state
4. Add WebSocket event handlers

**Validation Criteria:**
- [ ] Workflow state updates correctly
- [ ] Components react to state changes
- [ ] WebSocket events update state
- [ ] State persistence works

---

## 🔧 **PHASE 5: EXECUTION ENGINE (Week 6)**

### **Step 5.1: Node Handler Registry**
**Duration**: 1 day  
**Dependencies**: Step 4.4  

**Tasks:**
1. Create WorkflowNodeRegistry
   ```typescript
   // packages/server/src/services/WorkflowNodeRegistry.ts
   export class WorkflowNodeRegistry {
     private handlers: Map<string, WorkflowNodeHandler> = new Map();
     
     register(handler: WorkflowNodeHandler): void
     getHandler(type: string): WorkflowNodeHandler | null
     getAllHandlers(): WorkflowNodeHandler[]
   }
   ```

2. Create base WorkflowNodeHandler interface
3. Initialize registry with built-in handlers

**Validation Criteria:**
- [ ] Registry can register/retrieve handlers
- [ ] Handler interface defined correctly
- [ ] Registry integrates with service layer

---

### **Step 5.2: Agent Node Handler**
**Duration**: 2 days  
**Dependencies**: Step 5.1  

**Tasks:**
1. Create AgentNodeHandler
   ```typescript
   export class AgentNodeHandler implements WorkflowNodeHandler {
     type = 'agent';
     
     async execute(node: WorkflowNode, context: WorkflowExecutionState): Promise<WorkflowNodeResult>
     validate(node: WorkflowNode): WorkflowValidationResult
     getVisualization(node: WorkflowNode): string
   }
   ```

2. Implement agent task execution
3. Add error handling and validation
4. Test with existing agent system

**Validation Criteria:**
- [ ] Can execute agent tasks via workflow
- [ ] Agent results captured correctly
- [ ] Error handling works properly
- [ ] Integrates with existing agent system

---

### **Step 5.3: Conditional Node Handler**
**Duration**: 2 days  
**Dependencies**: Step 5.2  

**Tasks:**
1. Create ConditionalNodeHandler with JSONata integration
   ```typescript
   export class ConditionalNodeHandler implements WorkflowNodeHandler {
     type = 'conditional';
     
     async execute(node: WorkflowNode, context: WorkflowExecutionState): Promise<WorkflowNodeResult> {
       const { sourceNodeId, expression, conditions } = node.parameters;
       
       // Get data from source node
       const sourceResult = context.previousResults.get(sourceNodeId);
       
       // Evaluate JSONata expression
       const expressionQuery = jsonata(expression);
       const expressionResult = await expressionQuery.evaluate(sourceResult?.data || {});
       
       // Check conditions
       for (const [conditionKey, conditionExpression] of Object.entries(conditions)) {
         const conditionQuery = jsonata(conditionExpression);
         const conditionMet = await conditionQuery.evaluate({ result: expressionResult });
         
         if (conditionMet) {
           return {
             success: true,
             data: { value: expressionResult, condition: conditionKey },
             nextEdgeCondition: conditionKey
           };
         }
       }
       
       return {
         success: true,
         data: { value: expressionResult, condition: 'default' },
         nextEdgeCondition: 'default'
       };
     }
   }
   ```

2. Add JSONata expression validation
3. Test with various conditional scenarios

**Validation Criteria:**
- [ ] JSONata expressions evaluate correctly
- [ ] Conditional routing works
- [ ] Complex expressions handled
- [ ] Error handling for invalid expressions

---

### **Step 5.4: User Prompt Node Handler**
**Duration**: 1 day  
**Dependencies**: Step 5.3  

**Tasks:**
1. Create UserPromptNodeHandler (structured decision points)
   ```typescript
   export class UserPromptNodeHandler implements WorkflowNodeHandler {
     type = 'user_prompt';
     
     async execute(node: WorkflowDSLNode, context: WorkflowExecutionState): Promise<WorkflowNodeResult> {
       // Create structured prompt with predefined choices
       const { promptText, choices } = node.parameters;
       
       // This creates structured decision points, different from free-form chat
       const prompt = await this.createStructuredPrompt(promptText, choices, context);
       
       // Wait for user selection (not free-form text)
       const userChoice = await this.waitForUserChoice(prompt.id);
       
       return {
         success: true,
         data: { userChoice, promptId: prompt.id },
         nextEdgeCondition: userChoice
       };
     }
   }
   ```

2. Implement structured user prompt creation (different from ExpeditionChat)
3. Add choice selection mechanism (not free-form text)
4. Test structured prompt-response flow

**Validation Criteria:**
- [ ] User prompts created correctly
- [ ] Workflow pauses for user input
- [ ] User responses processed properly
- [ ] Continues execution after response

---

### **Step 5.5: Workflow Execution Service**
**Duration**: 2 days  
**Dependencies**: Step 5.4  

**Tasks:**
1. Create WorkflowExecutionService
   ```typescript
   export class WorkflowExecutionService {
     async executeWorkflow(workflow: Workflow, state: ExpeditionState): Promise<void> {
       let currentNode = this.getStartNode(workflow);
       const executionResults: Map<string, WorkflowNodeResult> = new Map();
       
       const context: WorkflowExecutionState = {
         expeditionId: state.expeditionId,
         previousResults: executionResults,
         state: state,
         services: {
           agentService: this.agentService,
           userPromptService: this.userPromptService,
           dataService: this.dataService
         }
       };
       
       while (currentNode) {
         const handler = this.nodeRegistry.getHandler(currentNode.type);
         if (!handler) {
           throw new Error(`No handler found for node type: ${currentNode.type}`);
         }
         
         const result = await handler.execute(currentNode, context);
         executionResults.set(currentNode.id, result);
         
         if (!result.success) {
           console.error(`Node execution failed: ${result.error}`);
           // Handle failure
         }
         
         currentNode = this.getNextNode(workflow, currentNode, result.nextEdgeCondition);
       }
     }
   }
   ```

2. Implement graph traversal logic
3. Add execution state tracking
4. Add pause/resume functionality

**Validation Criteria:**
- [ ] Can execute complete workflows
- [ ] Graph traversal follows edges correctly
- [ ] Execution state tracked properly
- [ ] Error handling works throughout

---

## 🧪 **PHASE 6: INTEGRATION & TESTING (Week 7)**

### **Step 6.1: End-to-End Workflow Testing**
**Duration**: 2 days  
**Dependencies**: Step 5.5  

**Tasks:**
1. Create test expeditions with various complexity levels
2. Test complete workflow generation → approval → execution flow
3. Test conditional branching scenarios
4. Test user prompt interactions

**Validation Criteria:**
- [ ] Simple linear workflows execute successfully
- [ ] Complex workflows with conditionals work
- [ ] User interaction workflows complete
- [ ] Error scenarios handled gracefully

---

### **Step 6.2: Performance Testing & Optimization**
**Duration**: 1 day  
**Dependencies**: Step 6.1  

**Tasks:**
1. Test workflow generation performance
2. Test execution performance with large workflows
3. Optimize database queries
4. Optimize frontend rendering

**Validation Criteria:**
- [ ] Workflow generation < 10 seconds
- [ ] Node execution < 5 seconds average
- [ ] UI remains responsive during execution
- [ ] Database queries optimized

---

### **Step 6.3: Error Handling & Edge Cases**
**Duration**: 2 days  
**Dependencies**: Step 6.2  

**Tasks:**
1. Test workflow validation with invalid structures
2. Test JSONata expression errors
3. Test network failures during execution
4. Test user prompt timeouts

**Validation Criteria:**
- [ ] Invalid workflows rejected with clear errors
- [ ] JSONata errors handled gracefully
- [ ] Network failures don't crash execution
- [ ] Timeouts handled appropriately

---

## 📊 **VALIDATION CHECKPOINTS**

### **End of Phase 1: Foundation Complete**
- [ ] All dependencies installed
- [ ] Database schema created and tested
- [ ] Basic workflow generation working
- [ ] Repository layer functional

### **End of Phase 2: LangGraph Integration Complete**
- [ ] Workflow DSL nodes added to expedition flow
- [ ] State management updated
- [ ] Approval workflow interrupts execution
- [ ] Workflow edges route correctly

### **End of Phase 3: API Layer Complete**
- [ ] All workflow endpoints functional
- [ ] WebSocket events working
- [ ] Authentication integrated
- [ ] API documentation updated

### **End of Phase 4: Frontend Integration Complete**
- [ ] Workflow visualization renders correctly
- [ ] Approval modal functional
- [ ] Dashboard integration complete
- [ ] Real-time updates working

### **End of Phase 5: Execution Engine Complete**
- [ ] All node handlers implemented
- [ ] JSONata conditional evaluation working
- [ ] Workflow execution service functional
- [ ] Graph traversal correct

### **End of Phase 6: Integration & Testing Complete**
- [ ] End-to-end workflows executing successfully
- [ ] Performance meets requirements
- [ ] Error handling robust
- [ ] System ready for production

---

## 🎯 **Success Criteria**

**Technical Requirements:**
- [ ] Workflow generation < 10 seconds
- [ ] Node execution < 5 seconds average
- [ ] 95%+ execution accuracy following workflow
- [ ] Zero data corruption in workflow state

**User Experience Requirements:**
- [ ] Workflow visualization clear and readable
- [ ] Approval flow intuitive and fast
- [ ] Real-time updates responsive
- [ ] Error messages helpful and actionable

**System Integration Requirements:**
- [ ] No breaking changes to existing expedition flow
- [ ] Database migrations successful
- [ ] Performance impact < 10% on existing features
- [ ] All existing tests still passing

---

## 📊 **LIVE EXECUTION STATUS**

### **🎯 Current Status**
```yaml
status: COMPLETED
phase: PHASE_4_FRONTEND_INTEGRATION
current_step: "COMPLETED"
last_updated: "2025-08-08T15:45:00Z"
executor: claude
total_duration_estimate: "7 weeks"
```

### **⏱️ Execution State**
```yaml
execution:
  started_at: "2025-01-07T00:00:00Z"
  paused_at: null
  resumed_at: null
  current_phase: "PHASE_4_FRONTEND_INTEGRATION"
  current_step: "COMPLETED"
  completion_percentage: 100

progress:
  phase_1_foundation: 
    status: COMPLETED
    steps_completed: 5/5
    estimated_duration: "2 weeks"
  
  phase_2_langraph_integration:
    status: COMPLETED  
    steps_completed: 4/4
    estimated_duration: "1 week"
  
  phase_3_api_layer:
    status: COMPLETED
    steps_completed: 4/4  
    estimated_duration: "1 week"
  
  phase_4_frontend_integration:
    status: COMPLETED
    steps_completed: 4/4
    estimated_duration: "1 week"
  
  phase_5_execution_engine:
    status: PENDING
    steps_completed: 0/5
    estimated_duration: "1 week"
  
  phase_6_testing_integration:
    status: PENDING
    steps_completed: 0/3
    estimated_duration: "1 week"
```

### **🔧 Environment State**
```yaml
environment:
  repository_path: "/Users/brayn003/theingenuityco/starships.ai"
  git_branch: "chore/test-models"
  git_status: "clean"
  dependencies_installed: false
  database_migrations_run: false
  test_environment_ready: false
```

### **📝 Execution Log**
```yaml
execution_log: []
# Will contain entries like:
# - timestamp: "2024-12-27T10:30:00Z"
#   step: "1.1"
#   action: "STEP_STARTED"  
#   details: "Setup Dependencies & Environment"
#   duration: null
#   status: "IN_PROGRESS"
```

### **⚡ Quick References**
- **📋 Full Plan**: This document serves as the execution bible
- **🎯 Current Objective**: Ready to begin Phase 1 - Foundation
- **📍 Next Step**: Step 1.1 - Setup Dependencies & Environment
- **⏳ Time Allocation**: Each step has specific duration and validation criteria
- **🔄 Resumption**: Use this status section to understand current state and continue from any point

### **🚀 Execution Commands**
When ready to start:
1. **Begin Execution**: Start with Phase 1, Step 1.1
2. **Pause/Resume**: Update status accordingly in this section  
3. **Track Progress**: Update completion percentages and step statuses
4. **Log Activities**: Record all significant actions in execution_log

---

**Status**: ✅ Plan Complete with Linear Execution - Ready for Implementation  
**Last Updated**: December 2024  
**Estimated Total Duration**: 7 weeks

## 📦 **Dependencies**

```json
{
  "dependencies": {
    "jsonata": "^2.0.5"
  }
}
```

**Note**: JSONata v2.0.5+ includes built-in TypeScript definitions, so no separate `@types/jsonata` package is needed.

## 🚀 **Future Enhancements**

### **Advanced Features (Post-MVP)**
- **Parallel Execution**: Support for parallel workflow branches
- **Advanced Visualizations**: Interactive workflow editors
- **Workflow Templates**: Pre-built workflow patterns
- **Performance Analytics**: Workflow execution optimization
- **Advanced Conditionals**: ML-based routing decisions
- **Workflow Versioning**: Track workflow evolution over time

### **Integration Points**
- **External APIs**: Webhook nodes for external service integration
- **Data Transformations**: Advanced data processing nodes
- **Notification Systems**: Alert and notification nodes
- **Audit Logging**: Comprehensive workflow execution logs

## 🏗️ **Application Layers Affected**

This is a **major architectural change** that touches every layer of the application:

### **🗄️ Database Layer**
**New Tables Required:**
```sql
-- Core workflow storage
workflows (id, expedition_id, nodes, edges, visualization, approval_status, created_at, approved_at)

-- Workflow execution tracking
workflow_runtime_states (id, workflow_id, current_node_id, status, start_time, end_time)

-- Node execution results (optional - could use JSON in workflows table)
workflow_node_results (id, workflow_id, node_id, success, data, error, executed_at)
```

**Modified Tables:**
```sql
-- Add workflow_id to expeditions table for relationship
ALTER TABLE expeditions ADD COLUMN workflow_id VARCHAR(255) NULL;
ALTER TABLE expeditions ADD CONSTRAINT fk_expedition_workflow 
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL;

-- Remove old workflowState column from expeditions (cleanup)
ALTER TABLE expeditions DROP COLUMN workflowState;
```

### **🔧 Backend Services Layer**
**New Services:**
- `WorkflowExecutionService` - Core execution engine
- `WorkflowGenerationService` - LLM-powered DSL creation & validation  
- `WorkflowApprovalService` - User approval workflow management
- `WorkflowVisualizationService` - ASCII/diagram generation

**New Repositories:**
- `WorkflowRepository` - CRUD operations for workflows
- `WorkflowRuntimeStateRepository` - Execution state tracking

**Modified Services:**
- `ExpeditionService` - Add workflow DSL creation and approval steps, **remove old ExpeditionWorkflowState usage**
- `FirstOfficerService` - New workflow nodes: `createWorkflowDSLNode`, `userApprovalWorkflowNode`, **remove parallel execution support**
- `MessageService` - Handle workflow approval messages and user prompts

### **⚙️ Agent Engine Layer**
**Modified Components:**
- `FirstOfficerAgent` - Add workflow generation capabilities
- `ExpeditionWorkflow` (LangGraph) - New workflow nodes and state extensions
- Add new node handlers: `AgentNodeHandler`, `ConditionalNodeHandler`, `UserPromptNodeHandler`

**New Components:**
- `WorkflowNodeRegistry` - Registry pattern for node handlers
- `WorkflowDSLGenerator` - LLM integration for workflow creation
- JSONata integration for conditional evaluation

### **🌐 API Layer**
**New Endpoints:**
```typescript
// Workflow management
POST /api/expeditions/:id/workflow/approve
GET /api/expeditions/:id/workflow  
PUT /api/expeditions/:id/workflow
POST /api/expeditions/:id/workflow/visualize

// User prompts during execution
POST /api/expeditions/:id/user-prompt/:promptId/respond
GET /api/expeditions/:id/user-prompts/pending

// Execution monitoring
GET /api/expeditions/:id/workflow/execution-status
POST /api/expeditions/:id/workflow/pause
POST /api/expeditions/:id/workflow/resume
```

**Modified Endpoints:**
- `POST /api/expeditions/:id/start` - Now includes workflow approval step
- `GET /api/expeditions/:id` - Include workflow visualization data
- WebSocket events - New workflow-related events

### **🔌 WebSocket/Real-time Layer**
**Extended Expedition Event Types:**
```typescript
// Extend existing expedition events for workflow lifecycle
'expedition:workflow-dsl-generated' - DSL created, awaiting approval
'expedition:workflow-dsl-approved' - User approved workflow DSL
'expedition:workflow-dsl-rejected' - User rejected workflow DSL
'expedition:workflow-dsl-modified' - User modified workflow DSL

// Extend expedition events for execution tracking
'expedition:workflow-execution-started' - Workflow execution began
'expedition:workflow-node-executing' - Current node being processed
'expedition:workflow-node-completed' - Node finished execution
'expedition:workflow-conditional-evaluated' - Conditional decision made

// Extend expedition events for user interaction
'expedition:workflow-user-prompt-required' - User input needed during workflow
'expedition:workflow-user-prompt-responded' - User provided input to workflow
```

### **💻 Frontend/Client Layer**
**New Components:**
```typescript
// Workflow visualization
<WorkflowVisualization />
<WorkflowApprovalModal />
<WorkflowNodeDisplay />
<WorkflowEdgeDisplay />

// User interaction
<WorkflowUserPrompt />
<WorkflowApprovalButtons />
<WorkflowModificationInterface />

// Execution monitoring  
<WorkflowExecutionTracker />
<WorkflowProgressIndicator />
<WorkflowNodeStatus />
```

**Modified Components:**
- `ExpeditionCreation` - Add workflow approval step
- `ExpeditionDashboard` - Show workflow visualizations
- `ExpeditionChat` - Integrate workflow user prompts
- `ExpeditionProgress` - Track workflow node execution

**New Hooks:**
```typescript
useWorkflowApproval() - Handle workflow approval flow
useWorkflowExecution() - Track real-time execution
useWorkflowVisualization() - Manage diagram rendering
useUserPromptResponse() - Handle user interaction during execution
```

### **📱 State Management**
**New State Slices:**
```typescript
// Redux/Zustand stores
workflowSlice - Workflow data and approval state
workflowExecutionSlice - Real-time execution tracking
userPromptSlice - Pending user interactions
```

**Modified State:**
- `expeditionSlice` - Include workflow visualization data
- WebSocket state - New workflow event handlers

### **🔧 Configuration & Constants**
**Application Constants:**
```typescript
// Workflow-specific settings
export const WORKFLOW_CONFIG = {
  APPROVAL_TIMEOUT_MINUTES: 30,
  MAX_CONDITIONAL_DEPTH: 10,
  USER_PROMPT_TIMEOUT_MINUTES: 60,
  JSONATA_EXPRESSION_TIMEOUT_MS: 5000,
  MAX_WORKFLOW_NODES: 50,
  MAX_WORKFLOW_EDGES: 100
} as const;
```

### **📦 Build & Deployment**
**Database Migrations:**
- Create workflow tables
- Add workflow foreign keys to expeditions
- Data migration for existing expeditions

### **📊 Impact Summary**
| Layer | Impact Level | Changes Required |
|-------|-------------|------------------|
| **Database** | 🔴 High | New tables, migrations, schema changes |
| **Backend Services** | 🔴 High | New services, modified expedition flow |  
| **Agent Engine** | 🔴 High | New LangGraph nodes, workflow generation |
| **API Layer** | 🟡 Medium | New endpoints, modified existing ones |
| **WebSocket** | 🟡 Medium | New event types, enhanced existing events |
| **Frontend** | 🔴 High | New UI components, approval flow, visualization |
| **State Management** | 🟡 Medium | New state slices, modified existing state |
| **Configuration** | 🟢 Low | New dependencies, application constants |
| **Deployment** | 🟡 Medium | Database migrations |

### **✅ Implementation Clarifications (Resolved)**

#### **🤔 User Prompt Handling** 
**Simple Solution**: 
- **Pre-expedition prompts**: Use existing hardcoded prompts in `ExpeditionService.createExpedition()`
- **Workflow prompts**: Add `UserInteractionNode` types in workflow DSL for runtime user input
- **No changes needed**: Keep existing pre-expedition flow unchanged

#### **⚡ Sequential Execution Enforcement** 
**Simple Solution**:
- **LangGraph**: Remove parallel conditional edges in `ExpeditionWorkflow.ts:350-390`, use simple `.addEdge()` linear chain
- **DSL Schema**: Enforce `nextNode: string` (not array) in workflow DSL validation
- **Implementation**: Replace complex conditional routing with linear execution

#### **🧠 Memory Store Integration**
**Simple Solution**: Use hybrid approach - combine existing LangChainMemoryStore with shared workflow memory context passed between nodes

#### **⚠️ Error Handling Compatibility**
**Simple Solution**: Create new workflow-specific error classes extending existing ExpeditionWorkflowError and TaskExecutionError patterns

---

### **⚠️ Remaining Critical Considerations**
1. **Monitoring** - Need comprehensive observability for workflow execution

