/**
 * Agent Persona Service
 *
 * Personas are the user-authored actors (identity + access + behaviour) that run
 * on agent runtimes. A persona's runtime assignment is reassignable. The starship
 * `maxAgents` entitlement caps the number of personas (the user-facing actors).
 */

import { NotFoundError, ValidationError } from '@starships/errors';
import {
  AgentPersonaRepository,
  AgentRuntimeRepository,
  StarshipMemberRepository,
  StarshipRepository,
  UserRepository,
  PostgresConnection,
} from '@starships/models';
import type { AgentPersonaModel, CreateAgentPersonaRequest, UpdateAgentPersonaRequest, UserModel } from '@starships/protocol';
import { isInstanceAdmin } from '../utils/auth-helpers';

export class AgentPersonaService {
  private personaRepository: AgentPersonaRepository;
  private runtimeRepository: AgentRuntimeRepository;
  private starshipRepository: StarshipRepository;
  private starshipMemberRepository?: StarshipMemberRepository;

  constructor(connection?: PostgresConnection) {
    this.personaRepository = new AgentPersonaRepository(connection);
    this.runtimeRepository = new AgentRuntimeRepository(connection);
    this.starshipRepository = new StarshipRepository(connection);
  }

  private async validatePersonaLimit(starshipId: string): Promise<void> {
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) throw new NotFoundError('Starship', starshipId);
    const current = await this.personaRepository.findByStarship(starshipId);
    if (current.length >= starship.maxAgents) {
      throw new ValidationError(
        `Persona limit reached. Maximum ${starship.maxAgents} personas allowed per starship. Currently: ${current.length}`
      );
    }
  }

  /** A runtime assignment must point at a runtime in the same starship. */
  private async validateRuntimeAssignment(starshipId: string, runtimeId?: string | null): Promise<void> {
    if (!runtimeId) return;
    const runtime = await this.runtimeRepository.findById(runtimeId);
    if (!runtime || runtime.starshipId !== starshipId) {
      throw new ValidationError('Runtime not found in this starship', 'runtimeId', { runtimeId });
    }
  }

  async createPersona(data: CreateAgentPersonaRequest & { createdByUserId?: string }): Promise<AgentPersonaModel> {
    await this.validatePersonaLimit(data.starshipId);
    await this.validateRuntimeAssignment(data.starshipId, data.runtimeId ?? null);
    const { starshipId, createdByUserId, ...rest } = data;
    return await this.personaRepository.create(rest, starshipId, createdByUserId);
  }

  async updatePersona(personaId: string, updates: UpdateAgentPersonaRequest): Promise<AgentPersonaModel | null> {
    const current = await this.personaRepository.findById(personaId);
    if (!current) return null;
    if (updates.runtimeId !== undefined) {
      await this.validateRuntimeAssignment(current.starshipId, updates.runtimeId);
    }
    return await this.personaRepository.update(personaId, updates);
  }

  async assignRuntime(personaId: string, runtimeId: string | null): Promise<AgentPersonaModel | null> {
    const current = await this.personaRepository.findById(personaId);
    if (!current) return null;
    await this.validateRuntimeAssignment(current.starshipId, runtimeId);
    return await this.personaRepository.assignRuntime(personaId, runtimeId);
  }

  async getPersona(personaId: string): Promise<AgentPersonaModel | null> {
    return await this.personaRepository.findById(personaId);
  }

  async getPersonasByStarship(starshipId: string): Promise<AgentPersonaModel[]> {
    return await this.personaRepository.findByStarship(starshipId);
  }

  async searchPersonas(starshipId: string, query: string): Promise<AgentPersonaModel[]> {
    return await this.personaRepository.search(starshipId, query);
  }

  async deletePersona(personaId: string): Promise<boolean> {
    return await this.personaRepository.delete(personaId);
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

  async getPersonasByStarshipWithAccess(
    starshipId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
    order: 'ASC' | 'DESC' = 'DESC',
    search?: string
  ): Promise<{
    personas: AgentPersonaModel[];
    total: number;
    pagination: { page: number; limit: number; total: number; has_next: boolean; has_prev: boolean };
  }> {
    await this.validateStarshipAccess(starshipId, userId);

    const all = await this.getPersonasByStarship(starshipId);

    const searchTerm = typeof search === 'string' && search.trim().length > 0 ? search.trim().toLowerCase() : null;
    const filtered = searchTerm
      ? all.filter((p) => {
          const hay = `${p.name ?? ''} ${p.description ?? ''} ${p.slug ?? ''}`.toLowerCase();
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
      personas: paginated,
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
