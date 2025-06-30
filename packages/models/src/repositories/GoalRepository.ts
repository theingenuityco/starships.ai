import { getConnection } from '../connection';
import { Goal, GoalRepository as GoalRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based goal repository
 */
export class GoalRepository implements GoalRepositoryInterface {
  async findAll(): Promise<Goal[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ g: Goal }>(
      'MATCH (g:Goal) RETURN g ORDER BY g.priority DESC, g.createdAt DESC'
    );
    return result.map(record => record.g);
  }

  async findById(id: string): Promise<Goal | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ g: Goal }>(
      'MATCH (g:Goal) WHERE g.id = $id RETURN g',
      { id }
    );
    return result[0]?.g || null;
  }

  async findByCodex(codexId: string): Promise<Goal[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ g: Goal }>(
      'MATCH (g:Goal) WHERE g.codexId = $codexId RETURN g ORDER BY g.priority DESC, g.createdAt DESC',
      { codexId }
    );
    return result.map(record => record.g);
  }

  async findByStatus(codexId: string, status: Goal['status']): Promise<Goal[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ g: Goal }>(
      'MATCH (g:Goal) WHERE g.codexId = $codexId AND g.status = $status RETURN g ORDER BY g.priority DESC',
      { codexId, status }
    );
    return result.map(record => record.g);
  }

  async create(entity: Omit<Goal, 'id' | 'createdAt'>): Promise<Goal> {
    const connection = getConnection();
    const goal: Goal = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (g:Goal $props) RETURN g',
      { props: goal }
    );

    // Create relationship with codex
    await connection.executeWrite(
      `MATCH (c:Codex {id: $codexId}), (g:Goal {id: $goalId})
       CREATE (c)-[:CONTAINS {addedAt: $timestamp}]->(g)`,
      { 
        codexId: goal.codexId, 
        goalId: goal.id, 
        timestamp: goal.createdAt 
      }
    );

    return goal;
  }

  async updateStatus(goalId: string, status: Goal['status']): Promise<Goal | null> {
    const connection = getConnection();
    const updateData: Partial<Goal> = {
      status,
      updatedAt: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.completedAt = new Date().toISOString();
    }

    const result = await connection.executeWrite<{ g: Goal }>(
      'MATCH (g:Goal) WHERE g.id = $id SET g += $updates RETURN g',
      { id: goalId, updates: updateData }
    );
    
    return result[0]?.g || null;
  }

  async update(id: string, updates: Partial<Goal>): Promise<Goal | null> {
    const connection = getConnection();
    const updateProps = { 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    
    const result = await connection.executeWrite<{ g: Goal }>(
      'MATCH (g:Goal) WHERE g.id = $id SET g += $updates RETURN g',
      { id, updates: updateProps }
    );
    
    return result[0]?.g || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (g:Goal) WHERE g.id = $id DETACH DELETE g RETURN count(g) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 