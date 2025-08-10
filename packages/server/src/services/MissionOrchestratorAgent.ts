/**
 * Mission Orchestrator Agent - Basic AI Response Generation
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using basic LangChain integration with mission context awareness.
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
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
 * Mission context for AI response generation
 */
interface MissionContext {
  mission: Mission;
  starship: Starship;
  vision: Vision;
  chatHistory: MissionMessage[];
}

/**
 * LangGraph state annotation for mission chat
 */
const MissionChatStateAnnotation = Annotation.Root({
  message: Annotation<string>(),
  missionId: Annotation<string>(),
  missionContext: Annotation<MissionContext | null>(),
  response: Annotation<string>()
});

/**
 * MissionOrchestratorAgent - Generates intelligent AI responses for mission coordination
 */
export class MissionOrchestratorAgent {
  private logger: Logger;
  private llmProvider: LLMProvider | null = null;
  
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
   * Create LangGraph workflow for mission chat conversations
   */
  private async createMissionChatGraph() {
    return new StateGraph(MissionChatStateAnnotation)
      .addNode("build_context", async (state) => {
        this.logger.info('Building mission context', {
          service: 'MissionOrchestratorAgent',
          operation: 'build_context',
          resource: 'mission',
          resourceId: state.missionId
        });
        
        const missionContext = await this.buildMissionContext(state.missionId);
        return { ...state, missionContext };
      })
      .addNode("generate_response", async (state) => {
        this.logger.info('Generating AI response', {
          service: 'MissionOrchestratorAgent', 
          operation: 'generate_response',
          resource: 'mission',
          resourceId: state.missionId
        });

        const prompt = this.buildPrompt(state.message, state.missionContext!);
        const response = await this.callLLM(prompt);
        return { ...state, response };
      })
      .addEdge(START, "build_context")
      .addEdge("build_context", "generate_response")
      .addEdge("generate_response", END)
      .compile();
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
      // Use LangGraph workflow instead of direct calls
      const graph = await this.createMissionChatGraph();
      const result = await graph.invoke({ 
        message, 
        missionId, 
        missionContext: null,
        response: ''
      });

      this.logger.info('Generated orchestrator response successfully', {
        ...context,
        metadata: { 
          ...context.metadata,
          responseLength: result.response?.length 
        }
      });

      return result.response;

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
   * Build enhanced mission context with starship, vision, and chat history
   */
  private async buildMissionContext(missionId: string): Promise<MissionContext> {
    const context = {
      service: 'MissionOrchestratorAgent',
      operation: 'buildMissionContext',
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
      const [starship, vision, chatHistory] = await Promise.all([
        starshipRepo.findById(mission.starshipId),
        visionRepo.findByStarship(mission.starshipId),
        missionRepo.getMessagesByMission(missionId, 10)
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

      const missionContext: MissionContext = {
        mission,
        starship,
        vision,
        chatHistory
      };

      // Step 6: Success logging with enhanced metadata
      this.logger.info('Built enhanced mission context successfully', {
        ...context,
        metadata: { 
          starshipName: starship.name,
          starshipClass: starship.class,
          visionLength: vision.statement?.length || 0,
          agentCount: mission.agentIds?.length || 0,
          chatHistoryLength: chatHistory.length,
          missionStatus: mission.status
        }
      });

      return missionContext;

    } catch (error) {
      this.logger.error('Failed to build enhanced mission context', context, error as Error);
      throw error;
    }
  }

  /**
   * Build LLM prompt with mission context for conversations
   */
  private buildPrompt(userMessage: string, missionContext: MissionContext): LLMChatPrompt {
    const { mission, starship, vision, chatHistory } = missionContext;

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

    // Build conversation messages
    const messages: LLMChatPrompt['messages'] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add chat history for context
    chatHistory.forEach(message => {
      if (message.role === 'user') {
        messages.push({ role: 'user', content: message.content });
      } else if (message.role === 'orchestrator') {
        messages.push({ role: 'assistant', content: message.content });
      }
      // Skip system messages in conversation context
    });

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return { messages };
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