# Mission Plan Phase - Architecture-Compliant Implementation Plan

## Overview

Implementation plan for adding a "plan" phase to the mission workflow, inserting between "analysis" and "converse" phases. This phase will break down missions into concrete tasks, assign them to agents, and require user approval before execution.

**Mission Flow Update:**
```
Current: init → welcome → analysis → converse
New:     init → welcome → analysis → **PLAN** → converse
```

This implementation follows existing architectural patterns to ensure consistency and maintainability.

## 1. Protocol Types - Pure Interfaces Only

### A. Update Mission Phase Enum (`packages/protocol/src/types/mission.ts`)

```typescript
// Update MissionPhase enum - add 'plan' phase
export type MissionPhase = 
  | 'init'
  | 'welcome'
  | 'analysis'
  | 'plan'        // NEW
  | 'converse';
```

### B. Add Plan Types (`packages/protocol/src/types/mission.ts`)

```typescript
// Core plan interfaces - keep pure, no helper functions
export interface MissionPlan {
  id: string;
  missionId: string;
  tasks: MissionTask[];
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalTimestamp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MissionTask {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  dependencies: string[]; // prerequisite task IDs
  deliverable: string;
  priority: 'low' | 'medium' | 'high';
}

// Request/Response types
export interface CreateMissionPlanRequest {
  missionId: string;
  tasks: Omit<MissionTask, 'id'>[];
}

export interface UpdateMissionPlanRequest {
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvalTimestamp?: string;
}

export interface MissionPlanResponse extends MissionPlan {
  agentAssignments: Record<string, string[]>; // Runtime calculation
}
```

## 2. Repository Layer - Following BaseRepository Pattern

### A. Create Dedicated Plan Repository (`packages/models/src/repositories/MissionPlanRepository.ts`)

```typescript
import { BaseRepository } from './BaseRepository';
import { getConnection } from '../connection';
import { 
  MissionPlan, 
  MissionTask,
  CreateMissionPlanRequest, 
  UpdateMissionPlanRequest 
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

export interface MissionPlanRepositoryInterface {
  createPlan(request: CreateMissionPlanRequest): Promise<MissionPlan>;
  getPlanByMissionId(missionId: string): Promise<MissionPlan | null>;
  updatePlan(missionId: string, updates: UpdateMissionPlanRequest): Promise<MissionPlan>;
  deletePlan(missionId: string): Promise<void>;
}

export class MissionPlanRepository extends BaseRepository implements MissionPlanRepositoryInterface {
  constructor() {
    super('MissionPlanRepository');
  }

  async createPlan(request: CreateMissionPlanRequest): Promise<MissionPlan> {
    return this.executeWithErrorHandling(async () => {
      // Validation following BaseRepository pattern
      this.validateRequired(request, ['missionId', 'tasks'], 'createPlan');
      
      if (!Array.isArray(request.tasks) || request.tasks.length === 0) {
        this.handleValidationError([{
          field: 'tasks',
          message: 'At least one task is required',
          value: request.tasks
        }], 'createPlan');
      }

      const connection = getConnection();
      const planId = uuidv4();
      const now = new Date().toISOString();

      // Check if mission exists
      const missionCheck = await connection.executeQuery(
        'MATCH (m:Mission {id: $missionId}) RETURN m.id as id',
        { missionId: request.missionId }
      );

      if (!missionCheck || missionCheck.length === 0) {
        this.handleNotFound('Mission', request.missionId, 'createPlan');
      }

      // Create plan using MERGE pattern (like MissionClarity)
      const planCypher = `
        MATCH (m:Mission {id: $missionId})
        MERGE (m)-[:HAS_PLAN]->(mp:MissionPlan {missionId: $missionId})
        ON CREATE SET 
          mp.id = $planId,
          mp.approvalStatus = 'pending',
          mp.createdAt = $now
        SET 
          mp.updatedAt = $now
        RETURN mp
      `;

      await connection.executeWrite(planCypher, { 
        missionId: request.missionId, 
        planId, 
        now 
      });

      // Clear existing tasks and create new ones
      await connection.executeWrite(`
        MATCH (mp:MissionPlan {missionId: $missionId})-[:CONTAINS_TASK]->(t:MissionTask)
        DETACH DELETE t
      `, { missionId: request.missionId });

      // Create tasks
      const tasks: MissionTask[] = [];
      for (const taskData of request.tasks) {
        const taskId = uuidv4();
        const task: MissionTask = {
          id: taskId,
          ...taskData
        };

        await connection.executeWrite(`
          MATCH (mp:MissionPlan {missionId: $missionId})
          CREATE (mp)-[:CONTAINS_TASK]->(t:MissionTask $taskProps)
        `, {
          missionId: request.missionId,
          taskProps: task
        });

        tasks.push(task);
      }

      return {
        id: planId,
        missionId: request.missionId,
        tasks,
        approvalStatus: 'pending',
        createdAt: now,
        updatedAt: now
      } as MissionPlan;
    }, 'createPlan', 'MissionPlan');
  }

  async getPlanByMissionId(missionId: string): Promise<MissionPlan | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'getPlanByMissionId');

      const connection = getConnection();
      
      const result = await connection.executeQuery(`
        MATCH (m:Mission {id: $missionId})-[:HAS_PLAN]->(mp:MissionPlan)
        OPTIONAL MATCH (mp)-[:CONTAINS_TASK]->(t:MissionTask)
        RETURN mp, collect(t) as tasks
      `, { missionId });

      if (!result || result.length === 0) return null;

      const { mp, tasks } = result[0];
      return { 
        ...mp, 
        tasks: tasks.filter(t => t !== null) 
      } as MissionPlan;
    }, 'getPlanByMissionId', 'MissionPlan', missionId);
  }

  async updatePlan(missionId: string, updates: UpdateMissionPlanRequest): Promise<MissionPlan> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'updatePlan');

      if (!updates || Object.keys(updates).length === 0) {
        this.handleValidationError([{
          field: 'updates',
          message: 'At least one field must be provided for update'
        }], 'updatePlan');
      }

      // Build SET clause following BaseRepository pattern
      const setClauses: string[] = ['mp.updatedAt = $updatedAt'];
      const params: any = {
        missionId,
        updatedAt: new Date().toISOString()
      };

      if (updates.approvalStatus !== undefined) {
        setClauses.push('mp.approvalStatus = $approvalStatus');
        params.approvalStatus = updates.approvalStatus;
      }

      if (updates.approvalTimestamp !== undefined) {
        setClauses.push('mp.approvalTimestamp = $approvalTimestamp');
        params.approvalTimestamp = updates.approvalTimestamp;
      }

      const connection = getConnection();
      const query = `
        MATCH (mp:MissionPlan {missionId: $missionId})
        SET ${setClauses.join(', ')}
        RETURN mp
      `;

      const result = await connection.executeWrite(query, params);

      if (!result || result.length === 0) {
        this.handleNotFound('MissionPlan', missionId, 'updatePlan');
      }

      // Return full plan with tasks
      return this.getPlanByMissionId(missionId) as Promise<MissionPlan>;
    }, 'updatePlan', 'MissionPlan', missionId);
  }

  async deletePlan(missionId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'deletePlan');

      const connection = getConnection();
      
      await connection.executeWrite(`
        MATCH (mp:MissionPlan {missionId: $missionId})
        OPTIONAL MATCH (mp)-[:CONTAINS_TASK]->(t:MissionTask)
        DETACH DELETE mp, t
      `, { missionId });
    }, 'deletePlan', 'MissionPlan', missionId);
  }
}
```

### B. Update Repository Factory (`packages/models/src/repositories/index.ts`)

```typescript
// Add to RepositoryFactory
export class RepositoryFactory {
  // ... existing methods

  static getMissionPlanRepository(): MissionPlanRepositoryInterface {
    return new MissionPlanRepository();
  }
}
```

## 3. Service Layer - Business Logic and Utilities

### A. Create Mission Plan Service (`packages/server/src/services/MissionPlanService.ts`)

```typescript
import { RepositoryFactory } from '@starships/models';
import { 
  MissionPlan, 
  MissionTask, 
  CreateMissionPlanRequest,
  UpdateMissionPlanRequest,
  MissionPlanResponse 
} from '@starships/protocol';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MissionPlanService {
  private static logger = Logger.getInstance();

  /**
   * Business logic helper - calculate agent assignments for UI display
   */
  static getAgentAssignments(plan: MissionPlan): Record<string, string[]> {
    return plan.tasks.reduce((assignments, task) => {
      if (!assignments[task.assignedAgentId]) {
        assignments[task.assignedAgentId] = [];
      }
      assignments[task.assignedAgentId].push(task.id);
      return assignments;
    }, {} as Record<string, string[]>);
  }

  /**
   * Convert dependency indices from AI response to task IDs
   */
  static convertDependencyIndices(tasks: any[]): Omit<MissionTask, 'id'>[] {
    const taskIds = tasks.map(() => uuidv4());
    
    return tasks.map((task, index) => ({
      title: task.title,
      description: task.description,
      assignedAgentId: task.assignedAgentId,
      dependencies: (task.dependencies || []).map((depIndex: number) => 
        taskIds[depIndex]
      ).filter(id => id),
      deliverable: task.deliverable,
      priority: task.priority || 'medium'
    }));
  }

  /**
   * Create mission plan
   */
  static async createPlan(request: CreateMissionPlanRequest): Promise<MissionPlan> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      return await planRepo.createPlan(request);
    } catch (error) {
      this.logger.error('Failed to create mission plan', {
        service: 'MissionPlanService',
        operation: 'createPlan',
        missionId: request.missionId
      }, error as Error);
      throw error;
    }
  }

  /**
   * Get plan with calculated agent assignments for API response
   */
  static async getPlanResponse(missionId: string): Promise<MissionPlanResponse | null> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      const plan = await planRepo.getPlanByMissionId(missionId);
      
      if (!plan) return null;

      return {
        ...plan,
        agentAssignments: this.getAgentAssignments(plan)
      };
    } catch (error) {
      this.logger.error('Failed to get mission plan response', {
        service: 'MissionPlanService',
        operation: 'getPlanResponse',
        missionId
      }, error as Error);
      throw error;
    }
  }

  /**
   * Update plan approval status
   */
  static async updatePlanApproval(missionId: string, approved: boolean): Promise<MissionPlan> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      const updates: UpdateMissionPlanRequest = {
        approvalStatus: approved ? 'approved' : 'rejected',
        approvalTimestamp: new Date().toISOString()
      };
      
      return await planRepo.updatePlan(missionId, updates);
    } catch (error) {
      this.logger.error('Failed to update plan approval', {
        service: 'MissionPlanService',
        operation: 'updatePlanApproval',
        missionId,
        approved
      }, error as Error);
      throw error;
    }
  }

  /**
   * Delete plan (for regeneration)
   */
  static async deletePlan(missionId: string): Promise<void> {
    try {
      const planRepo = RepositoryFactory.getMissionPlanRepository();
      await planRepo.deletePlan(missionId);
    } catch (error) {
      this.logger.error('Failed to delete mission plan', {
        service: 'MissionPlanService',
        operation: 'deletePlan',
        missionId
      }, error as Error);
      throw error;
    }
  }
}
```

### B. Create AI Plan Parsing Service (`packages/server/src/services/MissionPlanParsingService.ts`)

```typescript
import { MissionPlan, Agent } from '@starships/protocol';
import { MissionPlanService } from './MissionPlanService';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class MissionPlanParsingService {
  private static logger = Logger.getInstance();

  /**
   * Parse AI response and convert to MissionPlan
   * Moved from MissionOrchestratorAgent to follow separation of concerns
   */
  static parseAIResponse(aiResponse: string, missionId: string, agents: Agent[]): MissionPlan {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        throw new Error('Invalid task structure in AI response');
      }

      // Validate agent assignments
      const agentIds = agents.map(a => a.id);
      for (const task of parsed.tasks) {
        if (!agentIds.includes(task.assignedAgentId)) {
          throw new Error(`Invalid agent assignment: ${task.assignedAgentId}`);
        }
      }

      // Convert dependency indices to proper task structure
      const tasks = MissionPlanService.convertDependencyIndices(parsed.tasks);

      return {
        id: uuidv4(),
        missionId,
        tasks: tasks.map(task => ({ id: uuidv4(), ...task })),
        approvalStatus: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to parse AI plan response', {
        service: 'MissionPlanParsingService',
        operation: 'parseAIResponse',
        error: error instanceof Error ? error.message : String(error),
        response: aiResponse.substring(0, 500)
      });
      throw new Error('Failed to parse AI plan response');
    }
  }
}
```

## 4. Update Mission Orchestrator Agent - State-Driven Workflow

### A. Update State Annotation (`packages/server/src/services/MissionOrchestratorAgent.ts`)

```typescript
// Add plan to state annotation following existing pattern
const MissionChatStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec, // Standard messages handling
  missionId: Annotation<string>(),
  activePhase: Annotation<MissionPhase | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  }),
  isSystemInitiated: Annotation<boolean>({
    value: (x, y) => y ?? x,
    default: () => false
  }),
  metadata: Annotation<MissionMetadata | null>({
    value: (x, y) => y ?? x,
    default: () => null
  }),
  clarity: Annotation<MissionClarity | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  }),
  
  // ADDED: Plan data in state
  plan: Annotation<MissionPlan | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  })
});
```

### B. Update Workflow Graph

```typescript
export class MissionOrchestratorAgent {
  private async getGraph() {
    if (!this.compiledGraph) {
      this.compiledGraph = new StateGraph(MissionChatStateAnnotation)
        .addNode("context_builder", this.contextBuilderNode.bind(this))
        .addNode("welcome_phase", this.welcomePhaseNode.bind(this))
        .addNode("analysis_phase", this.analysisPhaseNode.bind(this))
        .addNode("plan_phase", this.planPhaseNode.bind(this))  // NEW
        .addNode("converse_phase", this.conversePhaseNode.bind(this))
        .addEdge(START, "context_builder")
        .addConditionalEdges(
          "context_builder",
          this.phaseRouterNode.bind(this),
          {
            init: "welcome_phase",
            welcome: "welcome_phase",
            analysis: "analysis_phase",
            plan: "plan_phase",      // NEW
            converse: "converse_phase"
          }
        )
        .addConditionalEdges(
          "welcome_phase",
          this.shouldContinueFromWelcome.bind(this),
          {
            continue: "analysis_phase",
            end: END
          }
        )
        .addConditionalEdges(
          "analysis_phase",
          this.shouldContinueFromAnalysis.bind(this),
          {
            continue: "analysis_phase",
            advance: "plan_phase",    // NEW: analysis → plan
            end: END
          }
        )
        .addConditionalEdges(
          "plan_phase",
          this.shouldContinueFromPlan.bind(this),
          {
            continue: "converse_phase",  // Plan approved → converse
            regenerate: "plan_phase",    // Plan rejected → stay in plan
            end: END
          }
        )
        .addEdge("converse_phase", END)
        .compile({ checkpointer: this.checkpointer });
    }
    
    return this.compiledGraph;
  }

  /**
   * Plan phase node - handles plan generation and presentation
   */
  private async planPhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    try {
      const { metadata, clarity } = state;
      
      if (!metadata) throw new Error('Missing metadata in state');
      
      // Get plan from state or generate new one
      let plan = state.plan;
      
      if (!plan || state.isSystemInitiated) {
        // Generate new plan
        plan = await this.generatePlan(metadata.mission.id, state);
        
        // Update mission phase in database to reflect transition
        const missionRepo = RepositoryFactory.getMissionRepository();
        await missionRepo.updateMission(metadata.mission.id, { phase: 'plan' });
      }
      
      // Present plan to user for approval
      const prompt = new MissionPromptBuilder({ ...state, plan }).buildPlanPresentationPrompt(plan);
      const responseContent = await this.callLLM(prompt);
      
      const aiMessage = this.createAIMessage(responseContent, state);
      
      // Save message via callback
      if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
        await this.currentCallbacks.onMessageGenerated(aiMessage, 'plan_phase', this.currentMissionId);
      }
      
      return {
        messages: [aiMessage],
        plan,
        activePhase: 'plan',
        metadata: {
          ...metadata,
          mission: { ...metadata.mission, phase: 'plan' }
        }
      };
    } catch (error) {
      this.logger.error('Plan phase failed', { error });
      return { activePhase: 'analysis', isSystemInitiated: true };
    }
  }

  /**
   * Generate plan using dedicated services
   */
  private async generatePlan(missionId: string, state: MissionChatState): Promise<MissionPlan> {
    // Get available agents
    const agents = await this.getAssignedAgents(missionId);
    
    // Build planning prompt
    const prompt = new MissionPromptBuilder(state).buildPlanGenerationPrompt(agents);
    
    // Generate plan using AI
    const aiResponse = await this.callLLM(prompt);
    
    // Parse using dedicated parsing service
    const parsedPlan = MissionPlanParsingService.parseAIResponse(aiResponse, missionId, agents);
    
    // Save using service
    const createRequest: CreateMissionPlanRequest = {
      missionId,
      tasks: parsedPlan.tasks.map(task => {
        const { id, ...taskData } = task;
        return taskData;
      })
    };
    
    return await MissionPlanService.createPlan(createRequest);
  }

  /**
   * Conditional routing from analysis phase
   */
  private shouldContinueFromAnalysis(state: MissionChatState): string {
    const clarity = state.clarity;
    
    if (!clarity) return 'end';
    
    // If clarity threshold met, advance to plan phase
    if (clarity.overallScore >= MissionOrchestratorAgent.CLARITY_THRESHOLD || 
        clarity.iteration >= MissionOrchestratorAgent.MAX_CLARITY_ITERATIONS) {
      return 'advance'; // → plan_phase
    }
    
    return 'end';
  }

  /**
   * Conditional routing from plan phase
   */
  private shouldContinueFromPlan(state: MissionChatState): string {
    const plan = state.plan;
    
    if (!plan) return 'end';
    
    if (plan.approvalStatus === 'approved') {
      return 'continue'; // → converse_phase
    }
    
    if (plan.approvalStatus === 'rejected') {
      return 'regenerate'; // → plan_phase (regenerate)
    }
    
    return 'end'; // pending - wait for user input
  }
}
```

## 5. Update Prompt Builder - Add Plan Prompts

### A. Add Plan Instructions (`packages/server/src/prompts/MissionPromptBuilder.ts`)

```typescript
export const SYSTEM_INSTRUCTIONS = {
  // ... existing instructions

  PLAN_GENERATION: `You are Commander ARIA creating a detailed execution plan for this mission.

INSTRUCTIONS:
1. Break down the mission into 3-8 concrete, actionable tasks
2. Assign each task to the most suitable agent based on their capabilities
3. Identify task dependencies (which tasks must complete before others)
4. Ensure each task has a clear, measurable deliverable
5. Set appropriate priority levels

AVAILABLE AGENTS:
{agentList}

MISSION CONTEXT:
{missionContext}

CLARITY ASSESSMENT:
{clarityData}

Respond with ONLY this JSON format:
{
  "tasks": [
    {
      "title": "Clear, actionable task title (max 100 chars)",
      "description": "Detailed description of what needs to be done and how",
      "assignedAgentId": "agent-id-from-available-list", 
      "dependencies": [0, 1], // Use array indices for dependencies
      "deliverable": "Specific expected output or result",
      "priority": "high|medium|low"
    }
  ],
  "reasoning": "Brief explanation of the plan structure and task assignments"
}

IMPORTANT:
- Use task array indices (0, 1, 2...) for dependencies, not task IDs
- Each task must be assignable to ONE agent
- Dependencies must form a valid sequence (no circular dependencies)
- Focus on clear, actionable tasks with measurable outcomes`,

  PLAN_PRESENTATION: `Present the generated execution plan to the user for approval.

CURRENT PLAN:
{planData}

INSTRUCTIONS:
1. Provide a clear overview of the plan structure
2. Explain the task sequence and why it makes sense
3. Highlight the agent assignments and their roles
4. Show key dependencies and workflow
5. Ask for user approval to proceed with execution

Be encouraging and explain how this plan achieves their mission goals.
Use a professional but friendly tone as Commander ARIA.

End with: "Would you like me to proceed with this execution plan? You can approve it to begin execution, or ask me to modify any aspects you'd like changed."`
};

// Add plan-specific methods
export class MissionPromptBuilder {
  /**
   * Build plan generation prompt
   */
  buildPlanGenerationPrompt(agents: Agent[]): LLMChatPrompt {
    const systemPrompt = SYSTEM_INSTRUCTIONS.PLAN_GENERATION
      .replace('{agentList}', this.buildAgentListSection(agents))
      .replace('{missionContext}', this.buildMissionSection())
      .replace('{clarityData}', this.buildClaritySection());

    return {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };
  }

  /**
   * Build plan presentation prompt
   */
  buildPlanPresentationPrompt(plan: MissionPlan): LLMChatPrompt {
    const systemPrompt = SYSTEM_INSTRUCTIONS.PLAN_PRESENTATION
      .replace('{planData}', this.buildPlanDataSection(plan));

    return {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };
  }

  private buildAgentListSection(agents: Agent[]): string {
    return agents.map(agent => {
      const capabilities = agent.categories?.join(', ') || 'General';
      return `├─ ${agent.id}: ${agent.name} (${capabilities})\n   └─ ${agent.description || 'No description available'}`;
    }).join('\n');
  }

  private buildPlanDataSection(plan: MissionPlan): string {
    const agentAssignments = MissionPlanService.getAgentAssignments(plan);
    const dependencyCount = plan.tasks.reduce((total, task) => total + task.dependencies.length, 0);

    let planText = `EXECUTION PLAN OVERVIEW:
├─ Total Tasks: ${plan.tasks.length}
├─ Total Dependencies: ${dependencyCount}
└─ Agents Involved: ${Object.keys(agentAssignments).length}

TASK BREAKDOWN:`;

    plan.tasks.forEach((task, index) => {
      const depText = task.dependencies.length > 0 
        ? ` (depends on: ${task.dependencies.join(', ')})`
        : '';
      
      planText += `
${index + 1}. ${task.title}
   ├─ Agent: ${task.assignedAgentId}
   ├─ Priority: ${task.priority}
   ├─ Deliverable: ${task.deliverable}${depText}
   └─ Description: ${task.description}`;
    });

    planText += '\n\nAGENT ASSIGNMENTS:';
    Object.entries(agentAssignments).forEach(([agentId, taskIds]) => {
      planText += `\n├─ ${agentId}: ${taskIds.length} task(s)`;
    });

    return planText;
  }
}
```

## 6. API Routes - Following Existing Error Handling Pattern

### A. Add Plan Routes (`packages/server/src/routes/missions.ts`)

```typescript
import { MissionPlanService } from '../services/MissionPlanService';
import { MissionOrchestratorService } from '../services/MissionOrchestratorService';

/**
 * GET /missions/:id/plan
 * Get mission plan details
 */
router.get('/:id/plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    validateUUID(id, 'id');

    const planResponse = await MissionPlanService.getPlanResponse(id);

    if (!planResponse) {
      res.status(404).json({
        success: false,
        error: 'Plan not found',
        code: 'PLAN_NOT_FOUND'
      });
      return;
    }

    res.json({ 
      success: true, 
      data: planResponse 
    });

  } catch (error) {
    console.error('Error fetching mission plan:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ 
        success: false, 
        error: error.message,
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ 
        success: false, 
        error: error.message,
        code: 'PLAN_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * POST /missions/:id/approve-plan
 * Approve or reject mission plan - triggers state transition via orchestrator
 */
router.post('/:id/approve-plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { approved, reason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ 
        success: false, 
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }
    
    validateUUID(id, 'id');
    
    if (typeof approved !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'approved field must be a boolean',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    // Update plan approval using service
    await MissionPlanService.updatePlanApproval(id, approved);

    // Let orchestrator handle state transition (not manual database update)
    const orchestrator = MissionOrchestratorService.getInstance();
    const message = approved 
      ? 'I approve this execution plan. Please proceed.'
      : `I need changes to this plan. ${reason || 'Please revise and present an updated version.'}`;
    
    // This will trigger the workflow state transition
    await orchestrator.handleUserMessage(id, userId, message);

    res.json({ 
      success: true,
      data: {
        approved,
        message: approved 
          ? 'Plan approved, transitioning to execution phase' 
          : 'Plan rejected, generating revised plan'
      }
    });

  } catch (error) {
    console.error('Error approving mission plan:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ 
        success: false, 
        error: error.message,
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ 
        success: false, 
        error: error.message,
        code: 'PLAN_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * POST /missions/:id/regenerate-plan
 * Regenerate mission plan - uses orchestrator for state management
 */
router.post('/:id/regenerate-plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ 
        success: false, 
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    validateUUID(id, 'id');

    // Delete existing plan
    await MissionPlanService.deletePlan(id);

    // Let orchestrator handle regeneration (not manual phase update)
    const orchestrator = MissionOrchestratorService.getInstance();
    await orchestrator.handleUserMessage(id, userId, 'Please generate a new execution plan for this mission.');

    res.json({ 
      success: true,
      data: { message: 'Plan regeneration initiated' }
    });

  } catch (error) {
    console.error('Error regenerating mission plan:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ 
        success: false, 
        error: error.message,
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ 
        success: false, 
        error: error.message,
        code: 'PLAN_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});
```

## 7. Frontend Implementation - WebSocket Integration

### A. Mission API Client (`packages/client/src/lib/missionApi.ts`)

```typescript
import { MissionPlanResponse } from '@starships/protocol';

export async function getMissionPlan(missionId: string): Promise<MissionPlanResponse> {
  const response = await fetch(`${API_BASE_URL}/missions/${missionId}/plan`);
  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to get mission plan');
  }
  
  return result.data;
}

export async function approveMissionPlan(missionId: string, approved: boolean, reason?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/missions/${missionId}/approve-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved, reason }),
  });
  
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to update plan approval');
  }
}

export async function regenerateMissionPlan(missionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/missions/${missionId}/regenerate-plan`, {
    method: 'POST',
  });
  
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to regenerate plan');
  }
}
```

### B. Plan Phase Component (`packages/client/src/components/missions/PlanPhaseContent.tsx`)

```typescript
import React, { useState, useEffect } from 'react';
import { Mission, MissionPlanResponse } from '@starships/protocol';
import { getMissionPlan, approveMissionPlan, regenerateMissionPlan } from '../../lib/missionApi';
import { useSocketConnection } from '../../hooks/useSocketConnection';

interface PlanPhaseContentProps {
  mission: Mission;
  onPlanApproval: (approved: boolean) => void;
}

export function PlanPhaseContent({ mission, onPlanApproval }: PlanPhaseContentProps) {
  const [plan, setPlan] = useState<MissionPlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use WebSocket for real-time updates instead of polling
  const { socket } = useSocketConnection();

  useEffect(() => {
    loadPlan();
  }, [mission.id]);

  useEffect(() => {
    if (socket) {
      // Listen for real-time plan updates
      socket.on('mission:plan:updated', (data: { missionId: string; plan: MissionPlanResponse }) => {
        if (data.missionId === mission.id) {
          setPlan(data.plan);
        }
      });

      // Listen for phase transitions
      socket.on('mission:phase:changed', (data: { missionId: string; newPhase: string }) => {
        if (data.missionId === mission.id && data.newPhase === 'converse') {
          onPlanApproval(true);
        }
      });

      return () => {
        socket.off('mission:plan:updated');
        socket.off('mission:phase:changed');
      };
    }
  }, [socket, mission.id, onPlanApproval]);

  const loadPlan = async () => {
    try {
      setLoading(true);
      setError(null);
      const planData = await getMissionPlan(mission.id);
      setPlan(planData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approved: boolean) => {
    if (!plan) return;
    
    try {
      setActionLoading(true);
      await approveMissionPlan(mission.id, approved);
      // Don't call onPlanApproval here - wait for WebSocket event
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update approval');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setActionLoading(true);
      await regenerateMissionPlan(mission.id);
      // Plan will be updated via WebSocket
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate plan');
    } finally {
      setActionLoading(false);
    }
  };

  // ... rest of component implementation (loading states, error handling, UI rendering)
  
  return (
    <div className="space-y-6">
      {/* Plan visualization components */}
    </div>
  );
}
```

## 8. Architecture Compliance Summary

### ✅ **Pattern Adherence Fixed**

1. **Protocol Types**: Pure interfaces only, no business logic
2. **Repository Pattern**: Extends BaseRepository, follows CRUD patterns
3. **Service Layer**: Business logic separated into dedicated services
4. **State Management**: LangGraph handles transitions, not manual DB updates
5. **Error Handling**: Consistent with existing route patterns
6. **Real-time Updates**: WebSocket events instead of page reloads

### ✅ **Key Architectural Principles**

- **Separation of Concerns**: Parsing, business logic, and data access separated
- **State-Driven Workflow**: Orchestrator agent manages phase transitions
- **Service-Oriented**: Reusable services for plan operations
- **Error Resilience**: Comprehensive error handling following existing patterns
- **Real-time Communication**: WebSocket integration for live updates

### ✅ **Implementation Benefits**

- **Maintainable**: Follows established patterns consistently
- **Testable**: Clear separation enables unit testing
- **Scalable**: Service-oriented architecture supports growth
- **User-Friendly**: Real-time updates without page refreshes
- **Type-Safe**: Proper TypeScript interfaces throughout

This architecture-compliant approach ensures the plan phase integrates seamlessly with the existing codebase while maintaining consistency and best practices.