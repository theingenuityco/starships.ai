import { getConnection } from '../connection';
import { Vision, VisionRepository as VisionRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based vision repository
 */
export class VisionRepository implements VisionRepositoryInterface {
  async findAll(): Promise<Vision[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ v: Vision }>(
      'MATCH (v:Vision) RETURN v ORDER BY v.createdAt DESC'
    );
    return result.map(record => record.v);
  }

  async findById(id: string): Promise<Vision | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ v: Vision }>(
      'MATCH (v:Vision) WHERE v.id = $id RETURN v',
      { id }
    );
    return result[0]?.v || null;
  }

  async findByCodex(codexId: string): Promise<Vision | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ v: Vision }>(
      'MATCH (v:Vision) WHERE v.codexId = $codexId RETURN v',
      { codexId }
    );
    return result[0]?.v || null;
  }

  async create(entity: Omit<Vision, 'id' | 'createdAt'>): Promise<Vision> {
    const connection = getConnection();
    const vision: Vision = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (v:Vision $props) RETURN v',
      { props: vision }
    );

    // Create relationship with codex
    await connection.executeWrite(
      `MATCH (c:Codex {id: $codexId}), (v:Vision {id: $visionId})
       CREATE (c)-[:CONTAINS {addedAt: $timestamp}]->(v)`,
      { 
        codexId: vision.codexId, 
        visionId: vision.id, 
        timestamp: vision.createdAt 
      }
    );

    return vision;
  }

  async updateStatement(codexId: string, statement: string): Promise<Vision | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ v: Vision }>(
      `MATCH (v:Vision) WHERE v.codexId = $codexId 
       SET v.statement = $statement, 
           v.updatedAt = $timestamp,
           v.lastRefined = $timestamp,
           v.refinementCount = v.refinementCount + 1
       RETURN v`,
      { 
        codexId, 
        statement, 
        timestamp: new Date().toISOString() 
      }
    );
    
    return result[0]?.v || null;
  }

  async update(id: string, updates: Partial<Vision>): Promise<Vision | null> {
    const connection = getConnection();
    const updateProps = { 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    
    const result = await connection.executeWrite<{ v: Vision }>(
      'MATCH (v:Vision) WHERE v.id = $id SET v += $updates RETURN v',
      { id, updates: updateProps }
    );
    
    return result[0]?.v || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (v:Vision) WHERE v.id = $id DETACH DELETE v RETURN count(v) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 