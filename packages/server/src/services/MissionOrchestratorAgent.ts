/**
 * Mission Orchestrator Agent - Basic AI Response Generation
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using basic LangChain integration with mission context awareness.
 */

import { StateGraph, END, START, Annotation, MemorySaver, MessagesAnnotation } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { LangChainProvider } from '@starships/agent-engine/src/llm/langchain-provider';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { MissionEventService } from './MissionEventService';
import { MissionService } from './MissionService';
import { MISSION_PROMPTS, renderTemplate } from '../prompts/missionPrompts';
import type { 
  Mission, 
  MissionMessage,
  MissionPhase,
  MissionClarity,
  CreateMissionClarityRequest,
  LLMChatPrompt,
  LLMProvider
} from '@starships/protocol';
import type { LLM, Starship, Vision } from '@starships/models';

/**
 * Configuration for MissionOrchestratorAgent
 */
export interface MissionOrchestratorAgentConfig {
  temperature?: number;
  maxTokens?: number;
  provider?: 'openai' | 'anthropic';
  model?: string;
}


/**
 * Mission metadata for AI response generation
 */
interface MissionMetadata {
  mission: Mission;
  starship: Starship;
  vision: Vision;
}

/**
 * Standard MessagesAnnotation pattern with mission context
 * Extends MessagesAnnotation to include mission-specific metadata caching
 */
const MissionChatStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec, // Standard messages handling
  missionId: Annotation<string>(),
  currentPhase: Annotation<MissionPhase>(),
  isSystemInitiated: Annotation<boolean>({
    value: (x, y) => y ?? x,
    default: () => false
  }),
  metadata: Annotation<MissionMetadata | null>({
    value: (x, y) => y ?? x,
    default: () => null
  }),
  
  // ADDED: Current clarity for context and iteration tracking
  clarity: Annotation<MissionClarity | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  })
});

/**
 * Properly typed state interface for better type safety
 * Combines MessagesAnnotation.State with mission-specific fields
 */
export type MissionChatState = typeof MessagesAnnotation.State & {
  missionId: string;
  currentPhase: MissionPhase;
  isSystemInitiated: boolean;
  metadata: MissionMetadata | null;
  clarity: MissionClarity | undefined; // ADDED: Mission clarity state
};

/**
 * MissionOrchestratorAgent - Generates intelligent AI responses for mission coordination
 */
export class MissionOrchestratorAgent {
  private logger: Logger;
  private llmProvider: LLMProvider | null = null;
  private checkpointer = new MemorySaver();
  private compiledGraph: any = null; // Cache compiled graph
  
  // Clarity assessment configuration constants
  private static readonly CLARITY_THRESHOLD = 7.0;
  private static readonly MAX_CLARITY_ITERATIONS = 10;
  
  private readonly config: Required<MissionOrchestratorAgentConfig> = {
    temperature: 0.7,
    maxTokens: 1000,
    provider: 'openai',
    model: 'gpt-4'
  };

  constructor(config?: Partial<MissionOrchestratorAgentConfig>) {
    this.logger = Logger.getInstance();
    
    // Merge provided config with defaults
    if (config) {
      Object.assign(this.config, config);
    }

  }

  /**
   * Get cached compiled graph (compile once, reuse many times)
   */
  private async getGraph() {
    if (!this.compiledGraph) {
      this.compiledGraph = new StateGraph(MissionChatStateAnnotation)
        .addNode("context_builder", this.contextBuilderNode.bind(this))
        .addNode("welcome_phase", this.welcomePhaseNode.bind(this))
        .addNode("analysis_phase", this.analysisPhaseNode.bind(this))
        .addNode("converse_phase", this.conversePhaseNode.bind(this))
        .addEdge(START, "context_builder")
        .addConditionalEdges(
          "context_builder",
          this.phaseRouterNode.bind(this),
          {
            init: "welcome_phase",      // init phase also goes to welcome (fallback)
            welcome: "welcome_phase",
            analysis: "analysis_phase",
            converse: "converse_phase"
          }
        )
        .addEdge("welcome_phase", END)
        .addEdge("analysis_phase", END)
        .addEdge("converse_phase", END)
        .compile({ checkpointer: this.checkpointer });
    }
    
    return this.compiledGraph;
  }

  /**
   * Build mission context - loads metadata and sets current phase
   */
  private async contextBuilderNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    const updates: Partial<MissionChatState> = {};
    
    // Always reload metadata to get fresh mission phase
    if (!state.missionId) {
      throw new Error('missionId is required in state');
    }
    
    const metadata = await this.loadMissionMetadata(state.missionId);
    updates.metadata = metadata;
    updates.currentPhase = metadata.mission.phase;
      
      // For system-initiated messages, auto-transition to welcome if in init
      if (state.isSystemInitiated && metadata.mission.phase === 'init') {
        try {
          // Use MissionService to ensure WebSocket events are emitted
          await MissionService.updateMission(state.missionId, { phase: 'welcome' });
          updates.currentPhase = 'welcome';
        } catch (error) {
          this.logger.error('Failed to auto-transition phase', error as Error);
        }
      }
    
    return updates;
  }

  /**
   * Create AIMessage with Commander ARIA name
   */
  private createAIMessage(content: string, state: MissionChatState): AIMessage {
    return new AIMessage({ 
      content,
      name: `Commander ARIA-${state.missionId.slice(-4)}`
    });
  }

  /**
   * Create HumanMessage
   */
  private createHumanMessage(content: string): HumanMessage {
    return new HumanMessage({ content });
  }

  /**
   * Build context string from state for use in prompts
   * Now includes clarity data when available
   */
  private buildContext(state: MissionChatState): string {
    const { metadata, currentPhase, clarity } = state;
    const { mission, starship, vision } = metadata!;
    
    // Include conversation history using dedicated method
    const conversationHistory = this.buildConversationHistory(state);
    
    return renderTemplate(MISSION_PROMPTS.CONTEXT, {
      currentPhase,
      mission,
      starship,
      vision,
      clarity,
      conversationHistory
    });
  }

  /**
   * Conditional edge function to determine phase routing
   */
  private phaseRouterNode(state: MissionChatState): string {
    return state.currentPhase; // Returns 'welcome' or 'converse'
  }

  /**
   * Welcome phase node - handles initial mission introduction
   */
  private async welcomePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    const latestMessage = state.messages[state.messages.length - 1];
    const systemMessage = typeof latestMessage.content === 'string' ? latestMessage.content : '';
    
    // Build complete welcome prompt using template literals
    const context = this.buildContext(state);
    const welcomePhase = renderTemplate(MISSION_PROMPTS.WELCOME_PHASE, {
      systemMessage,
      isSystemInitiated: !!state.isSystemInitiated
    });
    
    const systemPrompt = `${context}

${welcomePhase}`;

    const prompt: LLMChatPrompt = { messages: [{ role: 'system', content: systemPrompt }] };
    const responseContent = await this.callLLM(prompt);
    
    // After welcome message, transition to analysis phase for clarity assessment
    await MissionService.updateMission(state.missionId, { phase: 'analysis' });
    
    const aiMessage = this.createAIMessage(responseContent, state);
    return { 
      messages: [aiMessage],
      currentPhase: 'analysis'
    };
  }

  /**
   * ENHANCED Analysis phase node - handles mission clarity assessment with iterative questioning
   * Uses buildContext() which now includes clarity data, and MISSION_PROMPTS for consistency
   */
  private async analysisPhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // 1. EVALUATE: AI assessment + DB save
    const clarity = await this.assessAndSaveClarity(state);
    
    // 2. CHECK: Threshold evaluation  
    const isComplete = clarity.overallScore >= MissionOrchestratorAgent.CLARITY_THRESHOLD || 
                      clarity.iteration >= MissionOrchestratorAgent.MAX_CLARITY_ITERATIONS;
    
    // 3. DECISION: Complete or continue
    if (isComplete) {
      // COMPLETE: Transition to converse phase
      await MissionService.updateMission(state.missionId, { phase: 'converse' });
      
      const summary = await this.generateCompletionSummary(state, clarity);
      return {
        currentPhase: 'converse',
        messages: [this.createAIMessage(summary, state)],
        clarity
      };
    } else {
      // ASK: Generate next clarifying question using context with clarity data
      const question = await this.generateFocusedQuestion(state, clarity);
      return {
        messages: [this.createAIMessage(question, state)],
        clarity // Update state with latest clarity
      };
    }
  }

  /**
   * Converse phase node - handles ongoing mission conversation
   */
  private async conversePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    const latestMessage = state.messages[state.messages.length - 1];
    const userMessage = typeof latestMessage.content === 'string' ? latestMessage.content : '';
    
    // Build complete converse prompt using template literals
    const context = this.buildContext(state);
    const conversePhase = renderTemplate(MISSION_PROMPTS.CONVERSE_PHASE, {
      userMessage
    });
    
    const systemPrompt = `${context}

${conversePhase}`;

    const prompt: LLMChatPrompt = { messages: [{ role: 'system', content: systemPrompt }] };
    const responseContent = await this.callLLM(prompt);
    
    const aiMessage = this.createAIMessage(responseContent, state);
    return { messages: [aiMessage] };
  }

  /**
   * Load mission metadata once per conversation (replaces buildMissionContext)
   */
  private async loadMissionMetadata(missionId: string): Promise<MissionMetadata> {
    try {
      // Step 1: Get mission first to access starshipId
      const missionRepo = RepositoryFactory.getMissionRepository();
      const mission = await missionRepo.getMissionById(missionId);

      // Step 2: Validate required data
      if (!mission.starshipId) {
        this.logger.error('Mission has no associated starship', {
          missionId,
          mission: { id: mission.id, name: mission.name }
        });
        throw new Error(`Mission ${missionId} has no associated starship`);
      }

      // Step 3: Get repositories following existing patterns  
      const starshipRepo = RepositoryFactory.getStarshipRepository();
      const visionRepo = RepositoryFactory.getVisionRepository();

      // Step 4: Parallel fetch with proper error context
      const [starship, vision] = await Promise.all([
        starshipRepo.findById(mission.starshipId),
        visionRepo.findByStarship(mission.starshipId)
      ]);

      // Step 5: Validate all required data exists
      if (!starship) {
        this.logger.error('Starship not found', {
          starshipId: mission.starshipId,
          missionName: mission.name
        });
        throw new Error(`Starship not found: ${mission.starshipId}`);
      }

      if (!vision) {
        this.logger.error('Vision not found for starship', {
          starshipId: mission.starshipId,
          starshipName: starship.name
        });
        throw new Error(`Vision not found for starship: ${mission.starshipId}`);
      }

      const metadata: MissionMetadata = {
        mission,
        starship,
        vision
      };

      return metadata;

    } catch (error) {
      this.logger.error('Failed to load mission metadata', error as Error);
      throw error;
    }
  }

  /**
   * Generate AI response using LangGraph flow - respects graph state transitions
   */
  async generateResponse(message: string, missionId: string): Promise<string> {
    try {
      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      // Create user message and let LangGraph handle the flow
      const userMessage = new HumanMessage({ content: message });
      
      // Invoke the graph - it will handle context building, phase routing, and response generation
      const result = await graph.invoke(
        { 
          missionId,
          messages: [userMessage]
        },
        { configurable: { thread_id: threadId } }
      );

      // Extract final AI response from the graph result
      const lastMessage = result.messages[result.messages.length - 1];
      if (lastMessage instanceof AIMessage) {
        return typeof lastMessage.content === 'string' ? lastMessage.content : '';
      }

      return this.getFallbackResponse(missionId);

    } catch (error) {
      this.logger.error('Failed to generate orchestrator response', {
        service: 'MissionOrchestratorAgent',
        operation: 'generateResponse',
        missionId
      }, error as Error);
      return this.getFallbackResponse(missionId);
    }
  }



  /**
   * Generate system-initiated response (no user input required)
   */
  async generateSystemResponse(missionId: string, message: string): Promise<string> {
    try {
      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      const systemMessage = new SystemMessage({ 
        content: message
      });
      
      const result = await graph.invoke(
        { 
          missionId,
          messages: [systemMessage],
          isSystemInitiated: true
        },
        { configurable: { thread_id: threadId } }
      );

      const lastMessage = result.messages[result.messages.length - 1];
      if (lastMessage instanceof AIMessage) {
        return typeof lastMessage.content === 'string' ? lastMessage.content : '';
      }

      return this.getFallbackResponse(missionId);

    } catch (error) {
      this.logger.error('Failed to generate system response', error as Error);
      return this.getFallbackResponse(missionId);
    }
  }


  /**
   * Call LLM provider for response generation
   */
  private async callLLM(prompt: LLMChatPrompt): Promise<string> {
    // Initialize LLM provider if not already done
    if (!this.llmProvider) {
      await this.initializeLLMProvider();
    }

    if (!this.llmProvider) {
      throw new Error('LLM provider not initialized');
    }

    const result = await this.llmProvider.complete(prompt, {
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    });

    return result.reply;
  }

  /**
   * Initialize LLM provider with default model configuration
   */
  private async initializeLLMProvider(): Promise<void> {
    try {
      // Create a basic LLM configuration
      // TODO: Load from database configuration when available
      const llmConfig: LLM = {
        id: 'default-mission-orchestrator',
        name: this.config.model,
        provider: this.config.provider,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        createdAt: new Date().toISOString()
      };

      this.llmProvider = new LangChainProvider(llmConfig);


    } catch (error) {
      this.logger.error('Failed to initialize LLM provider', {
        service: 'MissionOrchestratorAgent',
        operation: 'initializeLLMProvider'
      }, error as Error);
      throw error;
    }
  }


  /**
   * Generate fallback response when LLM fails
   */
  private getFallbackResponse(missionId: string): string {
    return MISSION_PROMPTS.FALLBACK;
  }

  // ============================================================================
  // CLARITY ASSESSMENT METHODS
  // ============================================================================

  /**
   * Main orchestrator method - assesses clarity and saves to database
   */
  private async assessAndSaveClarity(state: MissionChatState): Promise<MissionClarity> {
    try {
      // Get current iteration count
      const currentClarity = await this.getClarityFromDB(state.missionId);
      const iteration = (currentClarity?.iteration || 0) + 1;
      
      // Update state with current clarity for context (convert null to undefined)
      const stateWithClarity = { ...state, clarity: currentClarity || undefined };
      
      // Assess clarity using AI with full context
      const clarityRequest = await this.assessMissionClarity(stateWithClarity, iteration);
      clarityRequest.missionId = state.missionId; // Set the mission ID
      
      // Save to database
      const clarityRepo = RepositoryFactory.getMissionClarityRepository();
      const updatedClarity = await clarityRepo.upsertByMissionId(state.missionId, clarityRequest);
      
      // Emit real-time clarity update
      const missionEventService = MissionEventService.getInstance();
      missionEventService.emitClarityUpdate(state.missionId, updatedClarity);
      
      return updatedClarity;
    } catch (error) {
      this.logger.error('Failed to assess and save clarity', {
        service: 'MissionOrchestratorAgent',
        operation: 'assessAndSaveClarity',
        missionId: state.missionId
      }, error as Error);
      throw error;
    }
  }

  /**
   * AI clarity assessment using LLM - returns structured clarity data
   * Uses full context (including existing clarity data) via buildContext
   */
  private async assessMissionClarity(state: MissionChatState, iteration: number): Promise<CreateMissionClarityRequest> {
    // Build full context including mission, vision, and any existing clarity
    const context = this.buildContext(state);
    const clarityPrompt = renderTemplate(MISSION_PROMPTS.CLARITY_ASSESSMENT, {});

    const systemPrompt = `${context}

${clarityPrompt}`;

    const prompt: LLMChatPrompt = {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };

    const response = await this.callLLM(prompt);
    const clarityData = this.parseJSONResponse(response);
    
    return {
      missionId: '', // Will be set by caller
      objectiveClarity: clarityData.objectiveClarity,
      successMetrics: clarityData.successMetrics,
      timelineDefinition: clarityData.timelineDefinition,
      scopeBoundaries: clarityData.scopeBoundaries,
      visionAlignment: clarityData.visionAlignment,
      reasoning: clarityData.reasoning,
      iteration
    };
  }

  /**
   * Generate focused question based on clarity assessment
   */
  private async generateFocusedQuestion(state: MissionChatState, clarity: MissionClarity): Promise<string> {
    // Build context same as other phases (includes clarity assessment and conversation)
    const context = this.buildContext(state);
    const questionPrompt = renderTemplate(MISSION_PROMPTS.CLARITY_QUESTION, {});

    const systemPrompt = `${context}

${questionPrompt}`;

    const prompt: LLMChatPrompt = {
      messages: [{
        role: 'system', 
        content: systemPrompt
      }]
    };

    return await this.callLLM(prompt);
  }

  /**
   * Generate completion summary when clarity threshold is met
   */
  private async generateCompletionSummary(state: MissionChatState, clarity: MissionClarity): Promise<string> {
    // Build context same as other phases (includes clarity assessment and conversation)
    const context = this.buildContext(state);
    const completionPrompt = renderTemplate(MISSION_PROMPTS.CLARITY_COMPLETION, {});

    const systemPrompt = `${context}

${completionPrompt}`;

    const prompt: LLMChatPrompt = {
      messages: [{
        role: 'system',
        content: systemPrompt
      }]
    };

    return await this.callLLM(prompt);
  }

  /**
   * Get clarity from database for iteration tracking
   */
  private async getClarityFromDB(missionId: string): Promise<MissionClarity | null> {
    try {
      const clarityRepo = RepositoryFactory.getMissionClarityRepository();
      return await clarityRepo.getByMissionId(missionId);
    } catch (error) {
      this.logger.error('Failed to get clarity from database', {
        service: 'MissionOrchestratorAgent',
        operation: 'getClarityFromDB',
        missionId
      }, error as Error);
      return null;
    }
  }

  /**
   * Build conversation history for context inclusion
   * Handles filtering, windowing, and formatting for context
   */
  private buildConversationHistory(state: MissionChatState): string {
    if (state.messages.length === 0) {
      return '';
    }

    // Simple windowing - keep last 8 messages to prevent context overflow
    const recentMessages = state.messages.slice(-8);
    
    return this.buildConversationText(recentMessages);
  }

  /**
   * Build conversation text from LangChain messages
   * Simple utility method for formatting messages as text
   */
  private buildConversationText(messages: BaseMessage[]): string {
    return messages
      .filter(msg => msg.content && typeof msg.content === 'string')
      .map(msg => {
        // Use self-ownership language to evoke stronger identity
        let speaker = '';
        if (msg instanceof HumanMessage) {
          speaker = 'User';
        } else if (msg instanceof AIMessage) {
          speaker = 'My previous response'; // Creates self-ownership and identity
        } else {
          speaker = 'System';
        }
        return `${speaker}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Parse JSON response from LLM with error handling
   */
  private parseJSONResponse(response: string): any {
    try {
      // Extract JSON from response if wrapped in text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      
      const parsed = JSON.parse(jsonStr);
      this.validateClarity(parsed);
      return parsed;
    } catch (error) {
      this.logger.error('Failed to parse JSON response', {
        service: 'MissionOrchestratorAgent',
        operation: 'parseJSONResponse',
        response: response.substring(0, 200)
      }, error as Error);
      
      // Return default scores if parsing fails
      return {
        objectiveClarity: 5,
        successMetrics: 5,
        timelineDefinition: 5,
        scopeBoundaries: 5,
        visionAlignment: 5,
        reasoning: 'Unable to parse AI assessment, using default scores'
      };
    }
  }

  /**
   * Validate clarity assessment structure and ranges
   */
  private validateClarity(clarity: any): void {
    const requiredFields = ['objectiveClarity', 'successMetrics', 'timelineDefinition', 'scopeBoundaries', 'visionAlignment', 'reasoning'];
    const errors: string[] = [];
    
    for (const field of requiredFields) {
      if (clarity[field] === undefined) {
        errors.push(`Missing field: ${field}`);
      }
    }
    
    // Validate score ranges (0-10)
    const scoreFields = requiredFields.slice(0, 5); // First 5 are scores
    for (const field of scoreFields) {
      const score = clarity[field];
      if (typeof score !== 'number' || score < 0 || score > 10) {
        errors.push(`Invalid score for ${field}: must be number 0-10, got ${score}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Clarity validation failed: ${errors.join(', ')}`);
    }
  }
}