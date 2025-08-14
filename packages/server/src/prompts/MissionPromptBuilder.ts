/**
 * MissionPromptBuilder - State-driven prompt generation for mission orchestration
 * 
 * This class builds appropriate prompts based on the current mission state,
 * eliminating the need for separate phase-specific interfaces or complex template management.
 */

import type { MissionChatState } from '../services/MissionOrchestratorAgent';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

/**
 * System instruction constants - direct instruction strings for different operations
 */
export const SYSTEM_INSTRUCTIONS = {
  WELCOME: `WELCOME PHASE - Generate initial welcome message for the new mission.

INSTRUCTIONS:
1. Introduce yourself as Commander ARIA
2. Provide a brief welcome and mission overview
3. Keep it concise and professional  
4. Ask them to hold on while you assess the mission objective for clarity

Be welcoming and set expectation for analysis phase.`,

  CLARITY_ASSESSMENT: `You are assessing mission clarity. Analyze the conversation context and provide a JSON response with scores 0-10 for each dimension:

Assess these 5 dimensions (0-10 scale):
1. objectiveClarity: How specific and clear is the mission objective?
2. successMetrics: Are success criteria well-defined?
3. timelineDefinition: Is the timeline clear and realistic?
4. scopeBoundaries: Are the boundaries and limitations defined?
5. visionAlignment: How well does it align with the vision?

Respond with ONLY this JSON format:
{
  "objectiveClarity": 7,
  "successMetrics": 5, 
  "timelineDefinition": 6,
  "scopeBoundaries": 8,
  "visionAlignment": 9,
  "reasoning": "Brief explanation of scores and key gaps"
}`,

  CLARITY_QUESTION_FIRST: `This is the first analysis iteration. Start your response by sharing the mission clarity assessment results with the user in a conversational way, then ask ONE focused question to help improve the lowest-scoring area. Be helpful and encouraging.`,

  CLARITY_QUESTION_SUBSEQUENT: `Based on the mission clarity assessment above, ask ONE focused question to help clarify the mission objective.

Be conversational and helpful. Focus on gathering missing information to improve mission clarity.`,

  CLARITY_COMPLETION_FIRST: `This is the first analysis iteration and the mission has achieved sufficient clarity. Start your response by sharing the mission clarity assessment results with the user in a conversational way, then provide a brief, positive completion summary (2-3 sentences) acknowledging readiness to move forward with execution planning. Be encouraging and confident.`,

  CLARITY_COMPLETION_SUBSEQUENT: `The mission clarity assessment is complete and sufficient to proceed.

Generate a brief, positive summary (2-3 sentences) acknowledging that the mission is now clear enough to move forward with execution planning.`,

  CONVERSE: `CONVERSE PHASE - Analyze user request and provide mission-focused guidance.

INSTRUCTIONS:
1. Understand what the user is asking for
2. Consider mission context and active phase
3. Provide specific, actionable response
4. Include relevant mission details if helpful
5. Suggest concrete next steps

Be direct, helpful, and mission-focused.`
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
      this.buildStatusSection()
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
    // Welcome needs minimal context - just mission setup
    return '';
  }
  
  /**
   * Analysis phase context - clarity data and conversation history
   */
  private buildAnalysisPhaseContext(): string {
    return [
      this.buildClaritySection(),
      this.buildConversationSection()
    ].filter(Boolean).join('\n');
  }
  
  /**
   * Converse phase context - recent conversation history
   */
  private buildConversePhaseContext(): string {
    return this.buildConversationSection();
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
    
    return `
ACTIVE PHASE: ${activePhase}
PHASES: INIT → WELCOME → ANALYSIS → CONVERSE`;
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
    const { messages, activePhase } = this.state;
    if (!messages.length) return '';
    
    // Include more messages during analysis phase
    const messageLimit = activePhase === 'analysis' ? 12 : 8;
    const recentMessages = messages.slice(-messageLimit);
    
    const conversationText = recentMessages
      .filter(msg => msg.content && typeof msg.content === 'string')
      .map(msg => {
        let speaker = '';
        if (msg instanceof HumanMessage) {
          speaker = 'User';
        } else if (msg instanceof AIMessage) {
          speaker = 'My previous response';
        } else {
          speaker = 'System';
        }
        return `${speaker}: ${msg.content}`;
      })
      .join('\n\n');
    
    return conversationText ? `\nCONVERSATION HISTORY:\n${conversationText}` : '';
  }
  
}