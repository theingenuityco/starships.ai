/**
 * MissionPromptBuilder - State-driven prompt generation for mission orchestration
 * 
 * This class builds appropriate prompts based on the current mission state,
 * eliminating the need for separate phase-specific interfaces or complex template management.
 */

import type { MissionChatState } from '../services/MissionOrchestratorAgent';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { LLMChatPrompt } from '@starships/protocol';
import { MISSION_PHASES, type MissionWorkflow } from '@starships/protocol';
import type { AgentModel } from '@starships/models';

/**
 * System instruction constants - direct instruction strings for different operations
 */
export const SYSTEM_INSTRUCTIONS = {
  WELCOME: `Generate initial welcome message for the new mission and set expectation for analysis phase.

INSTRUCTIONS:
1. Introduce yourself as Commander ARIA
2. Provide a brief welcome and mission overview
3. Keep it concise and professional
4. Ask them to hold on while you assess the mission objective for clarity
`,

  CLARITY_ASSESSMENT: `Assess mission clarity across 5 dimensions (0-10 scale). Use your intelligence to infer reasonable assumptions from context and user intent rather than being overly pedantic:

1. objectiveClarity: Rate 7-10 if deliverables/outcomes are reasonably clear; 4-6 if general goals mentioned; 0-3 if vague/unclear
2. successMetrics: Rate 7-10 if success can be evaluated (implicit or explicit measures); 4-6 if some progress indicators exist; 0-3 if no success measures
3. timelineDefinition: Rate 7-10 if timeframe is workable (stated, inferable, or has natural milestones); 4-6 if rough timeframe mentioned; 0-3 if no timeline
4. scopeBoundaries: Rate 7-10 if scope is manageable (clear constraints or reasonable defaults); 4-6 if some limitations mentioned; 0-3 if scope unlimited/undefined
5. visionAlignment: Rate 7-10 if supports vision goals (direct connection or clear pathway); 4-6 if loosely connected; 0-3 if misaligned/unclear

Respond with ONLY this JSON format:
{
  "objectiveClarity": X,
  "successMetrics": X,
  "timelineDefinition": X,
  "scopeBoundaries": X,
  "visionAlignment": X,
  "reasoning": "Brief explanation of scores and key gaps. Make any reasonable assumptions explicit (e.g., 'Assuming X based on Y context')"
}`,

  CLARITY_QUESTION_FIRST: `Share the clarity assessment results conversationally, include mission clarity overall score from the prev assessment, then ask 2-3 focused questions as numbered bullets targeting the dimensions with the lowest scores (prioritize scores below 7). Be concise, helpful, and encouraging.`,

  CLARITY_QUESTION_SUBSEQUENT: `Ask 2-3 focused questions as numbered bullets targeting the dimensions with the lowest scores (prioritize scores below 7). Be concise and build on previous answers to avoid repetition.`,

  CLARITY_COMPLETION_FIRST: `Share the clarity assessment results conversationally, include mission clarity overall score from the prev assessment, then provide a brief, positive summary (2-3 sentences) confirming readiness to proceed with mission execution.`,

  CLARITY_COMPLETION_SUBSEQUENT: `Provide a brief, positive summary (2-3 sentences) confirming the mission is clear and ready for execution planning.`,

  CONVERSE: `Provide mission-focused guidance and support based on complete mission context.

AVAILABLE CONTEXT:
- Mission clarity assessment from analysis phase
- Approved workflow plan with task breakdown  
- Execution results with detailed task outcomes
- Full conversation history and user intent

APPROACH:
- Reference specific mission artifacts when relevant
- Provide insights based on execution results
- Help analyze outcomes and suggest improvements
- Answer questions about completed tasks and their results
- Guide next steps based on mission completion status

Be direct, knowledgeable, and leverage the rich mission context available.`,

  WORKFLOW_GENERATION: `You are Commander ARIA creating a detailed execution workflow for this mission.

INSTRUCTIONS:
1. Break down the mission into 3-8 concrete, actionable agent tasks
2. Assign each task to the most suitable agent based on their capabilities
3. Create a linear workflow: start → agent tasks (sequential) → end
4. Ensure each task has clear execution parameters
5. Focus on creating an executable workflow graph

AVAILABLE AGENTS:
{agentList}

MISSION CONTEXT:
{missionContext}

CLARITY ASSESSMENT:
{clarityData}

Respond with ONLY this JSON format:
{
  "nodes": [
    {
      "id": "start-node",
      "type": "start", 
      "name": "Start Mission",
      "description": "Initialize mission execution",
      "parameters": {}
    },
    {
      "id": "agent-node-1",
      "type": "agent",
      "name": "Clear, actionable task title (max 100 chars)",
      "description": "Detailed description of what needs to be done and how",
      "parameters": {
        "agentId": "agent-id-from-available-list",
        "instructions": "Specific instructions for the agent",
        "expectedOutput": "Specific expected output or result", 
        "priority": "high|medium|low"
      }
    },
    {
      "id": "end-node",
      "type": "end",
      "name": "Complete Mission", 
      "description": "Mission execution completed",
      "parameters": {}
    }
  ],
  "edges": [
    {"from": "start-node", "to": "agent-node-1"},
    {"from": "agent-node-1", "to": "end-node"}
  ],
  "reasoning": "Brief explanation of the workflow structure and task assignments"
}

IMPORTANT:
- Always include start and end nodes with consistent IDs
- Agent nodes need sequential IDs (agent-node-1, agent-node-2, etc.)
- Edges must reference the exact node IDs from the nodes array
- Create linear flow: start-node → agent-node-X → end-node
- Each agent task must be assignable to ONE available agent
- Focus on clear, actionable workflow with measurable outcomes`,

  WORKFLOW_PRESENTATION: `Present the generated execution workflow to the user for approval.

CURRENT WORKFLOW:
{planData}

INSTRUCTIONS:
1. Provide a clear overview of the workflow structure
2. Explain the execution flow and why it makes sense
3. Highlight the agent assignments and their roles
4. Show the workflow progression from start to completion
5. Ask for user approval to proceed with execution

Be encouraging and explain how this workflow achieves their mission goals.
Use a professional but friendly tone as Commander ARIA.

End with: "Would you like me to proceed with this execution workflow? You can approve it to begin execution, or ask me to modify any aspects you'd like changed."`,

  WORKFLOW_APPROVAL_INTENT: `You are an expert at understanding user intentions regarding workflow approval in a mission context.

User message: "{userMessage}"

MISSION CONTEXT:
{missionContext}

Analyze the user's intent and respond with a JSON object containing:
{
  "intent": "approve|reject|discussion|unclear",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Intent definitions:
- "approve": User clearly wants to approve/execute the workflow (e.g., "yes", "looks good", "let's do it", "proceed", "execute", "go ahead")
- "reject": User clearly wants to reject/change the workflow (e.g., "no", "change this", "revise", "not good", "different approach")  
- "discussion": User is asking questions, seeking clarification, or discussing details without clear approval/rejection
- "unclear": Intent is ambiguous, unrelated, or cannot be determined

Guidelines:
- Confidence should be high (0.8+) only for very clear intent
- Consider context and nuance, not just keywords
- "Looks good but..." should be discussion/unclear, not approve
- Questions about the workflow are discussion
- Generic responses without clear action are unclear
- Focus on the primary intent of the message

Respond with only the JSON object:`
} as const;

export class MissionPromptBuilder {

  constructor(private state: MissionChatState) {}
  
  /**
   * Build welcome prompt for initial mission introduction
   */
  buildWelcomePrompt(): string {
    return this.buildCompletePrompt(SYSTEM_INSTRUCTIONS.WELCOME);
  }

  /**
   * Build converse prompt for ongoing mission conversation
   */
  buildConversePrompt(): string {
    return this.buildCompletePrompt(SYSTEM_INSTRUCTIONS.CONVERSE);
  }
  

  /**
   * Builds prompt specifically for clarity assessment (bypasses phase-based routing)
   */
  buildClarityAssessmentPrompt(): string {
    return this.buildCompletePrompt(SYSTEM_INSTRUCTIONS.CLARITY_ASSESSMENT);
  }

  /**
   * Builds prompt specifically for clarity questions (bypasses phase-based routing)
   */
  buildClarityQuestionPrompt(isFirstIteration: boolean): string {
    const instruction = isFirstIteration 
      ? SYSTEM_INSTRUCTIONS.CLARITY_QUESTION_FIRST 
      : SYSTEM_INSTRUCTIONS.CLARITY_QUESTION_SUBSEQUENT;
    return this.buildCompletePrompt(instruction);
  }

  /**
   * Builds prompt specifically for clarity completion (bypasses phase-based routing)
   */
  buildClarityCompletionPrompt(isFirstIteration: boolean): string {
    const instruction = isFirstIteration 
      ? SYSTEM_INSTRUCTIONS.CLARITY_COMPLETION_FIRST 
      : SYSTEM_INSTRUCTIONS.CLARITY_COMPLETION_SUBSEQUENT;
    return this.buildCompletePrompt(instruction);
  }

  /**
   * Build workflow generation prompt
   */
  buildWorkflowGenerationPrompt(agents: AgentModel[]): LLMChatPrompt {
    const systemPrompt = SYSTEM_INSTRUCTIONS.WORKFLOW_GENERATION
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
   * Build workflow presentation prompt
   */
  buildWorkflowPresentationPrompt(workflow: MissionWorkflow): LLMChatPrompt {
    const systemPrompt = SYSTEM_INSTRUCTIONS.WORKFLOW_PRESENTATION
      .replace('{planData}', this.buildWorkflowDataSection(workflow));

    return {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };
  }

  /**
   * Build workflow approval intent classification prompt
   */
  buildWorkflowApprovalIntentPrompt(userMessage: string): LLMChatPrompt {
    const missionContext = this.buildMissionSection();
    const systemPrompt = SYSTEM_INSTRUCTIONS.WORKFLOW_APPROVAL_INTENT
      .replace('{userMessage}', userMessage)
      .replace('{missionContext}', missionContext);

    return {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };
  }
  
  // ============================================================================
  // CORE BUILDING METHODS
  // ============================================================================
  
  /**
   * Core helper - combines universal context + phase context + instruction
   */
  private buildCompletePrompt(instruction: string): string {
    const universal = this.buildUniversalContext();
    const phaseContext = this.buildPhaseContext();
    const sections = [universal, phaseContext, instruction].filter(Boolean);
    return sections.join('\n\n');
  }
  
  /**
   * Universal context - mission basics that appear in all prompts
   */
  private buildUniversalContext(): string {
    return [
      this.buildIdentitySection(),
      this.buildMissionSection(),
      this.buildStatusSection(),
      this.buildConversationSection(),
    ].filter(Boolean).join('\n');
  }
  
  /**
   * Phase-specific context - varies by current phase
   */
  private buildPhaseContext(): string {
    const { activePhase } = this.state;
    
    switch (activePhase) {
      case MISSION_PHASES.WELCOME:
        return this.buildWelcomePhaseContext();
      case MISSION_PHASES.ANALYSIS:
        return this.buildAnalysisPhaseContext();
      case MISSION_PHASES.PLAN:
        return this.buildPlanPhaseContext();
      case MISSION_PHASES.CONVERSE:
        return this.buildConversePhaseContext();
      default:
        return '';
    }
  }
  
  /**
   * Welcome phase context - minimal context for initial setup
   */
  private buildWelcomePhaseContext(): string {
    return `
WELCOME PHASE: First interaction with user for this mission.`;
  }
  
  /**
   * Analysis phase context - clarity data and conversation history
   */
  private buildAnalysisPhaseContext(): string {
    return [
      `ANALYSIS PHASE: Assessing mission clarity through iterative questioning.`,
      this.buildClaritySection(),
    ].filter(Boolean).join('\n\n');
  }
  
  /**
   * Plan phase context - plan data and status
   */
  private buildPlanPhaseContext(): string {
    return `PLAN PHASE: Mission execution planning and approval.`;
  }
  
  /**
   * Converse phase context - includes all mission artifacts
   */
  private buildConversePhaseContext(): string {
    const sections = [
      `CONVERSE PHASE: Ongoing mission guidance and support.`,
      this.buildClaritySection(),
      this.buildWorkflowSection(),
      this.buildExecutionResultsSection()
    ];
    
    return sections.filter(Boolean).join('\n\n');
  }
  
  // ============================================================================
  // CONTEXT SECTION BUILDERS
  // ============================================================================
  
  private buildIdentitySection(): string {
    const { metadata } = this.state;
    if (!metadata) return '';
    
    const { mission, starship } = metadata;
    
    return `You ARE Commander ARIA-${mission.id.slice(-4)}, Mission Orchestrator for ${starship.name}.
Your purpose is to manage this mission and ensure its success.
You work for the User.
You are experienced, direct, and focused on mission success.
You communicate directly with the user throughout the mission.
You respond naturally as yourself - not as "Commander ARIA says" but directly.
Your responses are your own voice speaking to the user.

You coordinate starship missions by:
- Managing assigned agents
- Tracking mission progress  
- Providing strategic guidance`;
  }

  private buildMissionSection(): string {
    const { metadata } = this.state;
    if (!metadata) return '';
    
    const { mission, starship, vision } = metadata;
    
    return `MISSION: "${mission.name}"
├─ OBJECTIVE: ${mission.description}
├─ STARSHIP: ${starship.name} (${starship.class}-class)
├─ VISION: ${vision.statement}
└─ STATUS: ${mission.status}`;
  }

  private buildStatusSection(): string {
    const { activePhase } = this.state;
    const currentDateTime = new Date().toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    return `
ACTIVE PHASE: ${activePhase}
PHASES: INIT → WELCOME → ANALYSIS → PLAN → CONVERSE
CURRENT TIME: ${currentDateTime}`;
  }

  private buildClaritySection(): string {
    const { clarity } = this.state;
    if (!clarity) return '';
    
    return `
MISSION CLARITY ASSESSMENT:
├─ Overall Score: ${clarity.overallScore.toFixed(1)}/10 (Iteration ${clarity.iteration})
├─ Objective Clarity: ${clarity.objectiveClarity}/10
├─ Success Metrics: ${clarity.successMetrics}/10
├─ Timeline Definition: ${clarity.timelineDefinition}/10
├─ Scope Boundaries: ${clarity.scopeBoundaries}/10
├─ Vision Alignment: ${clarity.visionAlignment}/10
└─ AI Analysis: ${clarity.reasoning}`;
  }

  private buildWorkflowSection(): string {
    const { workflow } = this.state;
    if (!workflow) return '';
    
    const agentNodes = workflow.nodes.filter(n => n.type === 'agent');
    const workflowStatus = workflow.approvalStatus === 'approved' ? '✅ APPROVED & EXECUTED' : 
                          workflow.approvalStatus === 'rejected' ? '❌ REJECTED' : 
                          '⏳ PENDING APPROVAL';
    
    const taskList = agentNodes.map((node, index) => 
      `├─ Task ${index + 1}: ${node.name}`
    ).join('\n');
    
    return `
MISSION WORKFLOW:
├─ Status: ${workflowStatus}
├─ Total Tasks: ${agentNodes.length}
${taskList}
└─ Created: ${new Date(workflow.createdAt).toLocaleDateString()}`;
  }

  private buildExecutionResultsSection(): string {
    const { executionResult } = this.state;
    if (!executionResult) return '';
    
    const successfulTasks = executionResult.nodeResults.filter((r: any) => r.success).length;
    // const failedTasks = executionResult.nodeResults.filter((r: any) => !r.success).length;
    const statusIcon = executionResult.success ? '✅' : '❌';
    
    const taskResults = executionResult.nodeResults.map((result: any) => {
      const icon = result.success ? '✅' : '❌';
      const output = result.output ? ` - ${result.output.substring(0, 80)}${result.output.length > 80 ? '...' : ''}` : '';
      return `├─ ${icon} ${result.nodeName}${output}`;
    }).join('\n');
    
    return `
MISSION EXECUTION RESULTS:
├─ Status: ${statusIcon} ${executionResult.success ? 'COMPLETED SUCCESSFULLY' : 'FAILED'}
├─ Summary: ${executionResult.summary}
├─ Tasks Completed: ${successfulTasks}/${executionResult.nodeResults.length}
${taskResults}
└─ Executed: ${new Date(executionResult.executedAt).toLocaleDateString()}`;
  }

  private buildConversationSection(): string {
    const { messages } = this.state;
    if (!messages.length) return '';
    
    // Separate latest message from conversation history
    const messageLimit = 8;
    const recentMessages = messages.slice(-messageLimit);
    const latestMessage = recentMessages[recentMessages.length - 1];
    const conversationHistory = recentMessages.slice(0, -1); // All except latest
    
    let result = '';
    
    // Build conversation history (excluding latest message)
    if (conversationHistory.length > 0) {
      const conversationText = conversationHistory
        .filter(msg => msg.content && typeof msg.content === 'string')
        .map((msg, index) => {
          let speaker = '';
          let prefix = '';
          
          if (msg instanceof HumanMessage) {
            speaker = 'User';
            prefix = '├─';
          } else if (msg instanceof AIMessage) {
            speaker = 'Me';
            prefix = '└─';
          } else {
            speaker = 'System';
            prefix = '├─';
          }
          
          // Use └─ for the last message in history
          if (index === conversationHistory.length - 1) {
            prefix = '└─';
          }
          
          // Encapsulate complex messages with delimiters
          const content = this.encapsulateMessage(msg.content as string);
          
          return `${prefix} ${speaker}: ${content}`;
        })
        .join('\n');
      
      result += `\nCONVERSATION HISTORY:\n${conversationText}`;
    }
    
    // Highlight latest message separately
    if (latestMessage && latestMessage.content && typeof latestMessage.content === 'string') {
      let speaker = '';
      
      if (latestMessage instanceof HumanMessage) {
        speaker = 'User';
      } else if (latestMessage instanceof AIMessage) {
        speaker = 'Me';
      } else {
        speaker = 'System';
      }
      
      // Encapsulate the latest message content
      const content = this.encapsulateMessage(latestMessage.content as string);
      
      result += `\n\nCURRENT REQUEST:\n>>> ${speaker}: ${content}`;
    }
    
    return result;
  }

  /**
   * Encapsulate complex messages with delimiters for better parsing
   */
  private encapsulateMessage(content: string): string {
    // Check if message is complex (contains newlines, special chars, or is long)
    const isComplex = content.includes('\n') || 
                     content.includes('```') || 
                     content.includes('---') || 
                     content.length > 100 ||
                     /[{}<>]/.test(content);
    
    if (isComplex) {
      return `---\n${content}\n---`;
    }
    
    return content;
  }

  /**
   * Build agent list section for plan generation
   */
  private buildAgentListSection(agents: AgentModel[]): string {
    return agents.map(agent => {
      const capabilities = agent.category || 'general';
      return `├─ ${agent.id}: ${agent.name} (${capabilities})\n   └─ ${agent.description || 'No description available'}`;
    }).join('\n');
  }

  /**
   * Build workflow data section for presentation
   */
  private buildWorkflowDataSection(workflow: MissionWorkflow): string {
    const agentNodes = workflow.nodes.filter(node => node.type === 'agent');
    const agentAssignments = agentNodes.reduce((assignments, node) => {
      const agentId = node.parameters.agentId;
      if (agentId && typeof agentId === 'string') {
        if (!assignments[agentId]) {
          assignments[agentId] = [];
        }
        assignments[agentId].push(node.id);
      }
      return assignments;
    }, {} as Record<string, string[]>);

    let workflowText = `EXECUTION WORKFLOW OVERVIEW:
├─ Total Nodes: ${workflow.nodes.length}
├─ Agent Tasks: ${agentNodes.length}
├─ Workflow Edges: ${workflow.edges.length}
└─ Agents Involved: ${Object.keys(agentAssignments).length}

WORKFLOW STRUCTURE:`;

    workflow.nodes.forEach((node, index) => {
      if (node.type === 'start') {
        workflowText += `\n${index + 1}. [START] ${node.name}
   └─ ${node.description}`;
      } else if (node.type === 'agent') {
        workflowText += `\n${index + 1}. [AGENT] ${node.name}
   ├─ Agent: ${node.parameters.agentId}
   ├─ Priority: ${node.parameters.priority || 'medium'}
   ├─ Expected Output: ${node.parameters.expectedOutput}
   └─ Instructions: ${node.parameters.instructions}`;
      } else if (node.type === 'end') {
        workflowText += `\n${index + 1}. [END] ${node.name}
   └─ ${node.description}`;
      }
    });

    workflowText += '\n\nEXECUTION FLOW:';
    workflow.edges.forEach((edge) => {
      const fromNode = workflow.nodes.find(n => n.id === edge.from);
      const toNode = workflow.nodes.find(n => n.id === edge.to);
      workflowText += `\n├─ ${fromNode?.name || edge.from} → ${toNode?.name || edge.to}`;
    });

    workflowText += '\n\nAGENT ASSIGNMENTS:';
    Object.entries(agentAssignments).forEach(([agentId, nodeIds]) => {
      workflowText += `\n├─ ${agentId}: ${nodeIds.length} task(s)`;
    });

    return workflowText;
  }
  
}