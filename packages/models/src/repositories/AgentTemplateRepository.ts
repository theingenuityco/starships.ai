import { AgentTemplate, AgentTemplateRepository, Agent } from '../types';
import { Neo4jConnection } from '../helpers/database';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../helpers/database';

export class Neo4jAgentTemplateRepository implements AgentTemplateRepository {
  constructor(private connection: Neo4jConnection) {}

  async findAll(): Promise<AgentTemplate[]> {
    const query = `
      MATCH (t:AgentTemplate)
      RETURN t
      ORDER BY t.createdAt DESC
    `;

    const results = await this.connection.executeQuery<{ t: AgentTemplate }>(query);
    return convertNeo4jIntsInArray(results.map((result) => result.t));
  }

  async findById(id: string): Promise<AgentTemplate | null> {
    const query = `
      MATCH (t:AgentTemplate {id: $id})
      RETURN t
    `;

    const results = await this.connection.executeQuery<{ t: AgentTemplate }>(query, { id });
    const template = results.length > 0 ? results[0].t : null;
    return template ? convertNeo4jIntsInObject(template) : null;
  }

  async create(entity: Omit<AgentTemplate, 'id' | 'createdAt'>): Promise<AgentTemplate> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const template: AgentTemplate = {
      ...entity,
      id,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    };

    const query = `
      CREATE (t:AgentTemplate $template)
      RETURN t
    `;
    
    const results = await this.connection.executeWrite<{ t: AgentTemplate }>(query, { template });
    const created = convertNeo4jIntsInObject(results[0].t);

    // Create USER-[:CREATES]->AGENT_TEMPLATE relationship if author user exists
    try {
      if (template.authorId && template.authorId !== 'system') {
        await this.connection.executeWrite(
          `MATCH (u:User {id: $authorId}), (t:AgentTemplate {id: $templateId})
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
  }

  async update(id: string, updates: Partial<AgentTemplate>): Promise<AgentTemplate | null> {
    const updateFields = Object.keys(updates)
      .filter((key) => key !== 'id' && key !== 'createdAt')
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

    const results = await this.connection.executeWrite<{ t: AgentTemplate }>(query, {
      id,
      updates,
      now: new Date().toISOString(),
    });

    const template = results.length > 0 ? results[0].t : null;
    return template ? convertNeo4jIntsInObject(template) : null;
  }

  async delete(id: string): Promise<boolean> {
    const query = `
      MATCH (t:AgentTemplate {id: $id})
      DELETE t
      RETURN count(t) as deletedCount
    `;

    const results = await this.connection.executeWrite<{ deletedCount: number }>(query, { id });
    return results[0]?.deletedCount > 0;
  }

  async findByAuthor(authorId: string): Promise<AgentTemplate[]> {
    const query = `
      MATCH (t:AgentTemplate {authorId: $authorId})
      RETURN t
      ORDER BY t.createdAt DESC
    `;

    const results = await this.connection.executeQuery<{ t: AgentTemplate }>(query, { authorId });
    return convertNeo4jIntsInArray(results.map((result) => result.t));
  }

  async findByCategory(category: string): Promise<AgentTemplate[]> {
    const query = `
      MATCH (t:AgentTemplate {category: $category})
      WHERE t.isPublic = true
      RETURN t
      ORDER BY t.usageCount DESC, t.rating DESC
    `;

    const results = await this.connection.executeQuery<{ t: AgentTemplate }>(query, { category });
    return convertNeo4jIntsInArray(results.map((result) => result.t));
  }

  async findByTags(tags: string[]): Promise<AgentTemplate[]> {
    const query = `
      MATCH (t:AgentTemplate)
      WHERE t.isPublic = true AND ANY(tag IN $tags WHERE tag IN t.tags)
      RETURN t, size([tag IN $tags WHERE tag IN t.tags]) as matchCount
      ORDER BY matchCount DESC, t.usageCount DESC, t.rating DESC
    `;

    const results = await this.connection.executeQuery<{ t: AgentTemplate }>(query, { tags });
    return convertNeo4jIntsInArray(results.map((result) => result.t));
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<AgentTemplate[]> {
    const query = `
      MATCH (t:AgentTemplate {isPublic: true})
      RETURN t
      ORDER BY t.usageCount DESC, t.rating DESC, t.createdAt DESC
      SKIP $offset
      LIMIT $limit
    `;

    const results = await this.connection.executeQuery<{ t: AgentTemplate }>(query, {
      limit: int(limit),
      offset: int(offset),
    });
    return convertNeo4jIntsInArray(results.map((result) => result.t));
  }

  async searchTemplates(query: string): Promise<AgentTemplate[]> {
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

    const results = await this.connection.executeQuery<{ t: AgentTemplate }>(searchQuery, {
      query,
    });
    return convertNeo4jIntsInArray(results.map((result) => result.t));
  }

  async incrementUsageCount(id: string): Promise<void> {
    const query = `
      MATCH (t:AgentTemplate {id: $id})
      SET t.usageCount = t.usageCount + 1, t.updatedAt = $now
    `;

    await this.connection.executeWrite(query, { id, now: new Date().toISOString() });
  }

  async updateRating(id: string, rating: number): Promise<void> {
    const query = `
      MATCH (t:AgentTemplate {id: $id})
      SET t.rating = $rating, t.updatedAt = $now
    `;

    await this.connection.executeWrite(query, { id, rating, now: new Date().toISOString() });
  }

  async createAgentFromTemplate(
    templateId: string,
    agentName: string,
    authorId: string,
    starshipId: string
  ): Promise<Agent> {
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

    const agent: Agent = {
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
    };

    const query = `
      MATCH (s:Starship {id: $starshipId})
      CREATE (a:Agent $agent)
      CREATE (a)-[:DEPLOYED_ON]->(s)
      RETURN a
    `;
    
    const results = await this.connection.executeWrite<{ a: Agent }>(query, { agent, starshipId });
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

  async createTemplateFromAgent(agentId: string): Promise<AgentTemplate | null> {
    // First get the agent
    const query = `
      MATCH (a:Agent {id: $agentId})
      WHERE a.isPublic = true
      RETURN a
    `;

    const agentResults = await this.connection.executeQuery<{ a: Agent }>(query, { agentId });

    if (agentResults.length === 0) {
      return null; // Agent not found or not public
    }

    const agent = agentResults[0].a;

    // Create template from agent
    const templateId = uuidv4();
    const now = new Date().toISOString();

    const template: AgentTemplate = {
      id: templateId,
      name: `${agent.name} Template`,
      description: agent.description || '',
      category: agent.category,
      tags: [...(agent.tags || [])],
      systemPrompt: agent.systemPrompt || '',
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
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
      CREATE (t:AgentTemplate $template)
      RETURN t
    `;
    
    const results = await this.connection.executeWrite<{ t: AgentTemplate }>(createQuery, {
      template,
    });
    const created = convertNeo4jIntsInObject(results[0].t);

    // Create USER-[:CREATES]->AGENT_TEMPLATE relationship if author user exists
    try {
      if (template.authorId && template.authorId !== 'system') {
        await this.connection.executeWrite(
          `MATCH (u:User {id: $authorId}), (t:AgentTemplate {id: $templateId})
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
  }
}
