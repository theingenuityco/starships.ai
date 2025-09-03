import type { AgentTemplateModel, AgentModel } from '@starships/protocol';
import { Neo4jConnection, getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../helpers/database';
import { AgentMemoryState } from '@starships/autopilot';

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

  /**
   * Helper to deserialize template from Neo4j format back to AgentTemplateModel
   */
  private deserializeTemplate(rawTemplate: any): AgentTemplateModel {
    return {
      ...rawTemplate,
      memory: rawTemplate.memory ? JSON.parse(rawTemplate.memory) : undefined,
      blueprint: rawTemplate.blueprint ? JSON.parse(rawTemplate.blueprint) : undefined,
    };
  }

  /**
   * Helper to serialize template for Neo4j storage
   */
  private serializeTemplate(template: any): any {
    // Exclude complex objects first, then add serialized versions
    const { memory, blueprint, ...primitiveFields } = template;
    return {
      ...primitiveFields,
      memory: memory ? JSON.stringify(memory) : null,
      blueprint: blueprint ? JSON.stringify(blueprint) : null,
    };
  }

  async findAll(): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const query = `
        MATCH (t:AgentTemplate)
        RETURN t
        ORDER BY t.createdAt DESC
      `;

      const results = await this.connection.executeQuery<{ t: any }>(query);
      return convertNeo4jIntsInArray(results.map((result) => this.deserializeTemplate(result.t)));
    }, 'findAll', 'AgentTemplate');
  }

  async findById(id: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'findById');
      
      const query = `
        MATCH (t:AgentTemplate {id: $id})
        RETURN t
      `;

      const results = await this.connection.executeQuery<{ t: any }>(query, { id });
      const template = results.length > 0 ? results[0].t : null;
      return template ? this.deserializeTemplate(convertNeo4jIntsInObject(template)) : null;
    }, 'findById', 'AgentTemplate', id);
  }

  async create(entity: Omit<AgentTemplateModel, 'id' | 'createdAt'>): Promise<AgentTemplateModel> {
    console.log('=== REPOSITORY CREATE METHOD CALLED ===');
    console.log('Entity name:', entity.name);
    console.log('Entity keys:', Object.keys(entity));
    
    return this.executeWithErrorHandling(async () => {
      console.log('[Repository] Inside executeWithErrorHandling - Creating template:', entity.name);
      console.log('[Repository] Entity memory type:', typeof entity.memory);
      console.log('[Repository] Entity blueprint type:', typeof entity.blueprint);
      
      this.validateRequired(entity, ['name', 'description'], 'create');
      
      const now = new Date().toISOString();

      // Build template data, ensuring no complex objects for Neo4j storage
      const templateData = {
        // Explicit primitive fields
        name: entity.name,
        description: entity.description,
        category: entity.category,
        model: entity.model,
        temperature: entity.temperature,
        maxTokens: entity.maxTokens,
        timeout: this.getSafeValue(entity.timeout, 30000) as number,
        authorId: entity.authorId,
        isPublic: entity.isPublic,
        rating: entity.rating,
        icon: entity.icon,
        previewPrompts: entity.previewPrompts,
        tags: entity.tags,
        
        // Database fields
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        
        // Serialize complex objects to JSON strings for Neo4j storage
        memory: entity.memory ? JSON.stringify(entity.memory) : null,
        blueprint: entity.blueprint ? JSON.stringify(entity.blueprint) : null,
      };

      console.log('[Repository] Template data before Neo4j create (types):', {
        memory: typeof templateData.memory,
        blueprint: typeof templateData.blueprint,
        memoryIsString: typeof templateData.memory === 'string',
        blueprintIsString: typeof templateData.blueprint === 'string'
      });

      const created = await this.createEntityWithAutoId<any>('AgentTemplate', templateData);
      
      console.log('[Repository] Created successfully, deserializing...');
      
      // Deserialize JSON strings back to objects
      return this.deserializeTemplate(convertNeo4jIntsInObject(created));
    }, 'create', 'AgentTemplate');
  }

  async update(id: string, updates: Partial<AgentTemplateModel>): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'update');
      
      // Serialize complex objects in updates
      const serializedUpdates = this.serializeTemplate(updates);
      
      const updateFields = Object.keys(serializedUpdates)
        .filter((key) => key !== 'id' && key !== 'createdAt' && serializedUpdates[key] !== undefined && serializedUpdates[key] !== null)
        .map((key) => `t.${key} = $updates.${key}`)
        .join(', ');

      if (!updateFields) {
        return this.findById(id);
      }

      const query = `
        MATCH (t:AgentTemplate {id: $id})
        SET ${updateFields}, t.updatedAt = $now
        RETURN t
      `;

      const results = await this.connection.executeWrite<{ t: any }>(query, {
        id,
        updates: serializedUpdates,
        now: new Date().toISOString(),
      });

      const template = results.length > 0 ? results[0].t : null;
      return template ? this.deserializeTemplate(convertNeo4jIntsInObject(template)) : null;
    }, 'update', 'AgentTemplate', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'delete');
      
      const query = `
        MATCH (t:AgentTemplate {id: $id})
        DETACH DELETE t
        RETURN count(t) as deletedCount
      `;

      const results = await this.connection.executeWrite<{ deletedCount: number }>(query, { id });
      return results[0]?.deletedCount > 0;
    }, 'delete', 'AgentTemplate', id);
  }

  async findByAuthor(authorId: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ authorId }, ['authorId'], 'findByAuthor');
      
      const query = `
        MATCH (t:AgentTemplate {authorId: $authorId})
        RETURN t
        ORDER BY t.createdAt DESC
      `;

      const results = await this.connection.executeQuery<{ t: any }>(query, { authorId });
      return convertNeo4jIntsInArray(results.map((result) => this.deserializeTemplate(result.t)));
    }, 'findByAuthor', 'AgentTemplate');
  }

  async findByCategory(category: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ category }, ['category'], 'findByCategory');
      
      const query = `
        MATCH (t:AgentTemplate {category: $category})
        WHERE t.isPublic = true
        RETURN t
        ORDER BY t.usageCount DESC, t.rating DESC
      `;

      const results = await this.connection.executeQuery<{ t: any }>(query, { category });
      return convertNeo4jIntsInArray(results.map((result) => this.deserializeTemplate(result.t)));
    }, 'findByCategory', 'AgentTemplate');
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
        MATCH (t:AgentTemplate)
        WHERE t.isPublic = true AND ANY(tag IN $tags WHERE tag IN t.tags)
        RETURN t, size([tag IN $tags WHERE tag IN t.tags]) as matchCount
        ORDER BY matchCount DESC, t.usageCount DESC, t.rating DESC
      `;

      const results = await this.connection.executeQuery<{ t: any }>(query, { tags });
      return convertNeo4jIntsInArray(results.map((result) => this.deserializeTemplate(result.t)));
    }, 'findByTags', 'AgentTemplate');
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
        MATCH (t:AgentTemplate {isPublic: true})
        RETURN t
        ORDER BY t.usageCount DESC, t.rating DESC, t.createdAt DESC
        SKIP $offset
        LIMIT $limit
      `;

      const results = await this.connection.executeQuery<{ t: any }>(query, {
        limit: int(limit),
        offset: int(offset),
      });
      return convertNeo4jIntsInArray(results.map((result) => this.deserializeTemplate(result.t)));
    }, 'findPublic', 'AgentTemplate');
  }

  async searchTemplates(query: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ query }, ['query'], 'searchTemplates');
      this.validateStringLengths({ query }, { query: { min: 1, max: 200 } }, 'searchTemplates');
      
      const searchQuery = `
        MATCH (t:AgentTemplate)
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

      const results = await this.connection.executeQuery<{ t: any }>(searchQuery, {
        query,
      });
      return convertNeo4jIntsInArray(results.map((result) => this.deserializeTemplate(result.t)));
    }, 'searchTemplates', 'AgentTemplate');
  }

  async incrementUsageCount(id: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'incrementUsageCount');
      
      const query = `
        MATCH (t:AgentTemplate {id: $id})
        SET t.usageCount = t.usageCount + 1, t.updatedAt = $now
      `;

      await this.connection.executeWrite(query, { id, now: new Date().toISOString() });
    }, 'incrementUsageCount', 'AgentTemplate', id);
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
        MATCH (t:AgentTemplate {id: $id})
        SET t.rating = $rating, t.updatedAt = $now
      `;

      await this.connection.executeWrite(query, { id, rating, now: new Date().toISOString() });
    }, 'updateRating', 'AgentTemplate', id);
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

    const now = new Date().toISOString();

    // Prepare agent data for creation
    const agentData = {
      // Core AgentNodeParameters fields from template
      name: agentName,
      description: template.description,
      model: template.model,
      temperature: template.temperature,
      maxTokens: template.maxTokens,
      timeout: template.timeout || 30000,
      memory: template.memory ? JSON.stringify(template.memory) : null,
      blueprint: template.blueprint ? JSON.stringify(template.blueprint) : null,
      
      // Database-specific fields
      createdAt: now,
      updatedAt: now,
      version: '1.0.0',
      category: template.category,
      usageCount: 0,
      templateId: templateId,
      starshipId: starshipId,
    };

    // Create agent with auto-generated ID
    const rawAgent = await this.createEntityWithAutoId<any>('Agent', agentData);
    
    // Create relationship with starship
    try {
      await this.connection.executeWrite(
        `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
         CREATE (a)-[:DEPLOYED_ON]->(s)`,
        { starshipId, agentId: rawAgent.id }
      );
    } catch (error) {
      console.warn('Failed to create Agent-Starship relationship:', error);
    }
    
    // Deserialize for return (assuming Agent has similar structure)
    const createdAgent = {
      ...convertNeo4jIntsInObject(rawAgent),
      memory: rawAgent.memory ? JSON.parse(rawAgent.memory) : undefined,
      blueprint: rawAgent.blueprint ? JSON.parse(rawAgent.blueprint) : undefined,
    };

    return createdAgent as AgentModel;
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
      const defaultMemory: AgentMemoryState = {
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

      // Prepare template data for creation
      const templateData = {
        // Core AgentNodeParameters fields
        name: `${agent.name} Template`,
        description: this.getSafeValue(agent.description, '') as string,
        model: agent.model as string,
        temperature: agent.temperature as number | undefined,
        maxTokens: agent.maxTokens as number | undefined,
        timeout: 30000,
        memory: JSON.stringify(defaultMemory),
        blueprint: JSON.stringify(defaultBlueprint),
        
        // Database-specific fields
        createdAt: now,
        updatedAt: now,
        category: agent.category,
        usageCount: 0,
        
        // Template-specific fields
        icon: '🤖', // Default icon
        previewPrompts: [],
      };

      const rawCreated = await this.createEntityWithAutoId<any>('AgentTemplate', templateData);
      const created = this.deserializeTemplate(convertNeo4jIntsInObject(rawCreated));

      // Create USER-[:CREATES]->AGENT_TEMPLATE relationship if author user exists
      try {
        if (created.authorId && created.authorId !== 'system') {
          await this.connection.executeWrite(
            `MATCH (u:User {id: $authorId}), (t:AgentTemplate {id: $templateId})
             MERGE (u)-[r:CREATES]->(t)
             ON CREATE SET r.createdAt = $now`,
            {
              authorId: created.authorId,
              templateId: created.id,
              now
            }
          );
        }
      } catch (error) {
        console.warn('Failed to create USER-[:CREATES]->AGENT_TEMPLATE relationship:', error);
      }

      return created;
    }, 'createTemplateFromAgent', 'AgentTemplate', agentId);
  }
}
