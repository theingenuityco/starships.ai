import { getConnection } from '../connection';
import { Vision, VisionRepository as VisionRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based vision repository with direct starship relationships
 * Rebuilt for Phase 2: Direct Vision → Starship relationship with starshipId FK
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

  async findByStarship(starshipId: string): Promise<Vision | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ v: Vision }>(
      'MATCH (v:Vision) WHERE v.starshipId = $starshipId RETURN v',
      { starshipId }
    );
    return result[0]?.v || null;
  }

  async create(entity: Omit<Vision, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vision> {
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

    // Create relationship with starship
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId}), (v:Vision {id: $visionId})
       CREATE (s)-[:HAS_VISION {createdAt: $timestamp}]->(v)`,
      { 
        starshipId: vision.starshipId, 
        visionId: vision.id, 
        timestamp: vision.createdAt 
      }
    );

    return vision;
  }

  async updateStatement(starshipId: string, statement: string): Promise<Vision | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ v: Vision }>(
      `MATCH (v:Vision) WHERE v.starshipId = $starshipId 
       SET v.statement = $statement, 
           v.updatedAt = $timestamp,
           v.lastRefined = $timestamp,
           v.refinementCount = v.refinementCount + 1
       RETURN v`,
      { 
        starshipId, 
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