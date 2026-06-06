/**
 * Agent Runtime Service
 *
 * Registry of external agent runtimes (engines) connected to a starship. A
 * runtime brings its own CLI and connects via MCP; identity and behaviour live
 * on personas (see AgentPersonaService).
 */

import { NotFoundError } from '@starships/errors';
import { AgentRuntimeRepository, StarshipMemberRepository, StarshipRepository, UserRepository, PostgresConnection } from '@starships/models';
import type { AgentRuntimeModel, CreateAgentRuntimeRequest, UpdateAgentRuntimeRequest, UserModel } from '@starships/protocol';
import { isInstanceAdmin } from '../utils/auth-helpers';

export class AgentRuntimeService {
  private runtimeRepository: AgentRuntimeRepository;
  private starshipRepository: StarshipRepository;
  private starshipMemberRepository?: StarshipMemberRepository;

  constructor(connection?: PostgresConnection) {
    this.runtimeRepository = new AgentRuntimeRepository(connection);
    this.starshipRepository = new StarshipRepository(connection);
  }

  async createRuntime(data: CreateAgentRuntimeRequest & { createdByUserId?: string }): Promise<AgentRuntimeModel> {
    const starship = await this.starshipRepository.findById(data.starshipId);
    if (!starship) throw new NotFoundError('Starship', data.starshipId);
    const { starshipId, createdByUserId, ...rest } = data;
    return await this.runtimeRepository.create(rest, starshipId, createdByUserId);
  }

  async updateRuntime(runtimeId: string, updates: UpdateAgentRuntimeRequest): Promise<AgentRuntimeModel | null> {
    const current = await this.runtimeRepository.findById(runtimeId);
    if (!current) return null;
    return await this.runtimeRepository.update(runtimeId, updates);
  }

  async getRuntime(runtimeId: string): Promise<AgentRuntimeModel | null> {
    return await this.runtimeRepository.findById(runtimeId);
  }

  async getRuntimesByStarship(starshipId: string): Promise<AgentRuntimeModel[]> {
    return await this.runtimeRepository.findByStarship(starshipId);
  }

  async deleteRuntime(runtimeId: string): Promise<boolean> {
    return await this.runtimeRepository.delete(runtimeId);
  }

  async validateStarshipAccess(starshipId: string, userId: string): Promise<boolean> {
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) throw new NotFoundError('Starship', starshipId);

    const userRepo = new UserRepository();
    const user = (await userRepo.findById(userId)) as UserModel | null;
    if (!user) throw new NotFoundError('User', userId);
    if (isInstanceAdmin(user)) return true;
    if (starship.ownerId === userId) return true;

    const memberRepo = this.starshipMemberRepository ?? new StarshipMemberRepository();
    this.starshipMemberRepository = memberRepo;
    return await memberRepo.isMember(userId, starshipId);
  }

  async getRuntimesByStarshipWithAccess(
    starshipId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
    order: 'ASC' | 'DESC' = 'DESC',
    search?: string
  ): Promise<{
    runtimes: AgentRuntimeModel[];
    total: number;
    pagination: { page: number; limit: number; total: number; has_next: boolean; has_prev: boolean };
  }> {
    await this.validateStarshipAccess(starshipId, userId);

    const all = await this.getRuntimesByStarship(starshipId);

    const searchTerm = typeof search === 'string' && search.trim().length > 0 ? search.trim().toLowerCase() : null;
    const filtered = searchTerm
      ? all.filter((r) => {
          const hay = `${r.name ?? ''} ${r.kind ?? ''} ${r.slug ?? ''}`.toLowerCase();
          return hay.includes(searchTerm);
        })
      : all;

    const sorted = [...filtered].sort((a, b) => {
      const aTs = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTs = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aTs !== bTs) return order === 'ASC' ? aTs - bTs : bTs - aTs;
      return (a?.name || '').localeCompare(b?.name || '');
    });

    const startIndex = (page - 1) * limit;
    const paginated = sorted.slice(startIndex, startIndex + limit);

    return {
      runtimes: paginated,
      total: sorted.length,
      pagination: {
        page,
        limit,
        total: sorted.length,
        has_next: startIndex + limit < sorted.length,
        has_prev: page > 1,
      },
    };
  }
}
