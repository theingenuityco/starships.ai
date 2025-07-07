import { getConnection } from '../connection';
import { MetaAnchor, MetaAnchorRepository as MetaAnchorRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based meta anchor repository for lens functionality
 */
export class MetaAnchorRepository implements MetaAnchorRepositoryInterface {
  async findAll(): Promise<MetaAnchor[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: MetaAnchor }>(
      'MATCH (m:MetaAnchor) RETURN m ORDER BY m.type, m.createdAt DESC'
    );
    return result.map(record => record.m);
  }

  async findById(id: string): Promise<MetaAnchor | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: MetaAnchor }>(
      'MATCH (m:MetaAnchor) WHERE m.id = $id RETURN m',
      { id }
    );
    return result[0]?.m || null;
  }

  async findByCodex(codexId: string): Promise<MetaAnchor[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: MetaAnchor }>(
      'MATCH (m:MetaAnchor) WHERE m.codexId = $codexId RETURN m ORDER BY m.type',
      { codexId }
    );
    return result.map(record => record.m);
  }

  async findByType(codexId: string, type: MetaAnchor['type']): Promise<MetaAnchor | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: MetaAnchor }>(
      'MATCH (m:MetaAnchor) WHERE m.codexId = $codexId AND m.type = $type RETURN m',
      { codexId, type }
    );
    return result[0]?.m || null;
  }

  async create(entity: Omit<MetaAnchor, 'id' | 'createdAt'>): Promise<MetaAnchor> {
    const connection = getConnection();
    const metaAnchor: MetaAnchor = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (m:MetaAnchor $props) RETURN m',
      { props: metaAnchor }
    );

    // Create relationship with codex
    await connection.executeWrite(
      `MATCH (c:Codex {id: $codexId}), (m:MetaAnchor {id: $metaAnchorId})
       CREATE (c)-[:ANCHORED_BY {anchorType: $type}]->(m)`,
      { 
        codexId: metaAnchor.codexId, 
        metaAnchorId: metaAnchor.id, 
        type: metaAnchor.type 
      }
    );

    return metaAnchor;
  }

  async update(id: string, updates: Partial<MetaAnchor>): Promise<MetaAnchor | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ m: MetaAnchor }>(
      'MATCH (m:MetaAnchor) WHERE m.id = $id SET m += $updates RETURN m',
      { id, updates }
    );
    
    return result[0]?.m || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (m:MetaAnchor) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 