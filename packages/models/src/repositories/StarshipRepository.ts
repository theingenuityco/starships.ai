import { getConnection } from '../connection';
import { Starship, StarshipRepository as StarshipRepositoryInterface, Agent } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based starship repository
 */
export class StarshipRepository implements StarshipRepositoryInterface {
  async findAll(): Promise<Starship[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC'
    );
    return result.map(record => record.s);
  }

  async findById(id: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.id = $id RETURN s',
      { id }
    );
    return result[0]?.s || null;
  }

  async findByOwner(ownerId: string): Promise<Starship[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
      { ownerId }
    );
    return result.map(record => record.s);
  }

  async create(entity: Omit<Starship, 'id' | 'createdAt'>): Promise<Starship> {
    const connection = getConnection();
    
    // Set maxAgents based on class
    const maxAgents = entity.class === 'scout' ? 3 : 6;
    
    const starship: Starship = {
      ...entity,
      id: uuidv4(),
      maxAgents,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (s:Starship $props) RETURN s',
      { props: starship }
    );

    // Create relationship with owner
    await connection.executeWrite(
      `MATCH (u:User {id: $ownerId}), (s:Starship {id: $starshipId})
       CREATE (u)-[:OWNS {ownedSince: $timestamp}]->(s)`,
      { 
        ownerId: starship.ownerId, 
        starshipId: starship.id, 
        timestamp: starship.createdAt 
      }
    );

    return starship;
  }

  async update(id: string, updates: Partial<Starship>): Promise<Starship | null> {
    const connection = getConnection();
    const updateProps = { 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    
    const result = await connection.executeWrite<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.id = $id SET s += $updates RETURN s',
      { id, updates: updateProps }
    );
    
    return result[0]?.s || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }

  async getDeployedAgents(starshipId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       RETURN a ORDER BY a.name`,
      { starshipId }
    );
    return result.map(record => record.a);
  }

  async deployAgent(starshipId: string, agentId: string): Promise<boolean> {
    const connection = getConnection();
    
    // Check if starship has available slots
    const availableSlots = await this.getAvailableSlots(starshipId);
    if (availableSlots <= 0) {
      throw new Error('No available agent slots on this starship');
    }

    // Check if agent is already deployed
    const existingDeployment = await connection.executeQuery(
      `MATCH (s:Starship {id: $starshipId})<-[r:DEPLOYED_ON]-(a:Agent {id: $agentId})
       RETURN r`,
      { starshipId, agentId }
    );

    if (existingDeployment.length > 0) {
      throw new Error('Agent is already deployed on this starship');
    }

    // Deploy agent
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
       CREATE (a)-[:DEPLOYED_ON {
         deployedAt: $timestamp,
         isActive: true
       }]->(s)`,
      { 
        starshipId, 
        agentId, 
        timestamp: new Date().toISOString() 
      }
    );

    return true;
  }

  async removeAgent(starshipId: string, agentId: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})<-[r:DEPLOYED_ON]-(a:Agent {id: $agentId})
       DELETE r
       RETURN count(r) as deletedCount`,
      { starshipId, agentId }
    );
    
    return result[0]?.deletedCount > 0;
  }

  async getAvailableSlots(starshipId: string): Promise<number> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ 
      maxAgents: number, 
      deployedCount: number 
    }>(
      `MATCH (s:Starship {id: $starshipId})
       OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:Agent)
       RETURN s.maxAgents as maxAgents, count(a) as deployedCount`,
      { starshipId }
    );

    const { maxAgents, deployedCount } = result[0] || { maxAgents: 0, deployedCount: 0 };
    return maxAgents - Number(deployedCount);
  }
} 