/**
 * MissionPromptBuilder - State-driven prompt generation for mission orchestration
 * 
 * This class builds appropriate prompts based on the current mission state,
 * eliminating the need for separate phase-specific interfaces or complex template management.
 */

import type { MissionChatState } from '../services/MissionOrchestratorAgent';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { MissionPlan, LLMChatPrompt } from '@starships/protocol';
import type { Agent } from '@starships/models';
import { MissionPlanService } from '../services/MissionPlanService';

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

  CONVERSE: `Provide mission-focused guidance and support.

APPROACH:
- Understand the user's specific request
- Leverage mission context and current phase
- Give actionable, practical advice
- Suggest concrete next steps when appropriate

Be direct, helpful, and mission-oriented.`,

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
      case 'welcome':
        return this.buildWelcomePhaseContext();
      case 'analysis':
        return this.buildAnalysisPhaseContext();
      case 'plan':
        return this.buildPlanPhaseContext();
      case 'converse':
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
   * Converse phase context - recent conversation history
   */
  private buildConversePhaseContext(): string {
    return `CONVERSE PHASE: Ongoing mission guidance and support.`
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
                     /[{}\[\]<>]/.test(content);
    
    if (isComplex) {
      return `---\n${content}\n---`;
    }
    
    return content;
  }

  /**
   * Build agent list section for plan generation
   */
  private buildAgentListSection(agents: Agent[]): string {
    return agents.map(agent => {
      const capabilities = agent.category || 'general';
      return `├─ ${agent.id}: ${agent.name} (${capabilities})\n   └─ ${agent.description || 'No description available'}`;
    }).join('\n');
  }

  /**
   * Build plan data section for presentation
   */
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