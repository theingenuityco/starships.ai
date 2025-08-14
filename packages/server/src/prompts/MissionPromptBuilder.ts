/**
 * MissionPromptBuilder - State-driven prompt generation for mission orchestration
 * 
 * This class builds appropriate prompts based on the current mission state,
 * eliminating the need for separate phase-specific interfaces or complex template management.
 */

import type { MissionChatState } from '../services/MissionOrchestratorAgent';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

export class MissionPromptBuilder {
  // Constants for clarity assessment
  private static readonly CLARITY_THRESHOLD = 7.0;
  private static readonly MAX_CLARITY_ITERATIONS = 10;
  
  // Trigger messages for different phases
  public static readonly WELCOME_TRIGGER = 'WELCOME_TRIGGER';

  constructor(private state: MissionChatState) {}
  
  /**
   * Main entry point - builds appropriate prompt based on state
   */
  buildPrompt(additionalContext?: string): string {
    const context = this.buildContext();
    const instructions = this.buildInstructions(additionalContext);
    
    return `${context}\n\n${instructions}`;
  }

  /**
   * Builds prompt specifically for clarity assessment (bypasses phase-based routing)
   */
  buildClarityAssessmentPrompt(): string {
    const context = this.buildContext();
    const instructions = this.buildClarityAssessmentInstructions();
    
    return `${context}\n\n${instructions}`;
  }

  /**
   * Builds prompt specifically for clarity questions (bypasses phase-based routing)
   */
  buildClarityQuestionPrompt(isFirstIteration: boolean): string {
    const context = this.buildContext();
    const instructions = this.buildClarityQuestionInstructions(isFirstIteration);
    
    return `${context}\n\n${instructions}`;
  }

  /**
   * Builds prompt specifically for clarity completion (bypasses phase-based routing)
   */
  buildClarityCompletionPrompt(isFirstIteration: boolean): string {
    const context = this.buildContext();
    const instructions = this.buildClarityCompletionInstructions(isFirstIteration);
    
    return `${context}\n\n${instructions}`;
  }
  
  // ============================================================================
  // CORE BUILDING METHODS
  // ============================================================================
  
  private buildContext(): string {
    return [
      this.buildIdentitySection(),
      this.buildMissionSection(),
      this.buildClaritySection(),
      this.buildConversationSection()
    ].filter(Boolean).join('\n');
  }
  
  private buildInstructions(additionalContext?: string): string {
    const { activePhase } = this.state;
    
    let instructions = '';
    
    switch (activePhase) {
      case 'welcome':
        instructions = this.buildWelcomeInstructions();
        break;
      case 'analysis':
        instructions = this.buildAnalysisInstructions();
        break;
      case 'converse':
        instructions = this.buildConverseInstructions();
        break;
      default:
        instructions = this.buildFallbackInstructions();
    }
    
    return additionalContext ? `${instructions}\n\n${additionalContext}` : instructions;
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
    const { metadata, activePhase } = this.state;
    if (!metadata) return '';
    
    const { mission, starship, vision } = metadata;
    
    return `MISSION: "${mission.name}"
├─ OBJECTIVE: ${mission.description}
├─ STARSHIP: ${starship.name} (${starship.class}-class)
├─ VISION: ${vision.statement}
└─ STATUS: ${mission.status}

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
  
  // ============================================================================
  // PHASE-SPECIFIC INSTRUCTION BUILDERS
  // ============================================================================
  
  private buildWelcomeInstructions(): string {
    return `WELCOME PHASE - Generate initial welcome message for the new mission.

INSTRUCTIONS:
1. Introduce yourself as Commander ARIA
2. Provide a brief welcome and mission overview
3. Keep it concise and professional  
4. Ask them to hold on while you assess the mission objective for clarity

Be welcoming and set expectation for analysis phase.`;
  }

  private buildAnalysisInstructions(): string {
    const { clarity } = this.state;
    const isFirstIteration = clarity?.iteration === 1;
    
    // Determine if we're doing assessment, question, or completion
    if (!clarity) {
      return this.buildClarityAssessmentInstructions();
    }
    
    const isComplete = this.isClarityComplete();
    
    if (isComplete) {
      return this.buildClarityCompletionInstructions(isFirstIteration);
    } else {
      return this.buildClarityQuestionInstructions(isFirstIteration);
    }
  }

  private buildConverseInstructions(): string {
    const latestMessage = this.getLatestMessage();
    const userMessage = latestMessage?.content || '';
    
    return `CONVERSE PHASE - Analyze user request and provide mission-focused guidance.

USER REQUEST: "${userMessage}"

INSTRUCTIONS:
1. Understand what the user is asking for
2. Consider mission context and active phase
3. Provide specific, actionable response
4. Include relevant mission details if helpful
5. Suggest concrete next steps

Be direct, helpful, and mission-focused.`;
  }
  
  // ============================================================================
  // CLARITY-SPECIFIC INSTRUCTION BUILDERS
  // ============================================================================
  
  private buildClarityAssessmentInstructions(): string {
    return `You are assessing mission clarity. Analyze the conversation context and provide a JSON response with scores 0-10 for each dimension:

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
}`;
  }

  private buildClarityQuestionInstructions(isFirstIteration: boolean): string {
    if (isFirstIteration) {
      return `This is the first analysis iteration. Start your response by sharing the mission clarity assessment results with the user in a conversational way, then ask ONE focused question to help improve the lowest-scoring area. Be helpful and encouraging.`;
    } else {
      return `Based on the mission clarity assessment above, ask ONE focused question to help clarify the mission objective.

Be conversational and helpful. Focus on gathering missing information to improve mission clarity.`;
    }
  }

  private buildClarityCompletionInstructions(isFirstIteration: boolean): string {
    if (isFirstIteration) {
      return `This is the first analysis iteration and the mission has achieved sufficient clarity. Start your response by sharing the mission clarity assessment results with the user in a conversational way, then provide a brief, positive completion summary (2-3 sentences) acknowledging readiness to move forward with execution planning. Be encouraging and confident.`;
    } else {
      return `The mission clarity assessment is complete and sufficient to proceed.

Generate a brief, positive summary (2-3 sentences) acknowledging that the mission is now clear enough to move forward with execution planning.`;
    }
  }

  private buildFallbackInstructions(): string {
    return `I'm here to help guide your mission. Could you provide more details about what you need assistance with?`;
  }
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  private getLatestMessage(): BaseMessage | undefined {
    return this.state.messages[this.state.messages.length - 1];
  }

  private isClarityComplete(): boolean {
    const { clarity } = this.state;
    if (!clarity) return false;
    
    return clarity.overallScore >= MissionPromptBuilder.CLARITY_THRESHOLD || 
           clarity.iteration >= MissionPromptBuilder.MAX_CLARITY_ITERATIONS;
  }
}