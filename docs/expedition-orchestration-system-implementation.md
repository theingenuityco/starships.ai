# Expedition Orchestration System - Complete Implementation Prompt

## Project Overview
Build an expedition system for starships.ai where expeditions are created and managed at the starship level. Each starship has its own expeditions that are coordinated by a First Officer agent using LangGraph workflows with hierarchical coordination, integrated with the existing chat system through a hybrid approach.

## FINALIZED ARCHITECTURE DECISIONS
Based on detailed analysis and clarification:
- **First Officer Coordination**: LangGraph workflows with Hierarchical Coordination Model
- **Agent Integration**: Hybrid Chat Integration (LangGraph + existing chat system)
- **State Management**: Simple transitions (idle → in-progress → done/failed)
- **User Interface**: Single Unified Chat with message threading/tagging
- **LLM Infrastructure**: Use existing ProviderFactory.getProvider() with structured prompts
- **Agent Selection**: Rule-based keyword matching + LLM refinement and validation
- **Execution Strategy**: Parallel execution for independent tasks
- **Quality Control**: Validate responses against requirements with retry logic

## Current Infrastructure Assessment

### ✅ EXISTING STRENGTHS
1. **Starship-Centric Architecture**: All operations scoped to individual starships
2. **Starship Navigation**: `/ship/[slug]/expeditions` already exists in navigation
3. **Crew Management**: Each starship has deployed agents (crew members)
4. **Starship Entity**: Already tracks `activeExpeditions: number`
5. **Real-time Chat**: Working Socket.IO infrastructure for agent conversations
6. **Agent Data**: Existing tags, categories, ratings for crew selection
7. **LangChain Foundation**: Existing agent-engine with memory and context support

### ❌ CRITICAL GAPS IDENTIFIED

## CORRECT USER FLOW (Starship-Level)

### Navigation Flow
Fleet Command (/ships) → Select Starship → Starship Expeditions (/ship/[slug]/expeditions) → Individual Expedition Chat

### Detailed User Journey
1. **Fleet Command Page** (`/ships`)
   - User sees all their starships
   - Clicks on a starship to enter its command interface

2. **Starship Command Deck** (`/ship/[slug]/command-deck`)
   - Shows starship overview including active expeditions
   - Navigation to expeditions module

3. **Starship Expeditions Page** (`/ship/[slug]/expeditions`)
   - List of all expeditions for this specific starship
   - "Create New Expedition" button
   - Shows expedition status (idle, in-progress, done, failed)
   - Uses starship's deployed crew for expeditions

4. **Individual Expedition Chat** (`/ship/[slug]/expeditions/[expeditionId]`)
   - Single unified chat interface with First Officer coordination
   - Message threading to distinguish First Officer vs agent conversations
   - Users can chat with individual agents during expeditions
   - Real-time LangGraph workflow progress

## EXPEDITION STATES & SCHEMA

### Starship-Level Database Schema
Add to `packages/models/src/types.ts`:

```typescript
export interface Expedition {
  id: string;
  starshipId: string; // Belongs to specific starship, not user directly
  title: string;
  requirements: string; // Natural language input from user
  status: 'idle' | 'in-progress' | 'done' | 'failed';
  assignedAgents: string[]; // Agent IDs from starship's deployed crew
  workflowState?: any; // LangGraph state persistence
  chatHistory: ExpeditionMessage[];
  result?: string; // Final expedition outcome
  createdAt: string;
  updatedAt: string;
}

export interface ExpeditionMessage {
  id: string;
  role: 'user' | 'first-officer' | 'agent';
  agentId?: string; // For agent messages
  content: string;
  messageType: 'coordination' | 'agent-work' | 'user-input';
  timestamp: string;
  threadId?: string; // For message threading
}

export interface ExpeditionRepository {
  findByStarship(starshipId: string): Promise<Expedition[]>;
  create(expedition: Omit<Expedition, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expedition>;
  updateStatus(id: string, status: Expedition['status']): Promise<Expedition | null>;
  updateWorkflowState(id: string, state: any): Promise<Expedition | null>;
  addMessage(expeditionId: string, message: ExpeditionMessage): Promise<void>;
}
```

### State Transitions & Rules
- **idle**: Expedition created, no active chat, can be continued
- **in-progress**: Active LangGraph workflow + chat coordination happening
- **done**: Successfully completed, chat becomes read-only
- **failed**: Failed/abandoned, chat becomes read-only

### Integration with Existing Starship System
- Expeditions belong to specific starships (not users directly)
- Use starship's deployed agents as available crew
- Update `starship.activeExpeditions` count when status changes
- Respect starship class limits (scout=3, cruiser=6 agents)

## DETAILED IMPLEMENTATION PLAN

### Phase 1: LangGraph First Officer Foundation (Week 1)

#### 1. Enhanced Dependencies
Update `packages/agent-engine/package.json`:

```json
{
  "dependencies": {
    "@langchain/langgraph": "^0.2.x",
    "rxjs": "^7.8.x",
    "@langchain/core": "^0.3.62"
  }
}
```

#### 2. Complete FirstOfficerAgent Implementation
Create `packages/agent-engine/src/first-officer/FirstOfficerAgent.ts`:

```typescript
import { StateGraph } from "@langchain/langgraph";
import { ProviderFactory } from "../llm/provider-factory";
import { buildPrompt } from "../prompt/builder";
import { ChatCoordinator } from "./ChatCoordinator";
import { Agent } from "@starships/protocol";

export interface ExpeditionState {
  requirements: string;
  taskBreakdown: TaskBreakdown[];
  agentAssignments: Record<string, string[]>;
  agentResults: Record<string, string>;
  finalResult: string | null;
  currentPhase: 'analyzing' | 'decomposing' | 'assigning' | 'coordinating' | 'synthesizing';
  analysis?: any;
  expeditionId: string;
  userId: string;
}

export interface TaskBreakdown {
  id: string;
  description: string;
  requiredSkills: string[];
  assignedAgentId?: string;
  status: 'pending' | 'in-progress' | 'completed';
  result?: string;
  deliverable: string;
  dependencies: string[];
}

export class FirstOfficerAgent {
  private workflow: StateGraph;
  private starshipId: string;
  private availableCrew: Agent[];
  private chatCoordinator: ChatCoordinator;
  
  constructor(starshipId: string, crew: Agent[]) {
    this.starshipId = starshipId;
    this.availableCrew = crew;
    this.chatCoordinator = new ChatCoordinator();
    this.workflow = this.buildHierarchicalWorkflow();
  }
  
  private buildHierarchicalWorkflow() {
    const workflow = new StateGraph({
      channels: {
        requirements: { value: null },
        taskBreakdown: { value: [] },
        agentAssignments: { value: {} },
        agentResults: { value: {} },
        finalResult: { value: null },
        currentPhase: { value: 'analyzing' },
        analysis: { value: null },
        expeditionId: { value: null },
        userId: { value: null }
      }
    });
    
    // Hierarchical workflow nodes
    workflow.addNode("analyze_requirements", this.analyzeRequirements.bind(this));
    workflow.addNode("decompose_tasks", this.decomposeTasks.bind(this));
    workflow.addNode("select_specialists", this.selectSpecialists.bind(this));
    workflow.addNode("coordinate_agents", this.coordinateAgents.bind(this));
    workflow.addNode("synthesize_results", this.synthesizeResults.bind(this));
    
    // Workflow edges
    workflow.addEdge("analyze_requirements", "decompose_tasks");
    workflow.addEdge("decompose_tasks", "select_specialists");
    workflow.addEdge("select_specialists", "coordinate_agents");
    workflow.addEdge("coordinate_agents", "synthesize_results");
    
    return workflow.compile();
  }
  
  async startExpedition(requirements: string, expeditionId: string, userId: string): Promise<string> {
    const result = await this.workflow.invoke({
      requirements,
      taskBreakdown: [],
      agentAssignments: {},
      agentResults: {},
      finalResult: null,
      currentPhase: 'analyzing',
      analysis: null,
      expeditionId,
      userId
    });
    
    return result.finalResult;
  }
  
  // 1. ANALYZE REQUIREMENTS NODE
  private async analyzeRequirements(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    const provider = await ProviderFactory.getProvider('first-officer-agent');
    
    const analysisPrompt = buildPrompt(
      `You are a First Officer analyzing expedition requirements for a starship crew.
      
      STARSHIP CONTEXT:
      - Starship ID: ${this.starshipId}
      - Available Crew: ${this.availableCrew.length} agents
      - Crew Categories: ${this.getCrewCategories()}
      
      TASK: Analyze the following requirements and identify:
      1. Main objective and scope
      2. Key deliverables expected
      3. Complexity level (simple/moderate/complex)
      4. Estimated effort required
      5. Success criteria
      
      Requirements: "${state.requirements}"
      
      Provide analysis in JSON format:
      {
        "objective": "main goal",
        "deliverables": ["deliverable1", "deliverable2"],
        "complexity": "moderate",
        "effort": "estimated hours/days",
        "successCriteria": ["criteria1", "criteria2"]
      }`,
      [],
      state.requirements
    );
    
    const result = await provider.complete(analysisPrompt);
    const analysis = JSON.parse(result.reply);
    
    return { 
      currentPhase: 'decomposing',
      analysis 
    };
  }
  
  // 2. DECOMPOSE TASKS NODE
  private async decomposeTasks(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    const provider = await ProviderFactory.getProvider('first-officer-agent');
    
    const decompositionPrompt = buildPrompt(
      `You are a First Officer breaking down expedition requirements into specific tasks.
      
      REQUIREMENTS ANALYSIS:
      ${JSON.stringify(state.analysis, null, 2)}
      
      AVAILABLE CREW CATEGORIES:
      ${this.getCrewCategoriesWithSkills()}
      
      TASK: Break down the requirements into 3-6 specific, actionable tasks that can be assigned to crew members.
      
      For each task, specify:
      1. Clear description of what needs to be done
      2. Required skills/expertise
      3. Expected deliverable format
      4. Dependencies on other tasks (if any)
      
      Provide breakdown in JSON format:
      {
        "tasks": [
          {
            "id": "task_1",
            "description": "specific task description",
            "requiredSkills": ["skill1", "skill2"],
            "deliverable": "what should be produced",
            "dependencies": ["task_id"] // empty array if no dependencies
          }
        ]
      }`,
      [],
      state.requirements
    );
    
    const result = await provider.complete(decompositionPrompt);
    const breakdown = JSON.parse(result.reply);
    
    return { 
      currentPhase: 'assigning',
      taskBreakdown: breakdown.tasks 
    };
  }
  
  // 3. SELECT SPECIALISTS NODE (Rule-based + LLM Refinement)
  private async selectSpecialists(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    const assignments: Record<string, string[]> = {};
    
    for (const task of state.taskBreakdown) {
      // RULE-BASED INITIAL MATCHING
      const candidateAgents = this.ruleBasedAgentMatching(task);
      
      // LLM REFINEMENT AND VALIDATION
      const provider = await ProviderFactory.getProvider('first-officer-agent');
      
      const selectionPrompt = buildPrompt(
        `You are a First Officer selecting the best crew member for a specific task.
        
        TASK DETAILS:
        ${JSON.stringify(task, null, 2)}
        
        CANDIDATE AGENTS (from rule-based matching):
        ${candidateAgents.map(agent => `
        - ${agent.name} (${agent.category})
          Skills: ${agent.tags.join(', ')}
          Description: ${agent.description}
          Usage Count: ${agent.usageCount}
          Rating: ${agent.rating || 'N/A'}
        `).join('\n')}
        
        TASK: Select the BEST agent for this task and explain why.
        
        Consider:
        1. Skill match with required capabilities
        2. Agent experience (usage count)
        3. Agent rating/performance
        4. Workload balance across crew
        
        Respond in JSON format:
        {
          "selectedAgentId": "agent_id",
          "reasoning": "why this agent is best suited",
          "confidence": 0.85
        }`,
        [],
        `Select agent for: ${task.description}`
      );
      
      const result = await provider.complete(selectionPrompt);
      const selection = JSON.parse(result.reply);
      
      assignments[task.id] = [selection.selectedAgentId];
    }
    
    return { 
      currentPhase: 'coordinating',
      agentAssignments: assignments 
    };
  }
  
  // 4. COORDINATE AGENTS NODE (Parallel Execution)
  private async coordinateAgents(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    const agentResults: Record<string, string> = {};
    
    // PARALLEL EXECUTION OF INDEPENDENT TASKS
    const taskPromises = state.taskBreakdown.map(async (task) => {
      const agentId = state.agentAssignments[task.id][0];
      
      // Create task-specific prompt for the agent
      const taskPrompt = `
EXPEDITION TASK ASSIGNMENT

CONTEXT:
- You are part of an expedition coordinated by the First Officer
- Your specific role: ${task.description}
- Expected deliverable: ${task.deliverable}

REQUIREMENTS:
${state.requirements}

TASK DETAILS:
${JSON.stringify(task, null, 2)}

Please complete your assigned task and provide a comprehensive response that addresses all requirements.
      `;
      
      try {
        // Use existing chat system through ChatCoordinator
        const result = await this.chatCoordinator.coordinateAgentWork(
          agentId,
          taskPrompt,
          {
            expeditionId: state.expeditionId,
            starshipId: this.starshipId,
            userId: state.userId
          }
        );
        
        return { taskId: task.id, result };
      } catch (error) {
        console.error(`Task ${task.id} failed:`, error);
        return { taskId: task.id, result: `Task failed: ${error.message}` };
      }
    });
    
    // Wait for all parallel tasks to complete
    const results = await Promise.all(taskPromises);
    
    // Collect results
    results.forEach(({ taskId, result }) => {
      agentResults[taskId] = result;
    });
    
    // QUALITY VALIDATION WITH RETRY LOGIC
    const validatedResults = await this.validateAndRetryResults(
      state.taskBreakdown,
      agentResults,
      state.requirements,
      state
    );
    
    return { 
      currentPhase: 'synthesizing',
      agentResults: validatedResults 
    };
  }
  
  // 5. SYNTHESIZE RESULTS NODE
  private async synthesizeResults(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    const provider = await ProviderFactory.getProvider('first-officer-agent');
    
    const synthesisPrompt = buildPrompt(
      `You are a First Officer synthesizing expedition results from multiple crew members.
      
      ORIGINAL REQUIREMENTS:
      ${state.requirements}
      
      TASK BREAKDOWN:
      ${state.taskBreakdown.map(task => `
      Task: ${task.description}
      Expected: ${task.deliverable}
      `).join('\n')}
      
      CREW RESULTS:
      ${Object.entries(state.agentResults).map(([taskId, result]) => {
        const task = state.taskBreakdown.find(t => t.id === taskId);
        return `
        Task: ${task?.description}
        Agent Result: ${result}
        `;
      }).join('\n')}
      
      TASK: Create a comprehensive final result that:
      1. Integrates all crew member contributions
      2. Addresses the original requirements completely
      3. Provides actionable recommendations
      4. Highlights key insights and findings
      5. Notes any limitations or areas for follow-up
      
      Format as a professional expedition report.`,
      [],
      'Synthesize expedition results'
    );
    
    const result = await provider.complete(synthesisPrompt);
    
    return { 
      finalResult: result.reply,
      currentPhase: 'completed' 
    };
  }
  
  // HELPER METHODS
  
  private ruleBasedAgentMatching(task: TaskBreakdown): Agent[] {
    const candidates: Agent[] = [];
    
    // Rule-based keyword matching
    const taskLower = task.description.toLowerCase();
    const skillsLower = task.requiredSkills.map(s => s.toLowerCase());
    
    for (const agent of this.availableCrew) {
      let score = 0;
      
      // Category matching
      if (taskLower.includes('code') || taskLower.includes('develop') || taskLower.includes('program')) {
        if (agent.category === 'coding') score += 3;
      }
      if (taskLower.includes('creative') || taskLower.includes('design') || taskLower.includes('write')) {
        if (agent.category === 'creative') score += 3;
      }
      if (taskLower.includes('analyze') || taskLower.includes('research') || taskLower.includes('data')) {
        if (agent.category === 'analysis') score += 3;
      }
      
      // Tag/skill matching
      for (const skill of skillsLower) {
        if (agent.tags.some(tag => tag.toLowerCase().includes(skill))) {
          score += 2;
        }
      }
      
      // General agents can handle any task (lower priority)
      if (agent.category === 'general') score += 1;
      
      if (score > 0) {
        candidates.push(agent);
      }
    }
    
    // Sort by score and return top candidates
    return candidates.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3);
  }
  
  private async validateAndRetryResults(
    tasks: TaskBreakdown[],
    results: Record<string, string>,
    originalRequirements: string,
    state: ExpeditionState
  ): Promise<Record<string, string>> {
    const validatedResults: Record<string, string> = {};
    
    for (const task of tasks) {
      const result = results[task.id];
      
      // Quality validation using LLM
      const provider = await ProviderFactory.getProvider('first-officer-agent');
      
      const validationPrompt = buildPrompt(
        `You are a First Officer validating crew member work quality.
        
        ORIGINAL REQUIREMENTS: ${originalRequirements}
        
        TASK ASSIGNED:
        ${JSON.stringify(task, null, 2)}
        
        AGENT RESPONSE:
        ${result}
        
        VALIDATION CRITERIA:
        1. Does the response address the task requirements?
        2. Is the response complete and actionable?
        3. Does it align with the original expedition goals?
        4. Is the quality acceptable for expedition standards?
        
        Respond in JSON format:
        {
          "isValid": true/false,
          "qualityScore": 0.85,
          "issues": ["issue1", "issue2"], // empty if valid
          "improvementNeeded": "specific guidance for revision"
        }`,
        [],
        'Validate agent response quality'
      );
      
      const validation = JSON.parse((await provider.complete(validationPrompt)).reply);
      
      if (validation.isValid && validation.qualityScore >= 0.7) {
        validatedResults[task.id] = result;
      } else {
        // RETRY WITH IMPROVEMENT GUIDANCE
        console.log(`Requesting revision for task ${task.id}: ${validation.improvementNeeded}`);
        
        const revisionPrompt = `
REVISION REQUEST

Your previous response needs improvement. Here's the feedback:

ISSUES IDENTIFIED:
${validation.issues.join('\n- ')}

IMPROVEMENT NEEDED:
${validation.improvementNeeded}

ORIGINAL TASK:
${task.description}

Please provide a revised response that addresses these concerns.
        `;
        
        try {
          const revisedResult = await this.chatCoordinator.coordinateAgentWork(
            state.agentAssignments[task.id][0],
            revisionPrompt,
            {
              expeditionId: state.expeditionId,
              starshipId: this.starshipId,
              userId: state.userId
            }
          );
          
          validatedResults[task.id] = revisedResult;
        } catch (error) {
          // If retry fails, use original result with note
          validatedResults[task.id] = `${result}\n\n[Note: Revision requested but failed - using original response]`;
        }
      }
    }
    
    return validatedResults;
  }
  
  private getCrewCategories(): string {
    const categories = [...new Set(this.availableCrew.map(agent => agent.category))];
    return categories.join(', ');
  }
  
  private getCrewCategoriesWithSkills(): string {
    const categoryMap: Record<string, string[]> = {};
    
    this.availableCrew.forEach(agent => {
      if (!categoryMap[agent.category]) {
        categoryMap[agent.category] = [];
      }
      categoryMap[agent.category].push(...agent.tags);
    });
    
    return Object.entries(categoryMap)
      .map(([category, skills]) => `${category}: ${[...new Set(skills)].join(', ')}`)
      .join('\n');
  }
}
```

#### 3. Hybrid Chat Coordinator
Create `packages/agent-engine/src/first-officer/ChatCoordinator.ts`:

```typescript
import { chat } from "../index";
import { LangChainMemoryStore } from "../memory/langchain-memory";

export interface ExpeditionContext {
  expeditionId: string;
  starshipId: string;
  userId: string;
}

export class ChatCoordinator {
  private memoryStore: LangChainMemoryStore;
  
  constructor(memoryStore?: LangChainMemoryStore) {
    this.memoryStore = memoryStore || new LangChainMemoryStore();
  }
  
  async coordinateAgentWork(
    agentId: string, 
    task: string, 
    expeditionContext: ExpeditionContext
  ): Promise<string> {
    // Use existing chat() function with expedition context
    const result = await chat({
      agent_id: agentId,
      user_id: expeditionContext.userId,
      channel_id: `expedition-${expeditionContext.expeditionId}`,
      message: task
    }, this.memoryStore);
    
    return result.reply;
  }
  
  async handleUserIntervention(
    agentId: string,
    userMessage: string,
    expeditionContext: ExpeditionContext
  ): Promise<string> {
    // Allow users to chat directly with agents during expeditions
    const result = await chat({
      agent_id: agentId,
      user_id: expeditionContext.userId,
      channel_id: `expedition-${expeditionContext.expeditionId}-agent-${agentId}`,
      message: userMessage
    }, this.memoryStore);
    
    return result.reply;
  }
}
```

### Phase 2: Database & API Integration (Week 2)

#### 4. Expedition Database Integration
Create `packages/models/src/repositories/ExpeditionRepository.ts`:

```typescript
import { Repository } from '../types';
import { Expedition, ExpeditionMessage } from '../types';

export class ExpeditionRepository implements Repository<Expedition> {
  async findByStarship(starshipId: string): Promise<Expedition[]> {
    // Implementation for Neo4j query
    // MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
    // RETURN e ORDER BY e.createdAt DESC
  }
  
  async create(expedition: Omit<Expedition, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expedition> {
    // Implementation for creating expedition
    // CREATE (e:Expedition $expeditionData)
    // CREATE (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e)
  }
  
  async updateStatus(id: string, status: Expedition['status']): Promise<Expedition | null> {
    // Implementation for status updates
    // MATCH (e:Expedition {id: $id}) SET e.status = $status, e.updatedAt = $now
  }
  
  async updateWorkflowState(id: string, state: any): Promise<Expedition | null> {
    // Implementation for LangGraph state persistence
    // MATCH (e:Expedition {id: $id}) SET e.workflowState = $state
  }
  
  async addMessage(expeditionId: string, message: ExpeditionMessage): Promise<void> {
    // Implementation for adding chat messages
    // CREATE (m:ExpeditionMessage $messageData)
    // CREATE (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m)
  }
}
```

#### 5. Starship Expedition API
Create `packages/server/src/routes/starship-expeditions.ts`:

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { FirstOfficerService } from '../services/FirstOfficerService';

const router = Router();

// GET /api/starships/:starshipId/expeditions
router.get('/:starshipId/expeditions', authMiddleware, async (req, res) => {
  const { starshipId } = req.params;
  const userId = req.user!.id;
  
  // Verify starship ownership
  const starship = await starshipRepo.findById(starshipId);
  if (!starship || starship.ownerId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const expeditions = await expeditionRepo.findByStarship(starshipId);
  res.json({ expeditions });
});

// POST /api/starships/:starshipId/expeditions
router.post('/:starshipId/expeditions', authMiddleware, async (req, res) => {
  const { starshipId } = req.params;
  const { title, requirements } = req.body;
  const userId = req.user!.id;
  
  // Verify starship ownership
  const starship = await starshipRepo.findById(starshipId);
  if (!starship || starship.ownerId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const expedition = await expeditionRepo.create({
    starshipId,
    title,
    requirements,
    status: 'idle',
    assignedAgents: [],
    chatHistory: []
  });
  
  res.status(201).json({ expedition });
});

// POST /api/starships/:starshipId/expeditions/:id/start
router.post('/:starshipId/expeditions/:id/start', authMiddleware, async (req, res) => {
  const { starshipId, id } = req.params;
  const userId = req.user!.id;
  
  // Verify ownership and get expedition
  const expedition = await expeditionRepo.findById(id);
  if (!expedition || expedition.starshipId !== starshipId) {
    return res.status(404).json({ error: 'Expedition not found' });
  }
  
  const starship = await starshipRepo.findById(starshipId);
  if (!starship || starship.ownerId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Update expedition status
  const updatedExpedition = await expeditionRepo.updateStatus(id, 'in-progress');
  
  // Increment starship.activeExpeditions
  await starshipRepo.update(starshipId, {
    activeExpeditions: starship.activeExpeditions + 1
  });
  
  // Start First Officer LangGraph workflow
  await FirstOfficerService.startExpedition(updatedExpedition);
  
  res.json({ expedition: updatedExpedition });
});

// POST /api/starships/:starshipId/expeditions/:id/message
router.post('/:starshipId/expeditions/:id/message', authMiddleware, async (req, res) => {
  const { starshipId, id } = req.params;
  const { content, agentId } = req.body;
  const userId = req.user!.id;
  
  // Verify ownership
  const expedition = await expeditionRepo.findById(id);
  if (!expedition || expedition.starshipId !== starshipId) {
    return res.status(404).json({ error: 'Expedition not found' });
  }
  
  const starship = await starshipRepo.findById(starshipId);
  if (!starship || starship.ownerId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Handle message routing
  if (agentId) {
    // Send to specific agent
    const response = await FirstOfficerService.handleUserAgentMessage(id, agentId, content);
    res.json({ response });
  } else {
    // Send to First Officer
    const response = await FirstOfficerService.handleUserMessage(id, content);
    res.json({ response });
  }
});

// PUT /api/starships/:starshipId/expeditions/:id/complete
router.put('/:starshipId/expeditions/:id/complete', authMiddleware, async (req, res) => {
  const { starshipId, id } = req.params;
  const { status, result } = req.body;
  const userId = req.user!.id;
  
  // Verify ownership
  const expedition = await expeditionRepo.findById(id);
  if (!expedition || expedition.starshipId !== starshipId) {
    return res.status(404).json({ error: 'Expedition not found' });
  }
  
  const starship = await starshipRepo.findById(starshipId);
  if (!starship || starship.ownerId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Update expedition
  const updatedExpedition = await expeditionRepo.update(id, { status, result });
  
  // Decrement starship.activeExpeditions
  await starshipRepo.update(starshipId, {
    activeExpeditions: Math.max(0, starship.activeExpeditions - 1)
  });
  
  res.json({ expedition: updatedExpedition });
});

export default router;
```

#### 6. First Officer Service
Create `packages/server/src/services/FirstOfficerService.ts`:

```typescript
import { FirstOfficerAgent } from '@starships/agent-engine';
import { ExpeditionRepository } from '@starships/models';
import { StarshipRepository } from '@starships/models';
import { io } from '../socket';

export class FirstOfficerService {
  private static activeExpeditions = new Map<string, FirstOfficerAgent>();
  
  static async startExpedition(expedition: Expedition): Promise<void> {
    // Get starship and crew
    const starship = await StarshipRepository.findById(expedition.starshipId);
    if (!starship) throw new Error('Starship not found');
    
    const crew = await StarshipRepository.getDeployedAgents(expedition.starshipId);
    
    // Create First Officer instance
    const firstOfficer = new FirstOfficerAgent(expedition.starshipId, crew);
    this.activeExpeditions.set(expedition.id, firstOfficer);
    
    // Start workflow in background
    this.runExpeditionWorkflow(expedition, firstOfficer);
  }
  
  private static async runExpeditionWorkflow(
    expedition: Expedition,
    firstOfficer: FirstOfficerAgent
  ): Promise<void> {
    try {
      // Emit expedition started event
      io.to(`starship-${expedition.starshipId}`).emit('expedition:started', {
        expeditionId: expedition.id,
        status: 'in-progress'
      });
      
      // Run LangGraph workflow
      const result = await firstOfficer.startExpedition(
        expedition.requirements,
        expedition.id,
        expedition.userId
      );
      
      // Update expedition with final result
      await ExpeditionRepository.update(expedition.id, {
        status: 'done',
        result: result
      });
      
      // Emit completion event
      io.to(`starship-${expedition.starshipId}`).emit('expedition:completed', {
        expeditionId: expedition.id,
        status: 'done',
        result: result
      });
      
    } catch (error) {
      console.error('Expedition workflow failed:', error);
      
      // Update expedition as failed
      await ExpeditionRepository.update(expedition.id, {
        status: 'failed',
        result: `Expedition failed: ${error.message}`
      });
      
      // Emit failure event
      io.to(`starship-${expedition.starshipId}`).emit('expedition:failed', {
        expeditionId: expedition.id,
        status: 'failed',
        error: error.message
      });
    } finally {
      // Clean up active expedition
      this.activeExpeditions.delete(expedition.id);
    }
  }
  
  static async handleUserMessage(expeditionId: string, message: string): Promise<string> {
    const firstOfficer = this.activeExpeditions.get(expeditionId);
    if (!firstOfficer) {
      throw new Error('No active expedition found');
    }
    
    // Handle user intervention in workflow
    // This would require extending FirstOfficerAgent with user interaction capabilities
    return "First Officer acknowledges your message. Expedition continues...";
  }
  
  static async handleUserAgentMessage(
    expeditionId: string,
    agentId: string,
    message: string
  ): Promise<string> {
    const firstOfficer = this.activeExpeditions.get(expeditionId);
    if (!firstOfficer) {
      throw new Error('No active expedition found');
    }
    
    // Route message to specific agent through ChatCoordinator
    const expedition = await ExpeditionRepository.findById(expeditionId);
    if (!expedition) throw new Error('Expedition not found');
    
    const response = await firstOfficer.chatCoordinator.handleUserIntervention(
      agentId,
      message,
      {
        expeditionId,
        starshipId: expedition.starshipId,
        userId: expedition.userId
      }
    );
    
    return response;
  }
}
```

### Phase 3: Frontend Components (Week 3)

#### 7. Starship Expeditions Page
Update `packages/client/src/components/expeditions/StarshipExpeditionsContent.tsx`:

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, MessageSquare, Play, CheckCircle, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Expedition {
  id: string;
  title: string;
  requirements: string;
  status: 'idle' | 'in-progress' | 'done' | 'failed';
  assignedAgents: string[];
  result?: string;
  createdAt: string;
  updatedAt: string;
}

interface StarshipExpeditionsContentProps {
  starshipSlug: string;
}

export function StarshipExpeditionsContent({ starshipSlug }: StarshipExpeditionsContentProps) {
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadExpeditions();
  }, [starshipSlug]);

  const loadExpeditions = async () => {
    try {
      const response = await fetch(`/api/starships/${starshipSlug}/expeditions`);
      const data = await response.json();
      setExpeditions(data.expeditions);
    } catch (error) {
      console.error('Failed to load expeditions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: Expedition['status']) => {
    switch (status) {
      case 'idle': return <Play className="h-4 w-4" />;
      case 'in-progress': return <MessageSquare className="h-4 w-4 animate-pulse" />;
      case 'done': return <CheckCircle className="h-4 w-4" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: Expedition['status']) => {
    switch (status) {
      case 'idle': return 'bg-gray-500';
      case 'in-progress': return 'bg-blue-500';
      case 'done': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
    }
  };

  const handleExpeditionClick = (expeditionId: string) => {
    router.push(`/ship/${starshipSlug}/expeditions/${expeditionId}`);
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading expeditions...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Expeditions</h1>
          <p className="text-muted-foreground">
            Coordinate multi-agent missions with your starship crew
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Expedition
        </Button>
      </div>

      <div className="grid gap-4">
        {expeditions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No expeditions yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first expedition to coordinate your crew on complex missions
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Expedition
              </Button>
            </CardContent>
          </Card>
        ) : (
          expeditions.map((expedition) => (
            <Card
              key={expedition.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleExpeditionClick(expedition.id)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {expedition.title}
                      {getStatusIcon(expedition.status)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {expedition.requirements.substring(0, 150)}
                      {expedition.requirements.length > 150 ? '...' : ''}
                    </p>
                  </div>
                  <Badge className={getStatusColor(expedition.status)}>
                    {expedition.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>
                    {expedition.assignedAgents.length} agents assigned
                  </span>
                  <span>
                    {new Date(expedition.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {showCreateModal && (
        <CreateExpeditionModal
          starshipSlug={starshipSlug}
          onClose={() => setShowCreateModal(false)}
          onCreated={loadExpeditions}
        />
      )}
    </div>
  );
}
```

#### 8. Individual Expedition Chat Interface
Create `packages/client/src/components/expeditions/ExpeditionChat.tsx`:

```typescript
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Send, User, Bot, Crown } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface ExpeditionMessage {
  id: string;
  role: 'user' | 'first-officer' | 'agent';
  agentId?: string;
  content: string;
  messageType: 'coordination' | 'agent-work' | 'user-input';
  timestamp: string;
  threadId?: string;
}

interface ExpeditionChatProps {
  starshipSlug: string;
  expeditionId: string;
}

export function ExpeditionChat({ starshipSlug, expeditionId }: ExpeditionChatProps) {
  const [messages, setMessages] = useState<ExpeditionMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [expedition, setExpedition] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io();
    setSocket(newSocket);

    // Join expedition room
    newSocket.emit('join-expedition', { expeditionId, starshipSlug });

    // Listen for real-time updates
    newSocket.on('expedition:message', (message: ExpeditionMessage) => {
      setMessages(prev => [...prev, message]);
    });

    newSocket.on('expedition:status-update', (update: any) => {
      setExpedition(prev => ({ ...prev, ...update }));
    });

    // Load initial data
    loadExpedition();
    loadMessages();

    return () => {
      newSocket.disconnect();
    };
  }, [expeditionId, starshipSlug]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadExpedition = async () => {
    try {
      const response = await fetch(`/api/starships/${starshipSlug}/expeditions/${expeditionId}`);
      const data = await response.json();
      setExpedition(data.expedition);
    } catch (error) {
      console.error('Failed to load expedition:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/starships/${starshipSlug}/expeditions/${expeditionId}/messages`);
      const data = await response.json();
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    try {
      const response = await fetch(`/api/starships/${starshipSlug}/expeditions/${expeditionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: inputMessage,
          agentId: selectedAgent
        })
      });

      if (response.ok) {
        setInputMessage('');
        // Message will be added via socket event
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const startExpedition = async () => {
    try {
      await fetch(`/api/starships/${starshipSlug}/expeditions/${expeditionId}/start`, {
        method: 'POST'
      });
      // Status update will come via socket
    } catch (error) {
      console.error('Failed to start expedition:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'user': return <User className="h-4 w-4" />;
      case 'first-officer': return <Crown className="h-4 w-4" />;
      case 'agent': return <Bot className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'user': return 'bg-blue-500';
      case 'first-officer': return 'bg-purple-500';
      case 'agent': return 'bg-green-500';
    }
  };

  if (!expedition) {
    return <div className="flex justify-center p-8">Loading expedition...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{expedition.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {expedition.requirements}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={expedition.status === 'idle' ? 'bg-gray-500' :
                              expedition.status === 'in-progress' ? 'bg-blue-500' :
                              expedition.status === 'done' ? 'bg-green-500' : 'bg-red-500'}>
                {expedition.status}
              </Badge>
              {expedition.status === 'idle' && (
                <Button onClick={startExpedition} size="sm">
                  Start Expedition
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message) => (
              <div key={message.id} className="flex items-start gap-3">
                <div className={`p-2 rounded-full ${getRoleColor(message.role)}`}>
                  {getRoleIcon(message.role)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">
                      {message.role === 'user' ? 'You' :
                       message.role === 'first-officer' ? 'First Officer' :
                       `Agent ${message.agentId}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {message.messageType}
                    </Badge>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    {message.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {expedition.status === 'in-progress' && (
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={selectedAgent ? `Message Agent ${selectedAgent}...` : "Message First Officer..."}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                className="flex-1"
              />
              <Button onClick={sendMessage} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}

          {expedition.status === 'done' && expedition.result && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Expedition Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap">{expedition.result}</div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### Phase 4: Real-time Integration (Week 4)

#### 9. Socket.IO Expedition Events
Update `packages/server/src/socket/index.ts`:

```typescript
import { Server } from 'socket.io';
import { ExpeditionRepository } from '@starships/models';

export function setupExpeditionSockets(io: Server) {
  io.on('connection', (socket) => {
    // Join expedition room
    socket.on('join-expedition', async ({ expeditionId, starshipSlug }) => {
      socket.join(`expedition-${expeditionId}`);
      socket.join(`starship-${starshipSlug}`);
      
      console.log(`User joined expedition ${expeditionId} for starship ${starshipSlug}`);
    });

    // Leave expedition room
    socket.on('leave-expedition', ({ expeditionId }) => {
      socket.leave(`expedition-${expeditionId}`);
    });

    // Handle real-time message broadcasting
    socket.on('expedition-message', async (data) => {
      const { expeditionId, message } = data;
      
      // Save message to database
      await ExpeditionRepository.addMessage(expeditionId, message);
      
      // Broadcast to all users in expedition
      io.to(`expedition-${expeditionId}`).emit('expedition:message', message);
    });
  });
}

// Expedition event emitters for server-side use
export const expeditionEvents = {
  emitStatusUpdate: (expeditionId: string, status: any) => {
    io.to(`expedition-${expeditionId}`).emit('expedition:status-update', status);
  },
  
  emitWorkflowProgress: (expeditionId: string, progress: any) => {
    io.to(`expedition-${expeditionId}`).emit('expedition:workflow-progress', progress);
  },
  
  emitAgentAssignment: (expeditionId: string, assignment: any) => {
    io.to(`expedition-${expeditionId}`).emit('expedition:agent-assigned', assignment);
  }
};
```

## SUCCESS METRICS & TESTING

### Key Performance Indicators
1. **Expedition Completion Rate**: >80% of started expeditions reach 'done' status
2. **Agent Selection Accuracy**: >90% of selected agents are appropriate for tasks
3. **User Satisfaction**: Average rating >4.0/5.0 for expedition results
4. **Response Time**: First Officer analysis completes within 30 seconds
5. **Parallel Execution Efficiency**: Tasks complete 60% faster than sequential

### Testing Strategy

#### Unit Tests
- FirstOfficerAgent workflow nodes
- Rule-based agent matching algorithms
- Quality validation logic
- ChatCoordinator integration

#### Integration Tests
- End-to-end expedition workflows
- Socket.IO real-time communication
- Database persistence and retrieval
- API endpoint functionality

#### User Acceptance Tests
- Complete user journey from creation to completion
- Multi-agent coordination scenarios
- Error handling and recovery
- Real-time updates and notifications

## IMPLEMENTATION TIMELINE

### Week 1: Core LangGraph Foundation
- [ ] FirstOfficerAgent implementation
- [ ] ChatCoordinator integration
- [ ] Basic workflow testing
- [ ] Unit test coverage

### Week 2: Database & API Layer
- [ ] ExpeditionRepository implementation
- [ ] API routes and middleware
- [ ] FirstOfficerService coordination
- [ ] Integration testing

### Week 3: Frontend Components
- [ ] StarshipExpeditionsContent page
- [ ] ExpeditionChat interface
- [ ] Create expedition modal
- [ ] Status management UI

### Week 4: Real-time & Polish
- [ ] Socket.IO event handling
- [ ] Real-time message threading
- [ ] Error handling and recovery
- [ ] Performance optimization
- [ ] User acceptance testing

## CONCLUSION

This implementation provides a complete, production-ready expedition orchestration system that leverages the existing starships.ai infrastructure while adding sophisticated multi-agent coordination capabilities. The system is designed to be scalable, maintainable, and user-friendly, with clear separation of concerns and robust error handling.

The hierarchical coordination model ensures that expeditions are managed efficiently, while the hybrid chat integration provides seamless user interaction with both the First Officer and individual agents. Real-time updates keep users engaged and informed throughout the expedition lifecycle.