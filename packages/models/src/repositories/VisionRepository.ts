import { getConnection } from '../helpers/database';
import { Vision } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based vision repository with direct starship relationships
 * Rebuilt for Phase 2: Direct Vision → Starship relationship with starshipId FK
 */
export class VisionRepository extends BaseRepository {
  constructor() {
    super('VisionRepository');
  }
  async findAll(): Promise<Vision[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        'MATCH (v:Vision) RETURN v ORDER BY v.createdAt DESC'
      );
      return result.map(record => record.v);
    }, 'findAll', 'Vision');
  }

  async findById(id: string): Promise<Vision | null> {
    this.validateRequired({ id }, ['id'], 'findById');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        'MATCH (v:Vision) WHERE v.id = $id RETURN v',
        { id }
      );
      return result[0]?.v || null;
    }, 'findById', 'Vision', id);
  }

  async findByStarship(starshipId: string): Promise<Vision | null> {
    this.validateRequired({ starshipId }, ['starshipId'], 'findByStarship');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        'MATCH (v:Vision) WHERE v.starshipId = $starshipId RETURN v',
        { starshipId }
      );
      return result[0]?.v || null;
    }, 'findByStarship', 'Vision');
  }

  async create(entity: Omit<Vision, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vision> {
    this.validateRequired(entity, ['starshipId', 'statement'], 'create');
    
    return this.executeWithErrorHandling(async () => {
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
    }, 'create', 'Vision');
  }

  async updateStatement(starshipId: string, statement: string): Promise<Vision | null> {
    this.validateRequired({ starshipId, statement }, ['starshipId', 'statement'], 'updateStatement');
    
    return this.executeWithErrorHandling(async () => {
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
    }, 'updateStatement', 'Vision', starshipId);
  }

  async update(id: string, updates: Partial<Vision>): Promise<Vision | null> {
    this.validateRequired({ id }, ['id'], 'update');
    
    return this.executeWithErrorHandling(async () => {
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
    }, 'update', 'Vision', id);
  }

  async delete(id: string): Promise<boolean> {
    this.validateRequired({ id }, ['id'], 'delete');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (v:Vision) WHERE v.id = $id DETACH DELETE v RETURN count(v) as deletedCount',
        { id }
      );
      
      return result[0]?.deletedCount > 0;
    }, 'delete', 'Vision', id);
  }

  /**
   * Updates vision metrics for a specific vision
   */
  async updateMetrics(
    starshipId: string,
    metrics: {
      clarityScore: number;
      specificityScore: number;
      actionabilityScore: number;
      inspirationalScore: number;
      overallQuality: number;
      hasObjectives: boolean;
      hasTimeframe: boolean;
      hasMeasurables: boolean;
    }
  ): Promise<Vision | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ v: Vision }>(
      `MATCH (v:Vision) WHERE v.starshipId = $starshipId 
       SET v.clarityScore = $clarityScore,
           v.specificityScore = $specificityScore,
           v.actionabilityScore = $actionabilityScore,
           v.inspirationalScore = $inspirationalScore,
           v.overallQuality = $overallQuality,
           v.hasObjectives = $hasObjectives,
           v.hasTimeframe = $hasTimeframe,
           v.hasMeasurables = $hasMeasurables,
           v.updatedAt = $timestamp
       RETURN v`,
      { 
        starshipId,
        ...metrics,
        timestamp: new Date().toISOString() 
      }
    );
    
    return result[0]?.v || null;
  }

  /**
   * Gets vision metrics for a specific starship
   */
  async getMetrics(starshipId: string): Promise<{
    clarityScore: number | null;
    specificityScore: number | null;
    actionabilityScore: number | null;
    inspirationalScore: number | null;
    overallQuality: number | null;
    hasObjectives: boolean | null;
    hasTimeframe: boolean | null;
    hasMeasurables: boolean | null;
  } | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ 
      clarityScore: number | null;
      specificityScore: number | null;
      actionabilityScore: number | null;
      inspirationalScore: number | null;
      overallQuality: number | null;
      hasObjectives: boolean | null;
      hasTimeframe: boolean | null;
      hasMeasurables: boolean | null;
    }>(
      `MATCH (v:Vision) WHERE v.starshipId = $starshipId 
       RETURN v.clarityScore as clarityScore,
              v.specificityScore as specificityScore,
              v.actionabilityScore as actionabilityScore,
              v.inspirationalScore as inspirationalScore,
              v.overallQuality as overallQuality,
              v.hasObjectives as hasObjectives,
              v.hasTimeframe as hasTimeframe,
              v.hasMeasurables as hasMeasurables`,
      { starshipId }
    );
    
    return result[0] || null;
  }

  /**
   * Finds visions that need metrics calculation (where overallQuality is null)
   */
  async findVisionsMissingMetrics(limit: number = 50): Promise<Vision[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ v: Vision }>(
      'MATCH (v:Vision) WHERE v.overallQuality IS NULL RETURN v ORDER BY v.createdAt DESC LIMIT $limit',
      { limit }
    );
    return result.map(record => record.v);
  }

  /**
   * Gets vision by starship ID (alias for findByStarship)
   */
  async getVisionByStarshipId(starshipId: string): Promise<{ vision: string } | null> {
    const visionEntity = await this.findByStarship(starshipId);
    if (!visionEntity) {
      return null;
    }
    return { vision: visionEntity.statement };
  }

  /**
   * Updates vision statement by starship ID (alias for updateStatement)
   */
  async updateVision(starshipId: string, newVision: string): Promise<Vision | null> {
    return this.updateStatement(starshipId, newVision);
  }
}