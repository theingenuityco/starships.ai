/**
 * Mission Orchestrator Agent - Basic AI Response Generation
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using basic LangChain integration with mission context awareness.
 */

import { StateGraph, END, START, Annotation, MemorySaver } from '@langchain/langgraph';
import { LangChainProvider } from '@starships/agent-engine/src/llm/langchain-provider';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import type { 
  Mission, 
  MissionMessage,
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
 * Minimal LangGraph state annotation for mission chat
 * - Only caches mission metadata to avoid repeated DB queries
 * - Conversation memory handled by LangGraph checkpointer
 */
const MissionChatStateAnnotation = Annotation.Root({
  missionId: Annotation<string>(),
  metadata: Annotation<MissionMetadata | null>({
    value: (x, y) => y ?? x,
    default: () => null
  }),
  response: Annotation<string | undefined>({
    value: (x, y) => y ?? x,
    default: () => undefined
  })
});

/**
 * Properly typed state interface for better type safety
 * This provides the actual runtime type that the state will have
 */
export interface MissionChatState {
  missionId: string;
  metadata: MissionMetadata | null;
  response: string | undefined;
}

/**
 * MissionOrchestratorAgent - Generates intelligent AI responses for mission coordination
 */
export class MissionOrchestratorAgent {
  private logger: Logger;
  private llmProvider: LLMProvider | null = null;
  private checkpointer = new MemorySaver();
  
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

    this.logger.info('MissionOrchestratorAgent initialized', {
      service: 'MissionOrchestratorAgent',
      operation: 'constructor',
      metadata: { config: this.config }
    });
  }

  /**
   * Create minimal LangGraph workflow for mission chat conversations
   */
  private async createMissionChatGraph() {
    return new StateGraph(MissionChatStateAnnotation)
      .addNode("ensure_metadata", this.ensureMetadataNode.bind(this))
      .addNode("generate_response", this.generateResponseNode.bind(this))
      .addEdge(START, "ensure_metadata")
      .addEdge("ensure_metadata", "generate_response")
      .addEdge("generate_response", END)
      .compile({ checkpointer: this.checkpointer });
  }

  /**
   * Load mission metadata once per conversation
   */
  private async ensureMetadataNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    if (!state.metadata) {
      this.logger.info('Loading mission metadata for first time', {
        service: 'MissionOrchestratorAgent',
        operation: 'ensureMetadataNode',
        missionId: state.missionId
      });
      
      if (!state.missionId) {
        throw new Error('missionId is required in state');
      }
      
      const metadata = await this.loadMissionMetadata(state.missionId);
      return { metadata };
    }
    
    this.logger.info('Reusing cached mission metadata', {
      service: 'MissionOrchestratorAgent',
      operation: 'ensureMetadataNode',
      missionId: state.missionId
    });
    
    return {}; // No changes needed
  }

  /**
   * Generate response using cached metadata
   */
  private async generateResponseNode(state: MissionChatState): Promise<Partial<MissionChatState>> {
    this.logger.info('Generating AI response with cached metadata', {
      service: 'MissionOrchestratorAgent',
      operation: 'generateResponseNode'
    });

    // Use state.metadata which is guaranteed to exist by previous node
    const prompt = this.buildPromptWithMetadata(state.metadata!);
    const response = await this.callLLM(prompt);
    
    return { response }; // This gets returned to the caller
  }

  /**
   * Load mission metadata once per conversation (replaces buildMissionContext)
   */
  private async loadMissionMetadata(missionId: string): Promise<MissionMetadata> {
    const context = {
      service: 'MissionOrchestratorAgent',
      operation: 'loadMissionMetadata',
      resource: 'mission',
      resourceId: missionId
    };

    try {
      // Step 1: Get mission first to access starshipId
      const missionRepo = RepositoryFactory.getMissionRepository();
      const mission = await missionRepo.getMissionById(missionId);

      // Step 2: Validate required data
      if (!mission.starshipId) {
        this.logger.error('Mission has no associated starship', {
          ...context,
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
          ...context,
          starshipId: mission.starshipId,
          missionName: mission.name
        });
        throw new Error(`Starship not found: ${mission.starshipId}`);
      }

      if (!vision) {
        this.logger.error('Vision not found for starship', {
          ...context,
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

      // Step 6: Success logging with enhanced metadata
      this.logger.info('Loaded mission metadata successfully', {
        ...context,
        metadata: { 
          starshipName: starship.name,
          starshipClass: starship.class,
          visionLength: vision.statement?.length || 0,
          agentCount: mission.agentIds?.length || 0,
          missionStatus: mission.status
        }
      });

      return metadata;

    } catch (error) {
      this.logger.error('Failed to load mission metadata', context, error as Error);
      throw error;
    }
  }

  /**
   * Build LLM prompt with mission metadata (replaces buildPrompt)
   */
  private buildPromptWithMetadata(metadata: MissionMetadata): LLMChatPrompt {
    const { mission, starship, vision } = metadata;

    // Enhanced system prompt with mission context
    const systemPrompt = `You are a Mission Orchestrator AI assistant providing intelligent guidance and coordination for starship missions.

MISSION CONTEXT:
- Mission: "${mission.name}"
- Description: ${mission.description}
- Status: ${mission.status}
- Starship: "${starship.name}" (${starship.class || 'Unknown Class'})
- Vision: "${vision.statement}"
- Assigned Agents: ${mission.agentIds?.length || 0}
- Max Agents: ${starship.maxAgents}
- Max Expeditions: ${starship.maxActiveExpeditions}
- Created: ${new Date(mission.createdAt).toLocaleDateString()}

STARSHIP VISION:
${vision.statement}

ROLE & RESPONSIBILITIES:
- Provide helpful guidance aligned with the starship's vision
- Answer questions about mission objectives and progress
- Suggest next steps based on starship capabilities
- Maintain awareness of mission context and agent capabilities
- Be concise, actionable, and mission-focused

COMMUNICATION STYLE:
- Professional but approachable
- Clear, direct, and concise
- Keep responses brief (2-3 sentences max for greetings)
- Action-oriented suggestions
- Mission-context and vision-aware responses`;

    // For now, return simple system prompt
    // Conversation history is handled by LangGraph checkpointer
    const messages: LLMChatPrompt['messages'] = [
      { role: 'system', content: systemPrompt }
    ];

    return { messages };
  }

  /**
   * Generate AI response for a user message with mission context
   */
  async generateResponse(message: string, missionId: string): Promise<string> {
    const context = {
      service: 'MissionOrchestratorAgent',
      operation: 'generateResponse',
      resource: 'mission',
      resourceId: missionId,
      metadata: { messageLength: message?.length }
    };

    this.logger.info('Generating orchestrator response', context);

    try {
      // Use LangGraph workflow with thread-based memory
      const graph = await this.createMissionChatGraph();
      const threadId = `mission-${missionId}`;
      
      const result = await graph.invoke(
        { missionId }, // Pass missionId in initial state
        { configurable: { thread_id: threadId } }
      );

      this.logger.info('Generated orchestrator response successfully', {
        ...context,
        metadata: { 
          ...context.metadata,
          threadId,
          responseLength: result.response?.length 
        }
      });

      return result.response || this.getFallbackResponse(missionId);

    } catch (error) {
      this.logger.error('Failed to generate orchestrator response', context, error as Error);
      
      // Return fallback response on error
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
    this.logger.info('Conversation history cleanup requested (using database storage)', {
      service: 'MissionOrchestratorAgent',
      operation: 'clearConversationHistory',
      resource: 'mission',
      resourceId: missionId
    });
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

      this.logger.info('Initialized LLM provider successfully', {
        service: 'MissionOrchestratorAgent',
        operation: 'initializeLLMProvider',
        metadata: { 
          provider: this.config.provider,
          model: this.config.model
        }
      });

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