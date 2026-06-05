/**
 * Agent Service
 *
 * Registry of external agents that are members of a starship. No execution
 * config or runtime: agents bring their own runtime and connect via MCP.
 */

import { NotFoundError, ValidationError } from '@starships/errors';
import {
  AgentRepository,
  StarshipMemberRepository,
  StarshipRepository,
  UserRepository,
  PostgresConnection,
} from '@starships/models';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest, UserModel } from '@starships/protocol';
import { isInstanceAdmin } from '../utils/auth-helpers';

/**
 * Service class for managing the external-agent registry.
 */
export class AgentService {
  private agentRepository: AgentRepository;
  private starshipRepository: StarshipRepository;
  private starshipMemberRepository?: StarshipMemberRepository;

  constructor(connection?: PostgresConnection) {
    this.agentRepository = new AgentRepository(connection);
    this.starshipRepository = new StarshipRepository(connection);
  }

  /**
   * Validate that the starship can accommodate a new agent.
   */
  private async validateAgentLimit(starshipId: string): Promise<void> {
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }
    const current = await this.agentRepository.findByStarship(starshipId);
    if (current.length >= starship.maxAgents) {
      throw new ValidationError(
        `Agent limit reached. Maximum ${starship.maxAgents} agents allowed per starship. Currently registered: ${current.length}`
      );
    }
  }

  // ============================================================================
  // AGENT REGISTRY APIs
  // ============================================================================

  async createAgent(data: CreateAgentRequest & { starshipId: string; createdByUserId?: string }): Promise<AgentModel> {
    await this.validateAgentLimit(data.starshipId);
    const { starshipId, createdByUserId, ...rest } = data;
    return await this.agentRepository.create(rest, starshipId, createdByUserId);
  }

  async updateAgent(agentId: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    const current = await this.agentRepository.findById(agentId);
    if (!current) return null;
    return await this.agentRepository.update(agentId, updates);
  }

  async getAgent(agentId: string): Promise<AgentModel | null> {
    return await this.agentRepository.findById(agentId);
  }

  async getAgentBySlug(slug: string): Promise<AgentModel | null> {
    return await this.agentRepository.findBySlug(slug);
  }

  async getAgentsByStarship(starshipId: string): Promise<AgentModel[]> {
    return await this.agentRepository.findByStarship(starshipId);
  }

  async searchAgents(query: string): Promise<AgentModel[]> {
    return await this.agentRepository.searchAgents(query);
  }

  async deleteAgent(agentId: string): Promise<boolean> {
    return await this.agentRepository.delete(agentId);
  }

  async getAllAgents(limit?: number, offset?: number): Promise<AgentModel[]> {
    const allAgents = await this.agentRepository.findAll();
    if (limit !== undefined && offset !== undefined) {
      return allAgents.slice(offset, offset + limit);
    }
    return allAgents;
  }

  async validateStarshipAccess(starshipId: string, userId: string): Promise<boolean> {
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) {
      throw new NotFoundError('Starship', starshipId);
    }

    const userRepo = new UserRepository();
    const user = (await userRepo.findById(userId)) as UserModel | null;
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    if (isInstanceAdmin(user)) return true;
    if (starship.ownerId === userId) return true;

    const memberRepo = this.starshipMemberRepository ?? new StarshipMemberRepository();
    this.starshipMemberRepository = memberRepo;
    return await memberRepo.isMember(userId, starshipId);
  }

  async getAgentsByStarshipWithAccess(
    starshipId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
    order: 'ASC' | 'DESC' = 'DESC',
    search?: string
  ): Promise<{
    agents: AgentModel[];
    total: number;
    pagination: { page: number; limit: number; total: number; has_next: boolean; has_prev: boolean };
  }> {
    await this.validateStarshipAccess(starshipId, userId);

    const allAgents = await this.getAgentsByStarship(starshipId);

    const searchTerm = typeof search === 'string' && search.trim().length > 0 ? search.trim().toLowerCase() : null;
    const filteredAgents = searchTerm
      ? allAgents.filter((a) => {
          const name = typeof a?.name === 'string' ? a.name : '';
          const kind = typeof a?.kind === 'string' ? a.kind : '';
          const desc = typeof a?.description === 'string' ? a.description : '';
          const slug = typeof a?.slug === 'string' ? a.slug : '';
          const hay = `${name} ${kind} ${desc} ${slug}`.toLowerCase();
          return hay.includes(searchTerm);
        })
      : allAgents;

    const sortedAgents = [...filteredAgents].sort((a, b) => {
      const aTs = a?.createdAt ? new Date(a.createdAt as string).getTime() : 0;
      const bTs = b?.createdAt ? new Date(b.createdAt as string).getTime() : 0;
      if (aTs !== bTs) {
        return order === 'ASC' ? aTs - bTs : bTs - aTs;
      }
      const aName = (a?.name || '') as string;
      const bName = (b?.name || '') as string;
      return aName.localeCompare(bName);
    });

    const startIndex = (page - 1) * limit;
    const paginatedAgents = sortedAgents.slice(startIndex, startIndex + limit);

    return {
      agents: paginatedAgents,
      total: sortedAgents.length,
      pagination: {
        page,
        limit,
        total: sortedAgents.length,
        has_next: startIndex + limit < sortedAgents.length,
        has_prev: page > 1,
      },
    };
  }
}
