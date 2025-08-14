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
import { MissionPromptBuilder } from '../prompts/MissionPromptBuilder';
import type { 
  Mission, 
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
 * Callbacks for real-time graph execution
 */
export interface GraphExecutionCallbacks {
  onMessageGenerated: (message: AIMessage, nodeId: string, missionId: string) => Promise<void>;
  onPhaseChange?: (newPhase: MissionPhase, missionId: string) => Promise<void>;
  onStateUpdate?: (state: Partial<MissionChatState>) => Promise<void>;
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
  activePhase: MissionPhase | undefined;
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
  
  // Callback storage for real-time execution
  private currentCallbacks?: GraphExecutionCallbacks;
  private currentMissionId?: string;
  
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
            init: "welcome_phase",        // init transitions to welcome
            welcome: "welcome_phase",
            analysis: "analysis_phase",
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
            continue: "analysis_phase", // Stay in analysis for iterative questions
            advance: "converse_phase",   // Move to converse when complete
            end: END
          }
        )
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
    
    // Handle init -> welcome transition automatically
    if (metadata.mission.phase === 'init') {
      updates.activePhase = 'welcome';
    } else {
      updates.activePhase = metadata.mission.phase;
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
   * Conditional edge function to determine phase routing
   */
  private phaseRouterNode(state: MissionChatState): string {
    return state.activePhase || 'welcome'; // Returns current phase or default to welcome
  }

  /**
   * Decide if welcome should auto-continue to analysis
   */
  private shouldContinueFromWelcome(state: MissionChatState): string {
    // Auto-continue from welcome to analysis if it's a system-initiated welcome
    if (state.isSystemInitiated) {
      return 'continue';
    }
    return 'end';
  }

  /**
   * Decide analysis phase continuation - always end to wait for human response
   */
  private shouldContinueFromAnalysis(state: MissionChatState): string {
    const clarity = state.clarity;
    
    if (!clarity) {
      return 'end'; // Something went wrong, stop
    }
    
    // If clarity threshold met OR max iterations reached, advance to converse
    if (clarity.overallScore >= MissionOrchestratorAgent.CLARITY_THRESHOLD || 
        clarity.iteration >= MissionOrchestratorAgent.MAX_CLARITY_ITERATIONS) {
      return 'advance'; // Move to converse_phase
    }
    
    // Always end after generating a question to wait for human response
    return 'end'; // Wait for user to respond, then they'll send another message
  }

  /**
   * Welcome phase node - handles initial mission introduction
   */
  private async welcomePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // Build welcome prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildWelcomePrompt();

    const prompt: LLMChatPrompt = { messages: [{ role: 'system', content: systemPrompt }] };
    const responseContent = await this.callLLM(prompt);
    
    const aiMessage = this.createAIMessage(responseContent, state);
    
    // Save message immediately via callback
    if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
      await this.currentCallbacks.onMessageGenerated(aiMessage, 'welcome_phase', this.currentMissionId);
    }
    
    // Set activePhase to signal transition to analysis after welcome
    return { 
      messages: [aiMessage],
      activePhase: 'analysis'
    };
  }

  /**
   * Interactive Analysis phase node - handles mission clarity assessment with human-in-the-loop Q&A
   * Processes user responses and generates next question or completion when threshold is met
   */
  private async analysisPhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // Assess current clarity (includes all conversation context including any new user answers)
    const clarity = await this.assessAndSaveClarity(state);
    
    // Check if this is the first analysis iteration (show transparency)
    const isFirstIteration = clarity.iteration === 1;
    
    // Check if analysis is complete
    const isComplete = clarity.overallScore >= MissionOrchestratorAgent.CLARITY_THRESHOLD || 
                      clarity.iteration >= MissionOrchestratorAgent.MAX_CLARITY_ITERATIONS;
    
    if (isComplete) {
      // Generate completion summary - analysis is done
      const summary = await this.generateCompletionSummary(state, clarity, isFirstIteration);
      const aiMessage = this.createAIMessage(summary, state);
      
      // Save completion message immediately
      if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
        await this.currentCallbacks.onMessageGenerated(aiMessage, 'analysis_complete', this.currentMissionId);
      }
      
      return {
        messages: [aiMessage],
        clarity,
        activePhase: 'converse' // Transition to converse phase
      };
    } else {
      // Generate next question and END - wait for human response
      const question = await this.generateFocusedQuestion(state, clarity, isFirstIteration);
      const aiMessage = this.createAIMessage(question, state);
      
      // Save analysis question immediately
      if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
        await this.currentCallbacks.onMessageGenerated(aiMessage, 'analysis_question', this.currentMissionId);
      }
      
      return {
        messages: [aiMessage],
        clarity
        // Stay in analysis phase - graph will END and wait for user response
      };
    }
  }

  /**
   * Converse phase node - handles ongoing mission conversation
   */
  private async conversePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // Build converse prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildConversePrompt();

    const prompt: LLMChatPrompt = { messages: [{ role: 'system', content: systemPrompt }] };
    const responseContent = await this.callLLM(prompt);
    
    const aiMessage = this.createAIMessage(responseContent, state);
    
    // Save converse message immediately
    if (this.currentCallbacks?.onMessageGenerated && this.currentMissionId) {
      await this.currentCallbacks.onMessageGenerated(aiMessage, 'converse_phase', this.currentMissionId);
    }
    
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
   * Generate AI response using LangGraph flow - returns both response and final state
   */
  async generateResponseWithState(message: string, missionId: string): Promise<{ response: string; state: Partial<MissionChatState> }> {
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
      const response = lastMessage instanceof AIMessage && typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : this.getFallbackResponse(missionId);

      return { response, state: result };

    } catch (error) {
      this.logger.error('Failed to generate orchestrator response', {
        service: 'MissionOrchestratorAgent',
        operation: 'generateResponseWithState',
        missionId
      }, error as Error);
      
      throw error;
    }
  }

  /**
   * Execute graph with real-time callbacks for immediate message saving
   */
  async executeGraphWithCallbacks(
    missionId: string, 
    input: string, 
    callbacks: GraphExecutionCallbacks,
    isSystemMessage: boolean = false
  ): Promise<{ finalResponse: string; state: Partial<MissionChatState> }> {
    try {
      // Store callbacks and missionId for use in nodes
      this.currentCallbacks = callbacks;
      this.currentMissionId = missionId;

      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      const inputMessage = isSystemMessage 
        ? new SystemMessage({ content: input })
        : new HumanMessage({ content: input });
      
      const result = await graph.invoke(
        { 
          missionId,
          messages: [inputMessage],
          isSystemInitiated: isSystemMessage
        },
        { configurable: { thread_id: threadId } }
      );

      // Extract final response
      const lastMessage = result.messages[result.messages.length - 1];
      const finalResponse = lastMessage instanceof AIMessage && typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : this.getFallbackResponse(missionId);

      // Clear callback storage
      this.currentCallbacks = undefined;
      this.currentMissionId = undefined;

      return { finalResponse, state: result };

    } catch (error) {
      // Clear callback storage on error
      this.currentCallbacks = undefined;
      this.currentMissionId = undefined;

      this.logger.error('Failed to execute graph with callbacks', {
        service: 'MissionOrchestratorAgent',
        operation: 'executeGraphWithCallbacks',
        missionId
      }, error as Error);
      
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
   * Generate system-initiated response with state - returns both response and final state
   */
  async generateSystemResponseWithState(missionId: string, message: string): Promise<{ response: string; state: Partial<MissionChatState> }> {
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
      const response = lastMessage instanceof AIMessage && typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : this.getFallbackResponse(missionId);

      return { response, state: result };

    } catch (error) {
      this.logger.error('Failed to generate system response', error as Error);
      throw error;
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

    console.log({ prompt: prompt.messages[0] })

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
  private getFallbackResponse(_missionId: string): string {
    return `I'm here to help guide your mission. Could you provide more details about what you need assistance with?`;
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
    // Build clarity assessment prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildClarityAssessmentPrompt();

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
  private async generateFocusedQuestion(state: MissionChatState, _clarity: MissionClarity, isFirstIteration: boolean = false): Promise<string> {
    // Build clarity question prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildClarityQuestionPrompt(isFirstIteration);

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
  private async generateCompletionSummary(state: MissionChatState, _clarity: MissionClarity, isFirstIteration: boolean = false): Promise<string> {
    // Build clarity completion prompt using the new builder
    const systemPrompt = new MissionPromptBuilder(state).buildClarityCompletionPrompt(isFirstIteration);

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