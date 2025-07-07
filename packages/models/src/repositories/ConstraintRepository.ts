import { getConnection } from '../connection';
import { Constraint, ConstraintRepository as ConstraintRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based constraint repository
 */
export class ConstraintRepository implements ConstraintRepositoryInterface {
  async findAll(): Promise<Constraint[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Constraint }>(
      'MATCH (c:Constraint) RETURN c ORDER BY c.severity DESC, c.createdAt DESC'
    );
    return result.map(record => record.c);
  }

  async findById(id: string): Promise<Constraint | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Constraint }>(
      'MATCH (c:Constraint) WHERE c.id = $id RETURN c',
      { id }
    );
    return result[0]?.c || null;
  }

  async findByCodex(codexId: string): Promise<Constraint[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Constraint }>(
      'MATCH (c:Constraint) WHERE c.codexId = $codexId RETURN c ORDER BY c.severity DESC, c.createdAt DESC',
      { codexId }
    );
    return result.map(record => record.c);
  }

  async findActive(codexId: string): Promise<Constraint[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Constraint }>(
      'MATCH (c:Constraint) WHERE c.codexId = $codexId AND c.isActive = true RETURN c ORDER BY c.severity DESC',
      { codexId }
    );
    return result.map(record => record.c);
  }

  async findByType(codexId: string, type: Constraint['type']): Promise<Constraint[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Constraint }>(
      'MATCH (c:Constraint) WHERE c.codexId = $codexId AND c.type = $type RETURN c ORDER BY c.severity DESC',
      { codexId, type }
    );
    return result.map(record => record.c);
  }

  async create(entity: Omit<Constraint, 'id' | 'createdAt'>): Promise<Constraint> {
    const connection = getConnection();
    const constraint: Constraint = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (c:Constraint $props) RETURN c',
      { props: constraint }
    );

    // Create relationship with codex
    await connection.executeWrite(
      `MATCH (codex:Codex {id: $codexId}), (c:Constraint {id: $constraintId})
       CREATE (codex)-[:CONTAINS {addedAt: $timestamp}]->(c)`,
      { 
        codexId: constraint.codexId, 
        constraintId: constraint.id, 
        timestamp: constraint.createdAt 
      }
    );

    return constraint;
  }

  async update(id: string, updates: Partial<Constraint>): Promise<Constraint | null> {
    const connection = getConnection();
    const updateProps = { 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    
    const result = await connection.executeWrite<{ c: Constraint }>(
      'MATCH (c:Constraint) WHERE c.id = $id SET c += $updates RETURN c',
      { id, updates: updateProps }
    );
    
    return result[0]?.c || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (c:Constraint) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 