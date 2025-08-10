/**
 * Mission Orchestrator Agent - Basic AI Response Generation
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using basic LangChain integration with mission context awareness.
 */

import { StateGraph, END, START, Annotation, MemorySaver, MessagesAnnotation } from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { LangChainProvider } from '@starships/agent-engine/src/llm/langchain-provider';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
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
        .addNode("phase_router", this.phaseRouterNode.bind(this))
        .addNode("welcome_phase", this.welcomePhaseNode.bind(this))
        .addNode("converse_phase", this.conversePhaseNode.bind(this))
        .addEdge(START, "context_builder")
        .addEdge("context_builder", "phase_router")
        .addConditionalEdges(
          "phase_router",
          this.determinePhaseRoute.bind(this),
          {
            welcome: "welcome_phase",
            converse: "converse_phase"
          }
        )
        .addEdge("welcome_phase", END)
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
    
    if (!state.metadata) {
      if (!state.missionId) {
        throw new Error('missionId is required in state');
      }
      
      const metadata = await this.loadMissionMetadata(state.missionId);
      updates.metadata = metadata;
      updates.currentPhase = metadata.mission.phase;
    }
    
    return updates;
  }

  /**
   * Phase router node - determines which phase-specific node to execute
   */
  private async phaseRouterNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    // Router node doesn't modify state, just passes it through
    return {};
  }

  /**
   * Conditional edge function to determine phase routing
   */
  private determinePhaseRoute(state: MissionChatState): string {
    return state.currentPhase; // Returns 'welcome' or 'converse'
  }

  /**
   * Welcome phase node - handles initial mission introduction
   */
  private async welcomePhaseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    const latestMessage = state.messages[state.messages.length - 1];
    const promptMessage = typeof latestMessage.content === 'string' ? latestMessage.content : '';
    
    const { metadata } = state;
    const { mission, starship, vision } = metadata!;
    
    const systemPrompt = `You are a Mission Orchestrator AI providing a warm welcome.

WELCOME PHASE - Your primary responsibilities:
- Provide a friendly introduction to the mission
- Explain the mission objectives clearly  
- Outline how you can assist the user
- Encourage questions about the mission
- Be welcoming, informative, and encouraging

MISSION CONTEXT:
- Mission: "${mission.name}"
- Description: ${mission.description}
- Starship: "${starship.name}" (${starship.class || 'Unknown Class'})
- Vision: "${vision.statement}"
- Status: ${mission.status}

CURRENT PROMPT MESSAGE: "${promptMessage}"

Be warm, welcoming, and focus on helping the user understand the mission and your role.`;

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
    const promptMessage = typeof latestMessage.content === 'string' ? latestMessage.content : '';
    
    const { metadata } = state;
    const { mission, starship, vision } = metadata!;
    
    const systemPrompt = `You are a Mission Orchestrator AI engaging in mission conversation.

CONVERSE PHASE - Your primary responsibilities:
- Provide helpful guidance and answers
- Support mission progress and problem-solving
- Be responsive to user questions and needs
- Maintain focus on mission objectives
- Be helpful, knowledgeable, and mission-focused

MISSION CONTEXT:
- Mission: "${mission.name}"
- Description: ${mission.description}
- Starship: "${starship.name}" (${starship.class || 'Unknown Class'})
- Vision: "${vision.statement}"
- Status: ${mission.status}
- Assigned Agents: ${mission.agentIds?.length || 0}

CURRENT PROMPT MESSAGE: "${promptMessage}"

Be helpful, direct, and focused on mission success.`;

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
   * Generate AI response for a user message with mission context - Standard MessagesAnnotation pattern
   */
  async generateResponse(message: string, missionId: string): Promise<string> {
    try {
      // Use cached compiled graph - efficient pattern
      const graph = await this.getGraph();
      const threadId = `mission-${missionId}`;
      
      // Add user message to conversation - standard pattern
      const userMessage = new HumanMessage({ content: message });
      
      const result = await graph.invoke(
        { 
          missionId,
          messages: [userMessage] // MessagesAnnotation automatically handles conversation history
        },
        { configurable: { thread_id: threadId } }
      );

      // Extract response from last AI message - standard pattern
      const lastMessage = result.messages[result.messages.length - 1];
      const responseContent = lastMessage instanceof AIMessage ? lastMessage.content : '';
      const response = typeof responseContent === 'string' ? responseContent : '';

      return response || this.getFallbackResponse(missionId);

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
   * Get recent conversation history for a mission from database
   */
  async getConversationHistory(missionId: string, limit: number = 10): Promise<MissionMessage[]> {
    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      return await missionRepo.getMessagesByMission(missionId, limit);
    } catch (error) {
      this.logger.error('Failed to get conversation history', {
        service: 'MissionOrchestratorAgent',
        operation: 'getConversationHistory',
        resource: 'mission',
        resourceId: missionId
      }, error as Error);
      return []; // Return empty array on error
    }
  }

  /**
   * Clear conversation history for a mission (cleanup) - now a no-op since we use database
   */
  clearConversationHistory(missionId: string): void {
    // Since we're using database storage, this is now a no-op
    // Message cleanup would be handled by database migration/cleanup jobs if needed
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
    const fallbackResponses = [
      "I'm here to help guide your mission. Could you provide more details about what you need assistance with?",
      "I'm experiencing some technical difficulties but I'm still here to support your mission. What specific guidance do you need?",
      "Let me help coordinate your mission activities. What's your current priority or challenge?",
      "I'm ready to assist with mission planning and execution. What would you like to focus on?",
      "How can I help optimize your mission progress today?"
    ];

    // Simple deterministic selection based on missionId
    const index = missionId.length % fallbackResponses.length;
    return fallbackResponses[index];
  }
}