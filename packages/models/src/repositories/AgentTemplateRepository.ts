import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { Neo4jConnection } from '@/helpers/database';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentTemplateModel, CreateAgentTemplateRequest, UpdateAgentTemplateRequest } from '@starships/protocol';

export class AgentTemplateRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('AgentTemplateRepository', connection);
  }

  async findAll(): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const query = `MATCH (t:AgentTemplate) RETURN t ORDER BY t.createdAt DESC`;
        const result = await connection.executeQuery<{ t: AgentTemplateModel }>(query);
        return result.map((record) => AgentTemplateEntity.deserialize(record.t as unknown as Record<string, unknown>));
      },
      'findAll',
      'AgentTemplate'
    );
  }

  async findById(id: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for findById operation');
        }

        const query = `
        MATCH (t:AgentTemplate {id: $id})
        RETURN t
      `;
        const connection = this.getConnection();
        const results = await connection.executeQuery<{ t: AgentTemplateModel }>(query, { id });
        const template = results.length > 0 ? results[0].t : null;
        return template ? AgentTemplateEntity.deserialize(template as unknown as Record<string, unknown>) : null;
      },
      'findById',
      'AgentTemplate',
      id
    );
  }

  async findBySlug(slug: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!slug?.trim()) {
          throw new Error('Slug is required for findBySlug operation');
        }

        const query = `
        MATCH (t:AgentTemplate {slug: $slug})
        RETURN t
      `;

        const results = await this.getConnection().executeQuery<{ t: AgentTemplateModel }>(query, { slug });
        const template = results.length > 0 ? results[0].t : null;
        return template ? AgentTemplateEntity.deserialize(template as unknown as Record<string, unknown>) : null;
      },
      'findBySlug',
      'AgentTemplate',
      slug
    );
  }

  async create(data: CreateAgentTemplateRequest): Promise<AgentTemplateModel> {
    return this.executeWithErrorHandling(
      async () => {
        // validate using data
        AgentTemplateEntity.validate(data);

        const now = new Date().toISOString();

        // Generate slug if not provided
        const slug = generateSlug(data.name);

        // Build template data, ensuring no complex objects for Neo4j storage
        const templateProps = {
          // Explicit primitive fields
          name: data.name,
          slug: slug,
          description: data.description,
          category: data.category,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          timeout: data.timeout,
          icon: data.icon,
          previewPrompts: data.previewPrompts,
          memory: data.memory,
          blueprint: data.blueprint,
          usageCount: 0,

          // Database fields
          createdAt: now,
          updatedAt: now,
        };

        // Transform using Entity
        const templateEntity = AgentTemplateEntity.deserialize(templateProps);

        // Use base repository for database operation
        const template = await this.createEntityWithAutoId<AgentTemplateModel>('AgentTemplate', templateEntity.serialize());

        // Parse the JSON strings back to objects manually for the response
        return AgentTemplateEntity.deserialize(template as unknown as Record<string, unknown>);
      },
      'create',
      'AgentTemplate'
    );
  }

  async update(id: string, updates: UpdateAgentTemplateRequest): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Transform using Entity
        const updateEntity = AgentTemplateEntity.deserialize(updateProps);

        const result = await connection.executeWrite<{ t: AgentTemplateModel }>(
          'MATCH (t:AgentTemplate) WHERE t.id = $id SET t += $updates RETURN t',
          {
            id,
            updates: updateEntity.serialize(),
          }
        );

        const template = result[0]?.t || null;
        return template ? AgentTemplateEntity.deserialize(template as unknown as Record<string, unknown>) : null;
      },
      'update',
      'AgentTemplate',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for delete operation');
        }

        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (t:AgentTemplate) WHERE t.id = $id DETACH DELETE t RETURN count(t) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'AgentTemplate',
      id
    );
  }

  async findByCategory(category: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!category?.trim()) {
          throw new Error('Category is required for findByCategory operation');
        }

        const query = `
        MATCH (t:AgentTemplate {category: $category})
        WHERE t.isPublic = true
        RETURN t
        ORDER BY t.usageCount DESC
      `;

        const result = await this.getConnection().executeQuery<{ t: AgentTemplateModel }>(query, { category });
        return result.map((record) => AgentTemplateEntity.deserialize(record.t as unknown as Record<string, unknown>));
      },
      'findByCategory',
      'AgentTemplate'
    );
  }

  async searchTemplates(query: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!query?.trim()) {
          throw new Error('Search query is required');
        }

        if (query.length > 200) {
          throw new Error('Search query cannot exceed 200 characters');
        }

        const searchQuery = `
        MATCH (t:AgentTemplate)
        WHERE (
          toLower(t.name) CONTAINS toLower($query) OR
          toLower(t.description) CONTAINS toLower($query)
        )
        RETURN t,
          CASE
            WHEN toLower(t.name) CONTAINS toLower($query) THEN 3
            WHEN toLower(t.description) CONTAINS toLower($query) THEN 2
            ELSE 1
          END as relevance
        ORDER BY relevance DESC, t.usageCount DESC, t.rating DESC
      `;

        const result = await this.getConnection().executeQuery<{ t: AgentTemplateModel }>(searchQuery, {
          query,
        });
        return result.map((record) => AgentTemplateEntity.deserialize(record.t as unknown as Record<string, unknown>));
      },
      'searchTemplates',
      'AgentTemplate'
    );
  }

  async incrementUsageCount(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for incrementUsageCount operation');
        }

        const query = `
        MATCH (t:AgentTemplate {id: $id})
        SET t.usageCount = t.usageCount + 1, t.updatedAt = $now
      `;

        await this.getConnection().executeWrite(query, { id, now: new Date().toISOString() });
      },
      'incrementUsageCount',
      'AgentTemplate',
      id
    );
  }
}
