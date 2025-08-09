/**
 * Mission Orchestrator Agent - Basic AI Response Generation
 * 
 * Provides intelligent responses for mission guidance and coordination
 * using basic LangChain integration with mission context awareness.
 */

import { LangChainProvider } from '@starships/agent-engine/src/llm/langchain-provider';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import type { 
  Mission, 
  LLMChatPrompt,
  LLMProvider 
} from '@starships/protocol';
import type { LLM } from '@starships/models';

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
 * Conversation history entry for in-memory storage
 */
interface ConversationHistoryEntry {
  role: 'user' | 'orchestrator' | 'system';
  content: string;
  timestamp: string;
}

/**
 * Mission context for AI response generation
 */
interface MissionContext {
  mission: Mission;
  agentCount: number;
  starshipName?: string;
  recentHistory: ConversationHistoryEntry[];
}

/**
 * MissionOrchestratorAgent - Generates intelligent AI responses for mission coordination
 */
export class MissionOrchestratorAgent {
  private logger: Logger;
  private llmProvider: LLMProvider | null = null;
  private conversationHistory: Map<string, ConversationHistoryEntry[]> = new Map();
  private readonly maxHistoryLength: number = 20; // Keep last 20 messages
  
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
      // Build mission context
      const missionContext = await this.buildMissionContext(missionId);
      
      // Add user message to conversation history
      this.addToConversationHistory(missionId, {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      // Generate AI response
      const prompt = this.buildPrompt(message, missionContext);
      const response = await this.callLLM(prompt);
      
      // Add orchestrator response to conversation history
      this.addToConversationHistory(missionId, {
        role: 'orchestrator',
        content: response,
        timestamp: new Date().toISOString()
      });

      this.logger.info('Generated orchestrator response successfully', {
        ...context,
        metadata: { 
          ...context.metadata,
          responseLength: response?.length 
        }
      });

      return response;

    } catch (error) {
      this.logger.error('Failed to generate orchestrator response', context, error as Error);
      
      // Return fallback response on error
      return this.getFallbackResponse(missionId);
    }
  }

  /**
   * Get conversation history for a mission
   */
  getConversationHistory(missionId: string): ConversationHistoryEntry[] {
    return this.conversationHistory.get(missionId) || [];
  }

  /**
   * Clear conversation history for a mission (cleanup)
   */
  clearConversationHistory(missionId: string): void {
    this.conversationHistory.delete(missionId);
    this.logger.info('Cleared conversation history', {
      service: 'MissionOrchestratorAgent',
      operation: 'clearConversationHistory',
      resource: 'mission',
      resourceId: missionId
    });
  }

  /**
   * Build mission context with details and agent information
   */
  private async buildMissionContext(missionId: string): Promise<MissionContext> {
    const context = {
      service: 'MissionOrchestratorAgent',
      operation: 'buildMissionContext',
      resource: 'mission',
      resourceId: missionId
    };

    try {
      const missionRepo = RepositoryFactory.getMissionRepository();
      const mission = await missionRepo.getMissionById(missionId);
      
      // Get conversation history
      const recentHistory = this.getConversationHistory(missionId)
        .slice(-10); // Last 10 messages for context

      // TODO: Fetch starship name when starship integration is available
      // const starshipRepo = RepositoryFactory.getStarshipRepository();
      // const starship = await starshipRepo.getStarshipById(mission.starshipId);

      const missionContext: MissionContext = {
        mission,
        agentCount: mission.agentIds?.length || 0,
        starshipName: 'Unknown Starship', // Placeholder until starship integration
        recentHistory
      };

      this.logger.info('Built mission context successfully', {
        ...context,
        metadata: { 
          agentCount: missionContext.agentCount,
          historyLength: recentHistory.length,
          missionStatus: mission.status
        }
      });

      return missionContext;

    } catch (error) {
      this.logger.error('Failed to build mission context', context, error as Error);
      throw error;
    }
  }

  /**
   * Build LLM prompt with mission context and conversation history
   */
  private buildPrompt(userMessage: string, missionContext: MissionContext): LLMChatPrompt {
    const { mission, agentCount, starshipName, recentHistory } = missionContext;

    // System prompt with mission context
    const systemPrompt = `You are a Mission Orchestrator AI assistant providing intelligent guidance and coordination for starship missions.

MISSION CONTEXT:
- Mission: "${mission.name}"
- Description: ${mission.description}
- Status: ${mission.status}
- Starship: ${starshipName}
- Assigned Agents: ${agentCount}
- Created: ${new Date(mission.createdAt).toLocaleDateString()}

ROLE & RESPONSIBILITIES:
- Provide helpful guidance and coordination for mission execution
- Answer questions about mission objectives and progress
- Suggest next steps and best practices
- Maintain awareness of mission context and agent capabilities
- Be concise, actionable, and mission-focused

COMMUNICATION STYLE:
- Professional but approachable
- Clear and direct
- Action-oriented suggestions
- Mission-context aware responses`;

    // Build conversation messages
    const messages: LLMChatPrompt['messages'] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add recent conversation history for context
    recentHistory.forEach(entry => {
      if (entry.role === 'user') {
        messages.push({ role: 'user', content: entry.content });
      } else if (entry.role === 'orchestrator') {
        messages.push({ role: 'assistant', content: entry.content });
      }
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
   * Add message to conversation history with length management
   */
  private addToConversationHistory(missionId: string, entry: ConversationHistoryEntry): void {
    if (!this.conversationHistory.has(missionId)) {
      this.conversationHistory.set(missionId, []);
    }

    const history = this.conversationHistory.get(missionId)!;
    history.push(entry);

    // Trim history to max length (keep recent messages)
    if (history.length > this.maxHistoryLength) {
      history.splice(0, history.length - this.maxHistoryLength);
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