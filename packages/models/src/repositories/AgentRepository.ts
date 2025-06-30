import { getConnection } from '../connection';
import { Agent, AgentRepository as AgentRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based agent repository
 */
export class AgentRepository implements AgentRepositoryInterface {
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
      { id }
    );
    return result[0]?.a || null;
  }

  async findByChannel(channelId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)-[:ACTIVE_IN]->(c:Channel) WHERE c.id = $channelId RETURN a',
      { channelId }
    );
    return result.map(record => record.a);
  }

  async findByUser(userId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
      { userId }
    );
    return result.map(record => record.a);
  }

  async findByStarship(starshipId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
      { starshipId }
    );
    return result.map(record => record.a);
  }

  async create(entity: Omit<Agent, 'id' | 'createdAt'>): Promise<Agent> {
    const connection = getConnection();
    const agent: Agent = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (a:Agent $props) RETURN a',
      { props: agent }
    );

    return agent;
  }

  async update(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a',
      { id, updates }
    );
    
    return result[0]?.a || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 