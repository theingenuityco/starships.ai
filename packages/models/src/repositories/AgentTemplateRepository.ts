import { AgentTemplateModel } from '../types/agent-template';
import { AgentModel } from '../types/agent';
import { Neo4jConnection, getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../helpers/database';
import { AgentMemoryConfig } from '@starships/autopilot';

export class AgentTemplateRepository extends BaseRepository {
  private connection: Neo4jConnection;

  constructor(connection?: Neo4jConnection) {
    super('AgentTemplateRepository');
    this.connection = connection || getConnection();
  }

  /**
   * Helper to safely get value or default, handling empty objects from Neo4j
   */
  private getSafeValue<T>(value: T | {} | null | undefined, defaultValue: T): T {
    if (value === null || value === undefined || (typeof value === 'object' && Object.keys(value as any).length === 0)) {
      return defaultValue;
    }
    return value as T;
  }

  async findAll(): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const query = `
        MATCH (t:AgentTemplateModel)
        RETURN t
        ORDER BY t.createdAt DESC
      `;

      const results = await this.connection.executeQuery<{ t: AgentTemplateModel }>(query);
      return convertNeo4jIntsInArray(results.map((result) => result.t));
    }, 'findAll', 'AgentTemplateModel');
  }

  async findById(id: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'findById');
      
      const query = `
        MATCH (t:AgentTemplateModel {id: $id})
        RETURN t
      `;

      const results = await this.connection.executeQuery<{ t: AgentTemplateModel }>(query, { id });
      const template = results.length > 0 ? results[0].t : null;
      return template ? convertNeo4jIntsInObject(template) : null;
    }, 'findById', 'AgentTemplateModel', id);
  }

  async create(entity: Omit<AgentTemplateModel, 'id' | 'createdAt'>): Promise<AgentTemplateModel> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(entity, ['name', 'description', 'authorId'], 'create');
      
      const id = uuidv4();
      const now = new Date().toISOString();

      const template: AgentTemplateModel = {
        ...entity,
        id,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
      };

      const query = `
        CREATE (t:AgentTemplateModel $template)
        RETURN t
      `;
      
      const results = await this.connection.executeWrite<{ t: AgentTemplateModel }>(query, { template });
      const created = convertNeo4jIntsInObject(results[0].t);

      // Create USER-[:CREATES]->AGENT_TEMPLATE relationship if author user exists
      try {
        if (template.authorId && template.authorId !== 'system') {
          await this.connection.executeWrite(
            `MATCH (u:User {id: $authorId}), (t:AgentTemplateModel {id: $templateId})
             MERGE (u)-[r:CREATES]->(t)
             ON CREATE SET r.createdAt = $now`,
            {
              authorId: template.authorId,
              templateId: created.id,
              now
            }
          );
        }
      } catch (error) {
        // Log but don't fail - relationship is optional if user doesn't exist
        console.warn('Failed to create USER-[:CREATES]->AGENT_TEMPLATE relationship:', error);
      }

      return created;
    }, 'create', 'AgentTemplateModel');
  }

  async update(id: string, updates: Partial<AgentTemplateModel>): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'update');
      
      const updateFields = Object.keys(updates)
        .filter((key) => key !== 'id' && key !== 'createdAt')
        .map((key) => `t.${key} = $updates.${key}`)
        .join(', ');

      if (!updateFields) {
        return this.findById(id);
      }

      const query = `
        MATCH (t:AgentTemplateModel {id: $id})
        SET ${updateFields}, t.updatedAt = $now
        RETURN t
      `;

      const results = await this.connection.executeWrite<{ t: AgentTemplateModel }>(query, {
        id,
        updates,
        now: new Date().toISOString(),
      });

      const template = results.length > 0 ? results[0].t : null;
      return template ? convertNeo4jIntsInObject(template) : null;
    }, 'update', 'AgentTemplateModel', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'delete');
      
      const query = `
        MATCH (t:AgentTemplateModel {id: $id})
        DETACH DELETE t
        RETURN count(t) as deletedCount
      `;

      const results = await this.connection.executeWrite<{ deletedCount: number }>(query, { id });
      return results[0]?.deletedCount > 0;
    }, 'delete', 'AgentTemplateModel', id);
  }

  async findByAuthor(authorId: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ authorId }, ['authorId'], 'findByAuthor');
      
      const query = `
        MATCH (t:AgentTemplateModel {authorId: $authorId})
        RETURN t
        ORDER BY t.createdAt DESC
      `;

      const results = await this.connection.executeQuery<{ t: AgentTemplateModel }>(query, { authorId });
      return convertNeo4jIntsInArray(results.map((result) => result.t));
    }, 'findByAuthor', 'AgentTemplateModel');
  }

  async findByCategory(category: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ category }, ['category'], 'findByCategory');
      
      const query = `
        MATCH (t:AgentTemplateModel {category: $category})
        WHERE t.isPublic = true
        RETURN t
        ORDER BY t.usageCount DESC, t.rating DESC
      `;

      const results = await this.connection.executeQuery<{ t: AgentTemplateModel }>(query, { category });
      return convertNeo4jIntsInArray(results.map((result) => result.t));
    }, 'findByCategory', 'AgentTemplateModel');
  }

  async findByTags(tags: string[]): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ tags }, ['tags'], 'findByTags');
      
      if (!Array.isArray(tags) || tags.length === 0) {
        this.handleValidationError([{
          field: 'tags',
          message: 'Tags must be a non-empty array',
          value: tags
        }], 'findByTags');
      }
      
      const query = `
        MATCH (t:AgentTemplateModel)
        WHERE t.isPublic = true AND ANY(tag IN $tags WHERE tag IN t.tags)
        RETURN t, size([tag IN $tags WHERE tag IN t.tags]) as matchCount
        ORDER BY matchCount DESC, t.usageCount DESC, t.rating DESC
      `;

      const results = await this.connection.executeQuery<{ t: AgentTemplateModel }>(query, { tags });
      return convertNeo4jIntsInArray(results.map((result) => result.t));
    }, 'findByTags', 'AgentTemplateModel');
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      if (limit < 1 || limit > 100) {
        this.handleValidationError([{
          field: 'limit',
          message: 'Limit must be between 1 and 100',
          value: limit
        }], 'findPublic');
      }
      
      if (offset < 0) {
        this.handleValidationError([{
          field: 'offset',
          message: 'Offset must be non-negative',
          value: offset
        }], 'findPublic');
      }
      
      const query = `
        MATCH (t:AgentTemplateModel {isPublic: true})
        RETURN t
        ORDER BY t.usageCount DESC, t.rating DESC, t.createdAt DESC
        SKIP $offset
        LIMIT $limit
      `;

      const results = await this.connection.executeQuery<{ t: AgentTemplateModel }>(query, {
        limit: int(limit),
        offset: int(offset),
      });
      return convertNeo4jIntsInArray(results.map((result) => result.t));
    }, 'findPublic', 'AgentTemplateModel');
  }

  async searchTemplates(query: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ query }, ['query'], 'searchTemplates');
      this.validateStringLengths({ query }, { query: { min: 1, max: 200 } }, 'searchTemplates');
      
      const searchQuery = `
        MATCH (t:AgentTemplateModel)
        WHERE t.isPublic = true AND (
          toLower(t.name) CONTAINS toLower($query) OR
          toLower(t.description) CONTAINS toLower($query) OR
          ANY(tag IN t.tags WHERE toLower(tag) CONTAINS toLower($query))
        )
        RETURN t,
          CASE
            WHEN toLower(t.name) CONTAINS toLower($query) THEN 3
            WHEN toLower(t.description) CONTAINS toLower($query) THEN 2
            ELSE 1
          END as relevance
        ORDER BY relevance DESC, t.usageCount DESC, t.rating DESC
      `;

      const results = await this.connection.executeQuery<{ t: AgentTemplateModel }>(searchQuery, {
        query,
      });
      return convertNeo4jIntsInArray(results.map((result) => result.t));
    }, 'searchTemplates', 'AgentTemplateModel');
  }

  async incrementUsageCount(id: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'incrementUsageCount');
      
      const query = `
        MATCH (t:AgentTemplateModel {id: $id})
        SET t.usageCount = t.usageCount + 1, t.updatedAt = $now
      `;

      await this.connection.executeWrite(query, { id, now: new Date().toISOString() });
    }, 'incrementUsageCount', 'AgentTemplateModel', id);
  }

  async updateRating(id: string, rating: number): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id, rating }, ['id', 'rating'], 'updateRating');
      
      if (typeof rating !== 'number' || rating < 0 || rating > 5) {
        this.handleValidationError([{
          field: 'rating',
          message: 'Rating must be a number between 0 and 5',
          value: rating
        }], 'updateRating');
      }
      
      const query = `
        MATCH (t:AgentTemplateModel {id: $id})
        SET t.rating = $rating, t.updatedAt = $now
      `;

      await this.connection.executeWrite(query, { id, rating, now: new Date().toISOString() });
    }, 'updateRating', 'AgentTemplateModel', id);
  }

  async createAgentFromTemplate(
    templateId: string,
    agentName: string,
    authorId: string,
    starshipId: string
  ): Promise<AgentModel> {
    // First get the template
    const template = await this.findById(templateId);
    if (!template) {
      throw new Error(`Template with id ${templateId} not found`);
    }

    // Increment template usage count
    await this.incrementUsageCount(templateId);

    // Create agent from template
    const agentId = uuidv4();
    const now = new Date().toISOString();

    const agent: AgentModel = {
      id: agentId,
      name: agentName,
      model: template.model,
      systemPrompt: template.systemPrompt,
      description: template.description,
      tags: [...template.tags], // Copy tags from template
      category: template.category,
      version: '1.0.0',
      isPublic: false, // New agents from templates are private by default
      authorId,
      starshipId,
      rating: undefined,
      usageCount: 0,
      temperature: template.temperature,
      maxTokens: template.maxTokens,
      createdAt: now,
      updatedAt: now,
      // Required autopilot fields
      executionMode: 'simple', // Default to simple mode for template-created agents
      timeout: 30000, // Default timeout
      allowedStarshipClasses: undefined,
      requiredPermissions: undefined,
    };

    const query = `
      MATCH (s:Starship {id: $starshipId})
      CREATE (a:Agent $agent)
      CREATE (a)-[:DEPLOYED_ON]->(s)
      RETURN a
    `;
    
    const results = await this.connection.executeWrite<{ a: AgentModel }>(query, { agent, starshipId });
    const createdAgent = convertNeo4jIntsInObject(results[0].a);

    // Create USER-[:CREATES]->AGENT relationship if author user exists
    try {
      if (authorId && authorId !== 'system') {
        await this.connection.executeWrite(
          `MATCH (u:User {id: $authorId}), (a:Agent {id: $agentId})
           MERGE (u)-[r:CREATES]->(a)
           ON CREATE SET r.createdAt = $now`,
          {
            authorId,
            agentId: createdAgent.id,
            now
          }
        );
      }
    } catch (error) {
      console.warn('Failed to create USER-[:CREATES]->AGENT relationship:', error);
    }

    return createdAgent;
  }

  async createTemplateFromAgent(agentId: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ agentId }, ['agentId'], 'createTemplateFromAgent');

      // First get the agent
      const query = `
        MATCH (a:Agent {id: $agentId})
        WHERE a.isPublic = true
        RETURN a
      `;

      const agentResults = await this.connection.executeQuery<{ a: AgentModel }>(query, { agentId });

      if (agentResults.length === 0) {
        return null; // Agent not found or not public
      }

      const agent = agentResults[0].a;

      // Create template from agent
      const templateId = uuidv4();
      const now = new Date().toISOString();

      // Create default blueprint for simple chat
      const defaultBlueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start' as const,
            name: 'Start',
            description: 'Begin conversation',
            parameters: {}
          },
          {
            ref: 'chat-response',
            type: 'llm' as const,
            name: 'Generate Response',
            description: 'Process user input and respond',
            parameters: {
              model: agent.model,
              prompt: 'Respond helpfully to the user based on the conversation context and your system instructions.',
              temperature: agent.temperature || 0.7,
              maxTokens: agent.maxTokens || 2000
            }
          },
          {
            ref: 'end',
            type: 'end' as const,
            name: 'End',
            description: 'Complete conversation',
            parameters: {}
          }
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'chat-response' },
          { ref: 'edge-2', from: 'chat-response', to: 'end' }
        ],
        metadata: {
          version: '1.0',
          type: 'simple-chat',
          complexity: 'basic'
        }
      };

      // Create default memory config
      const defaultMemory: AgentMemoryConfig = {
        identity: {
          name: String(agent.name || 'AI Assistant'),
          role: 'AI Assistant',
          personality: 'Professional and helpful'
        },
        purpose: {
          primary: String(this.getSafeValue(agent.description, 'Assist users with their requests')),
          constraints: ['Be helpful and accurate', 'Follow ethical guidelines', 'Respect user privacy']
        },
        space: {
          description: 'Professional assistance environment focused on providing accurate and helpful responses.'
        }
      };

      const template: AgentTemplateModel = {
        id: templateId,
        name: `${agent.name} Template`,
        description: this.getSafeValue(agent.description, '') as string,
        category: agent.category,
        tags: [...(agent.tags || [])],
        systemPrompt: this.getSafeValue(agent.systemPrompt, '') as string,
        model: agent.model as string,
        temperature: agent.temperature as number | undefined,
        maxTokens: agent.maxTokens as number | undefined,
        blueprint: defaultBlueprint,
        memory: defaultMemory,
        executionMode: 'simple',
        timeout: 30000,
        authorId: agent.authorId,
        isPublic: true,
        usageCount: 0,
        rating: agent.rating,
        icon: '🤖', // Default icon
        previewPrompts: [],
        createdAt: now,
        updatedAt: now,
      };

      const createQuery = `
        CREATE (t:AgentTemplateModel $template)
        RETURN t
      `;
      
      const results = await this.connection.executeWrite<{ t: AgentTemplateModel }>(createQuery, {
        template,
      });
      const created = convertNeo4jIntsInObject(results[0].t);

      // Create USER-[:CREATES]->AGENT_TEMPLATE relationship if author user exists
      try {
        if (template.authorId && template.authorId !== 'system') {
          await this.connection.executeWrite(
            `MATCH (u:User {id: $authorId}), (t:AgentTemplateModel {id: $templateId})
             MERGE (u)-[r:CREATES]->(t)
             ON CREATE SET r.createdAt = $now`,
            {
              authorId: template.authorId,
              templateId: created.id,
              now
            }
          );
        }
      } catch (error) {
        console.warn('Failed to create USER-[:CREATES]->AGENT_TEMPLATE relationship:', error);
      }

      return created;
    }, 'createTemplateFromAgent', 'AgentTemplateModel', agentId);
  }
}
