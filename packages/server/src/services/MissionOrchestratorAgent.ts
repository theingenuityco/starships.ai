/**
 * Mission Orchestrator Agent - Basic AI Response Generation
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using basic LangChain integration with mission context awareness.
 */

import { StateGraph, END, START, Annotation, MemorySaver, MessagesAnnotation } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LangChainProvider } from '@starships/agent-engine/src/llm/langchain-provider';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { MISSION_PROMPTS, renderTemplate } from '../prompts/missionPrompts';
import type { 
  Mission, 
  MissionMessage,
  MissionPhase,
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
};

/**
 * MissionOrchestratorAgent - Generates intelligent AI responses for mission coordination
 */
export class MissionOrchestratorAgent {
  private logger: Logger;
  private llmProvider: LLMProvider | null = null;
  private checkpointer = new MemorySaver();
  private compiledGraph: any = null; // Cache compiled graph
  
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
          const missionRepo = RepositoryFactory.getMissionRepository();
          await missionRepo.updateMission(state.missionId, { phase: 'welcome' });
          updates.currentPhase = 'welcome';
        } catch (error) {
          this.logger.error('Failed to auto-transition phase', error as Error);
        }
      }
    
    return updates;
  }

  /**
   * Build context string from state for use in prompts
   */
  private buildContext(state: MissionChatState): string {
    const { metadata, currentPhase } = state;
    const { mission, starship, vision } = metadata!;
    
    return renderTemplate(MISSION_PROMPTS.CONTEXT, {
      currentPhase,
      mission,
      starship,
      vision
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
    
    const aiMessage = new AIMessage({ content: responseContent });
    return { messages: [aiMessage] };
  }

  /**
   * Analysis phase node - handles mission analysis and breakdown
   */
  private async analysisPhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    const latestMessage = state.messages[state.messages.length - 1];
    const userMessage = typeof latestMessage.content === 'string' ? latestMessage.content : '';
    
    // Build complete analysis prompt using template literals
    const context = this.buildContext(state);
    const analysisPhase = renderTemplate(MISSION_PROMPTS.ANALYSIS_PHASE, {
      userMessage
    });
    
    const systemPrompt = `${context}

${analysisPhase}`;

    const prompt: LLMChatPrompt = { messages: [{ role: 'system', content: systemPrompt }] };
    const responseContent = await this.callLLM(prompt);
    
    const aiMessage = new AIMessage({ content: responseContent });
    return { messages: [aiMessage] };
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
    
    const aiMessage = new AIMessage({ content: responseContent });
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
}