import { AgentEntity } from '@/entities/AgentEntity';
import { ConversationEntity } from '@/entities/ConversationEntity';
import { StarshipEntity } from '@/entities/StarshipEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel } from '@starships/protocol';
import { StarshipModel } from '@starships/protocol';

export class StarshipRepository extends BaseRepository {
  constructor() {
    super('StarshipRepository');
  }

  async findAll(): Promise<StarshipModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('starships', 'created_at DESC');
        return fromDatabaseArray(StarshipEntity, result);
      },
      'findAll',
      'Starship'
    );
  }

  async findById(id: string): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('starships', id);
        return result ? fromDatabase(StarshipEntity, result) : null;
      },
      'findById',
      'Starship',
      id
    );
  }

  async findBySlug(slug: string, ownerId: string): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM starships WHERE slug = $1 AND owner_id = $2', [
          slug,
          ownerId,
        ]);
        return result ? fromDatabase(StarshipEntity, result) : null;
      },
      'findBySlug',
      'Starship',
      slug
    );
  }

  async findByOwner(ownerId: string): Promise<StarshipModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM starships WHERE owner_id = $1 ORDER BY created_at DESC',
          [ownerId]
        );
        return fromDatabaseArray(StarshipEntity, result);
      },
      'findByOwner',
      'Starship'
    );
  }

  async create(
    entity: Omit<StarshipModel, 'id' | 'createdAt' | 'updatedAt' | 'slug'> & { maxAgents?: number }
  ): Promise<StarshipModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Always generate a unique slug from the name
        const slug = await this.generateUniqueSlug(entity.name, entity.ownerId);

        const starshipData = {
          ...entity,
          slug,
          maxAgents: entity.maxAgents ?? 8, // Default to 8 agents
          status: entity.status || 'active', // Default to active
          createdAt: now,
          updatedAt: now,
        };

        // Validate using Entity after all fields are populated
        await StarshipEntity.validate(starshipData, 'create');

        // Convert entity to database format and create
        const databaseFormat = toDatabase(toEntityInstance(StarshipEntity, starshipData));
        const result = await this.createEntity<Record<string, unknown>>('starships', databaseFormat);

        return fromDatabase(StarshipEntity, result);
      },
      'create',
      'Starship'
    );
  }

  async update(id: string, updates: Partial<StarshipModel>): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Use lean validation from StarshipEntity for updates
        await StarshipEntity.validate(updates, 'update');

        // Handle slug updates
        if (updates.name && !updates.slug) {
          const existingStarship = await this.findById(id);
          if (existingStarship) {
            updates.slug = await this.generateUniqueSlug(updates.name, existingStarship.ownerId);
          }
        }

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(StarshipEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('starships', id, filteredUpdateData);
        return result ? fromDatabase(StarshipEntity, result) : null;
      },
      'update',
      'Starship',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('starships', id);
      },
      'delete',
      'Starship',
      id
    );
  }

  async getDeployedAgents(starshipId: string): Promise<AgentModel[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT a.* FROM agents a 
         WHERE a.starship_id = $1 AND a.deployed_at IS NOT NULL 
         ORDER BY a.name`,
          [starshipId]
        );
        return fromDatabaseArray(AgentEntity, result);
      },
      'getDeployedAgents',
      'Agent'
    );
  }

  async deployAgent(starshipId: string, agentId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        // Check if starship has available slots
        const availableSlots = await this.getAvailableSlots(starshipId);
        if (availableSlots <= 0) {
          throw new Error('No available slots on this starship');
        }

        // Check if agent is already deployed
        const connection = this.getConnection();
        const existingDeployment = await connection.queryOne(
          `SELECT id FROM agents WHERE id = $1 AND starship_id = $2 AND deployed_at IS NOT NULL`,
          [agentId, starshipId]
        );

        if (existingDeployment) {
          throw new Error('Agent is already deployed on this starship');
        }

        // Deploy agent by updating the agents table
        await connection.query(
          `UPDATE agents SET 
         starship_id = $1, 
         deployed_at = $2, 
         updated_at = NOW() 
         WHERE id = $3`,
          [starshipId, new Date().toISOString(), agentId]
        );

        return true;
      },
      'deployAgent',
      'Agent',
      agentId
    );
  }

  async removeAgent(starshipId: string, agentId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `UPDATE agents SET 
         starship_id = NULL, 
         deployed_at = NULL, 
         updated_at = NOW() 
         WHERE id = $1 AND starship_id = $2`,
          [agentId, starshipId]
        );

        return (result as unknown as { rowCount: number }).rowCount > 0;
      },
      'removeAgent',
      'Agent',
      agentId
    );
  }

  async getAvailableSlots(starshipId: string): Promise<number> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<{
          max_agents: string;
          deployed_count: string;
        }>(
          `SELECT 
         s.max_agents,
         COUNT(a.id) as deployed_count
         FROM starships s
         LEFT JOIN agents a ON s.id = a.starship_id AND a.deployed_at IS NOT NULL
         WHERE s.id = $1
         GROUP BY s.id, s.max_agents`,
          [starshipId]
        );

        const { max_agents, deployed_count } = result || { max_agents: '0', deployed_count: '0' };
        return Number(max_agents) - Number(deployed_count);
      },
      'getAvailableSlots',
      'Starship',
      starshipId
    );
  }

  async updateStatus(starshipId: string, status: StarshipModel['status']): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `UPDATE starships SET 
         status = $1, 
         updated_at = NOW() 
         WHERE id = $2`,
          [status, starshipId]
        );

        return (result as unknown as { rowCount: number }).rowCount > 0;
      },
      'updateStatus',
      'Starship',
      starshipId
    );
  }

  async generateUniqueSlug(name: string, ownerId: string): Promise<string> {
    if (!name) {
      throw new Error('Name parameter is required');
    }
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

    console.log('[STARSHIP-SLUG] Starting slug generation for name:', name, 'ownerId:', ownerId);

    // Create base slug from name
    const baseSlug = this.createSlugFromName(name);
    console.log('[STARSHIP-SLUG] Base slug created:', baseSlug);

    // Always append a short unique suffix to enforce format "xxx-yyy"
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const randomSuffix = Math.random().toString(36).substring(2, 8); // 6 random chars
      const candidate = `${baseSlug}-${randomSuffix}`;
      if (await this.isSlugAvailable(candidate, ownerId)) {
        console.log('[STARSHIP-SLUG] Candidate slug available:', candidate);
        return candidate;
      }
    }

    // Fallback: timestamp-based suffix if random attempts collide
    const fallback = `${baseSlug}-${Date.now().toString(36)}`;
    console.log('[STARSHIP-SLUG] Using fallback slug:', fallback);
    return fallback;
  }

  async isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean> {
    if (!slug) {
      throw new Error('Slug parameter is required');
    }
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        let query = 'SELECT COUNT(*) as count FROM starships WHERE slug = $1 AND owner_id = $2';
        const params: unknown[] = [slug, ownerId];

        if (excludeId) {
          query += ' AND id != $3';
          params.push(excludeId);
        }

        const result = await connection.queryOne<{ count: string }>(query, params);
        return result?.count === '0';
      },
      'isSlugAvailable',
      'Starship'
    );
  }

  createSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  // Conversation methods (relationships converted to foreign keys)
  async getConversations(starshipId: string): Promise<Record<string, unknown>[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM conversations WHERE starship_id = $1 ORDER BY created_at DESC`,
          [starshipId]
        );

        return result.map((record) => toDatabase(fromDatabase(ConversationEntity, record)));
      },
      'getConversations',
      'Conversation'
    );
  }

  async getConversationCount(starshipId: string): Promise<number> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM conversations WHERE starship_id = $1`, [
          starshipId,
        ]);

        return parseInt(result?.count || '0', 10);
      },
      'getConversationCount',
      'Conversation'
    );
  }

  async getActiveConversations(starshipId: string): Promise<Record<string, unknown>[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM conversations WHERE starship_id = $1 AND status = 'active' ORDER BY created_at DESC`,
          [starshipId]
        );

        return result.map((record) => toDatabase(fromDatabase(ConversationEntity, record)));
      },
      'getActiveConversations',
      'Conversation'
    );
  }

  async removeConversation(starshipId: string, conversationId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `UPDATE conversations SET starship_id = NULL, updated_at = NOW() WHERE id = $1 AND starship_id = $2`,
          [conversationId, starshipId]
        );

        return (result as unknown as { rowCount: number }).rowCount > 0;
      },
      'removeConversation',
      'Conversation',
      conversationId
    );
  }
}
