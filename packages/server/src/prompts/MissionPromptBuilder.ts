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

Be direct, helpful, and mission-oriented.`
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
PHASES: INIT → WELCOME → ANALYSIS → CONVERSE
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
  
}