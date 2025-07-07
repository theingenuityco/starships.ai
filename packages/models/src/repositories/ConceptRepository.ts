import { getConnection } from '../connection';
import { Concept, ConceptRepository as ConceptRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based concept repository
 */
export class ConceptRepository implements ConceptRepositoryInterface {
  async findAll(): Promise<Concept[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Concept }>(
      'MATCH (c:Concept) RETURN c ORDER BY c.importance DESC, c.createdAt DESC'
    );
    return result.map(record => record.c);
  }

  async findById(id: string): Promise<Concept | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Concept }>(
      'MATCH (c:Concept) WHERE c.id = $id RETURN c',
      { id }
    );
    return result[0]?.c || null;
  }

  async findByCodex(codexId: string): Promise<Concept[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Concept }>(
      'MATCH (c:Concept) WHERE c.codexId = $codexId RETURN c ORDER BY c.importance DESC, c.createdAt DESC',
      { codexId }
    );
    return result.map(record => record.c);
  }

  async findByCategory(codexId: string, category: Concept['category']): Promise<Concept[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Concept }>(
      'MATCH (c:Concept) WHERE c.codexId = $codexId AND c.category = $category RETURN c ORDER BY c.importance DESC',
      { codexId, category }
    );
    return result.map(record => record.c);
  }

  async searchByName(codexId: string, nameQuery: string): Promise<Concept[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Concept }>(
      'MATCH (c:Concept) WHERE c.codexId = $codexId AND toLower(c.name) CONTAINS toLower($nameQuery) RETURN c ORDER BY c.importance DESC',
      { codexId, nameQuery }
    );
    return result.map(record => record.c);
  }

  async create(entity: Omit<Concept, 'id' | 'createdAt'>): Promise<Concept> {
    const connection = getConnection();
    const concept: Concept = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (c:Concept $props) RETURN c',
      { props: concept }
    );

    // Create relationship with codex
    await connection.executeWrite(
      `MATCH (codex:Codex {id: $codexId}), (c:Concept {id: $conceptId})
       CREATE (codex)-[:CONTAINS {addedAt: $timestamp}]->(c)`,
      { 
        codexId: concept.codexId, 
        conceptId: concept.id, 
        timestamp: concept.createdAt 
      }
    );

    return concept;
  }

  async update(id: string, updates: Partial<Concept>): Promise<Concept | null> {
    const connection = getConnection();
    const updateProps = { 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    
    const result = await connection.executeWrite<{ c: Concept }>(
      'MATCH (c:Concept) WHERE c.id = $id SET c += $updates RETURN c',
      { id, updates: updateProps }
    );
    
    return result[0]?.c || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (c:Concept) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }
} 