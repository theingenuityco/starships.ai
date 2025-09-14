/**
 * Agent Service
 *
 * Provides business logic APIs for agent management and execution.
 * Orchestrates between database persistence (AgentRepository) and
 * stateless execution engine (autopilot Agent).
 */

import { Agent, AgentParams } from '@starships/autopilot';
import { NotFoundError } from '@starships/errors';
import { AgentRepository } from '@starships/models';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import { MessageService } from './MessageService';
import type { StreamingService } from './StreamingService';

export interface ConversationRequest {
  agentId: string;
  userId: string;
  message: string;
  conversationId?: string;
}

export interface ConversationResponse {
  source: 'agent';
  content: string;
  agentId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ConversationStreamingRequest extends ConversationRequest {
  streamId: string;
  streamingService: StreamingService;
}

/**
 * Service class for managing agents and their execution
 */
export class AgentService {
  private agentRepository: AgentRepository;
  private messageService: MessageService;

  constructor() {
    this.agentRepository = new AgentRepository();
    this.messageService = new MessageService();
  }

  // ============================================================================
  // AGENT MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new agent and return as AgentModel
   */
  async createAgent(data: CreateAgentRequest & { starshipId: string }): Promise<AgentModel> {
    const agentData = {
      name: data.name,
      description: data.description,
      model: data.model,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      timeout: data.timeout || 30000,
      blueprint: data.blueprint,
      memoryState: data.memoryState,
    };

    return await this.agentRepository.create(agentData, data.starshipId);
  }

  /**
   * Update agent and return as AgentModel
   */
  async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    return await this.agentRepository.update(agentId, updates as Partial<AgentModel>);
  }

  /**
   * Get agent by ID as AgentModel
   */
  async getAgent(agentId: string): Promise<AgentModel | null> {
    return await this.agentRepository.findById(agentId);
  }

  /**
   * Get agents by starship as AgentModel array
   */
  async getAgentsByStarship(starshipId: string): Promise<AgentModel[]> {
    return await this.agentRepository.findByStarship(starshipId);
  }

  /**
   * Search agents and return as AgentModel array
   */
  async searchAgents(query: string): Promise<AgentModel[]> {
    return await this.agentRepository.searchAgents(query);
  }

  /**
   * Delete agent
   */
  async deleteAgent(agentId: string): Promise<boolean> {
    return await this.agentRepository.delete(agentId);
  }

  /**
   * Update agent starship assignment (for routes layer)
   */
  async updateAgentStarship(agentId: string, starshipId: string): Promise<AgentModel | null> {
    // Check if agent exists first
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    return await this.agentRepository.updateStarship(agentId, starshipId);
  }

  /**
   * Get all agents with optional pagination
   */
  async getAllAgents(limit?: number, offset?: number): Promise<AgentModel[]> {
    const allAgents = await this.agentRepository.findAll();

    // Apply pagination if specified
    if (limit !== undefined && offset !== undefined) {
      return allAgents.slice(offset, offset + limit);
    }

    return allAgents;
  }

  /**
   * Get agents with pagination metadata
   */
  async getAgentsWithPagination(
    page: number = 1,
    limit: number = 50
  ): Promise<{
    agents: AgentModel[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }> {
    const allAgents = await this.agentRepository.findAll();
    const total = allAgents.length;
    const offset = (page - 1) * limit;
    const paginatedAgents = allAgents.slice(offset, offset + limit);

    return {
      agents: paginatedAgents,
      pagination: {
        page,
        limit,
        total,
        has_next: offset + limit < total,
        has_prev: page > 1,
      },
    };
  }

  /**
   * Validate starship access for a user
   */
  async validateStarshipAccess(starshipId: string, userId: string): Promise<boolean> {
    const { StarshipRepository } = await import('@starships/models');
    const starshipRepository = new StarshipRepository();
    const starship = await starshipRepository.findById(starshipId);

    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    return starship.ownerId === userId;
  }

  /**
   * Get agents by starship with access control
   */
  async getAgentsByStarshipWithAccess(
    starshipId: string,
    userId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ agents: AgentModel[]; total: number; pagination: any }> {
    // Validate access first
    await this.validateStarshipAccess(starshipId, userId);

    // Get all agents for the starship
    const allAgents = await this.getAgentsByStarship(starshipId);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedAgents = allAgents.slice(startIndex, startIndex + limit);

    return {
      agents: paginatedAgents,
      total: allAgents.length,
      pagination: {
        page,
        limit,
        total: allAgents.length,
        has_next: startIndex + limit < allAgents.length,
        has_prev: page > 1,
      },
    };
  }

  // ============================================================================
  // MODEL ↔ INSTANCE CONVERSION METHODS
  // ============================================================================

  /**
   * Convert AgentModel to Agent instance, storing model ID in instance metadata
   */
  async toInstance(agentModel: AgentModel): Promise<Agent> {
    const agentParams = {
      name: agentModel.name,
      description: agentModel.description,
      model: agentModel.model,
      temperature: agentModel.temperature,
      maxTokens: agentModel.maxTokens,
      timeout: agentModel.timeout,
      memoryState: agentModel.memoryState,
      blueprint: agentModel.blueprint,
      metadata: {
        id: agentModel.id,
      },
    } as AgentParams;
    const agentInstance = new Agent(agentParams);

    return agentInstance;
  }
}
