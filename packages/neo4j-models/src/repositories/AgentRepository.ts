import { getConnection } from '../connection';
import { Agent, AgentRepository as IAgentRepository } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class AgentRepository implements IAgentRepository {
  async findAll(): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC'
    );
    return result.map(record => record.a);
  }

  async findById(id: string): Promise<Agent | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.id = $id RETURN a',
      { id: id }
    );
    return result.length > 0 ? result[0].a : null;
  }

  async create(entity: Omit<Agent, 'id' | 'createdAt'>): Promise<Agent> {
    const connection = getConnection();
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    
    const result = await connection.executeWrite<{ a: Agent }>(
      `CREATE (a:Agent {
        id: $id,
        name: $name,
        model: $model,
        systemPrompt: $systemPrompt,
        createdAt: $createdAt
      }) RETURN a`,
      { id: id, createdAt: createdAt, name: entity.name, model: entity.model, systemPrompt: entity.systemPrompt }
    );
    
    return result[0].a;
  }

  async update(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    const connection = getConnection();
    
    // Build SET clause dynamically
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `a.${key} = $${key}`)
      .join(', ');
    
    if (!setClause) {
      return this.findById(id);
    }

    const result = await connection.executeWrite<{ a: Agent }>(
      `MATCH (a:Agent) WHERE a.id = $id
       SET ${setClause}
       RETURN a`,
      { id: id, name: updates.name, model: updates.model, systemPrompt: updates.systemPrompt }
    );
    
    return result.length > 0 ? result[0].a : null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
      { id: id }
    );
    
    return result[0]?.deletedCount > 0;
  }

  async findByChannel(channelId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      `MATCH (a:Agent)-[r:DEPLOYED_IN]->(c:Channel)
       WHERE c.id = $channelId
       RETURN a ORDER BY a.createdAt DESC`,
      { channelId: channelId }
    );
    return result.map(record => record.a);
  }

  async findByUser(userId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      `MATCH (u:User)-[r:INTERACTS_WITH]->(a:Agent)
       WHERE u.id = $userId
       RETURN a ORDER BY r.lastInteraction DESC`,
      { userId: userId }
    );
    return result.map(record => record.a);
  }

  // Helper method to create relationships
  async deployToChannel(agentId: string, channelId: string): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      `MATCH (a:Agent), (c:Channel)
       WHERE a.id = $agentId AND c.id = $channelId
       MERGE (a)-[r:DEPLOYED_IN]->(c)
       SET r.deployedAt = $deployedAt, r.status = 'active'`,
      { agentId: agentId, channelId: channelId, deployedAt: new Date().toISOString() }
    );
  }

  async linkToModel(agentId: string, modelId: string): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      `MATCH (a:Agent), (m:Model)
       WHERE a.id = $agentId AND m.id = $modelId
       MERGE (a)-[r:USES]->(m)
       SET r.configuredAt = $configuredAt`,
      { agentId: agentId, modelId: modelId, configuredAt: new Date().toISOString() }
    );
  }
} 