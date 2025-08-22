import { getConnection } from '../connection';
import { Vision, VisionRepository as VisionRepositoryInterface } from '../types';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based vision repository with direct starship relationships
 * Rebuilt for Phase 2: Direct Vision → Starship relationship with starshipId FK
 */
export class VisionRepository extends BaseRepository implements VisionRepositoryInterface {
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

  async findAllByStarship(starshipId: string): Promise<Vision[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ starshipId }, ['starshipId'], 'findAllByStarship');
      
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        'MATCH (v:Vision) WHERE v.starshipId = $starshipId RETURN v ORDER BY v.createdAt DESC',
        { starshipId }
      );
      
      return result.map((record) => record.v);
    }, 'findAllByStarship', 'Vision', starshipId);
  }

  async findByQualityRange(minScore: number, maxScore: number): Promise<Vision[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ minScore, maxScore }, ['minScore', 'maxScore'], 'findByQualityRange');
      
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        'MATCH (v:Vision) WHERE v.overallQuality >= $minScore AND v.overallQuality <= $maxScore RETURN v ORDER BY v.overallQuality DESC',
        { minScore, maxScore }
      );
      
      return result.map((record) => record.v);
    }, 'findByQualityRange', 'Vision');
  }

  async findNeedingRefinement(confidenceThreshold: number = 0.7, qualityThreshold: number = 0.6): Promise<Vision[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        `MATCH (v:Vision) 
         WHERE v.confidence < $confidenceThreshold OR v.overallQuality < $qualityThreshold 
         RETURN v ORDER BY v.confidence ASC, v.overallQuality ASC`,
        { confidenceThreshold, qualityThreshold }
      );
      
      return result.map((record) => record.v);
    }, 'findNeedingRefinement', 'Vision');
  }

  async getRefinementHistory(starshipId: string, limit: number = 10): Promise<Vision[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ starshipId }, ['starshipId'], 'getRefinementHistory');
      
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        'MATCH (v:Vision) WHERE v.starshipId = $starshipId AND v.refinementCount > 0 RETURN v ORDER BY v.lastRefined DESC LIMIT $limit',
        { starshipId, limit }
      );
      
      return result.map((record) => record.v);
    }, 'getRefinementHistory', 'Vision', starshipId);
  }

  async updateQualityMetrics(
    id: string,
    metrics: {
      clarityScore?: number;
      specificityScore?: number;
      actionabilityScore?: number;
      inspirationalScore?: number;
      hasObjectives?: boolean;
      hasTimeframe?: boolean;
      hasMeasurables?: boolean;
    }
  ): Promise<Vision | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'updateQualityMetrics');
      
      const connection = getConnection();
      const updates = {
        ...metrics,
        updatedAt: new Date().toISOString()
      };
      
      const result = await connection.executeWrite<{ v: Vision }>(
        'MATCH (v:Vision) WHERE v.id = $id SET v += $updates RETURN v',
        { id, updates }
      );
      
      return result[0]?.v || null;
    }, 'updateQualityMetrics', 'Vision', id);
  }

  async incrementRefinementCount(id: string): Promise<Vision | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'incrementRefinementCount');
      
      const connection = getConnection();
      const result = await connection.executeWrite<{ v: Vision }>(
        `MATCH (v:Vision) WHERE v.id = $id 
         SET v.refinementCount = v.refinementCount + 1,
             v.lastRefined = $timestamp,
             v.updatedAt = $timestamp
         RETURN v`,
        { id, timestamp: new Date().toISOString() }
      );
      
      return result[0]?.v || null;
    }, 'incrementRefinementCount', 'Vision', id);
  }

  async setAsActive(id: string): Promise<Vision | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'setAsActive');
      
      const connection = getConnection();
      
      // First get the starship ID of this vision
      const visionResult = await connection.executeQuery<{ starshipId: string }>(
        'MATCH (v:Vision) WHERE v.id = $id RETURN v.starshipId as starshipId',
        { id }
      );
      
      const starshipId = visionResult[0]?.starshipId;
      if (!starshipId) {
        return null;
      }
      
      // Deactivate all other visions for this starship
      await connection.executeWrite(
        'MATCH (v:Vision) WHERE v.starshipId = $starshipId SET v.isActive = false',
        { starshipId }
      );
      
      // Activate this vision
      const result = await connection.executeWrite<{ v: Vision }>(
        `MATCH (v:Vision) WHERE v.id = $id 
         SET v.isActive = true, v.updatedAt = $timestamp
         RETURN v`,
        { id, timestamp: new Date().toISOString() }
      );
      
      return result[0]?.v || null;
    }, 'setAsActive', 'Vision', id);
  }

  async findWithComponents(flags: {
    hasObjectives?: boolean;
    hasTimeframe?: boolean;
    hasMeasurables?: boolean;
  }): Promise<Vision[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const conditions: string[] = [];
      const params: any = {};
      
      if (flags.hasObjectives !== undefined) {
        conditions.push('v.hasObjectives = $hasObjectives');
        params.hasObjectives = flags.hasObjectives;
      }
      if (flags.hasTimeframe !== undefined) {
        conditions.push('v.hasTimeframe = $hasTimeframe');
        params.hasTimeframe = flags.hasTimeframe;
      }
      if (flags.hasMeasurables !== undefined) {
        conditions.push('v.hasMeasurables = $hasMeasurables');
        params.hasMeasurables = flags.hasMeasurables;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const query = `MATCH (v:Vision) ${whereClause} RETURN v ORDER BY v.overallQuality DESC`;
      
      const result = await connection.executeQuery<{ v: Vision }>(query, params);
      return result.map((record) => record.v);
    }, 'findWithComponents', 'Vision');
  }

  async getAverageQualityMetrics(): Promise<{
    clarity: number;
    specificity: number;
    actionability: number;
    inspirational: number;
    overall: number;
  }> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{
        clarity: number;
        specificity: number;
        actionability: number;
        inspirational: number;
        overall: number;
      }>(
        `MATCH (v:Vision) 
         WHERE v.clarityScore IS NOT NULL AND v.specificityScore IS NOT NULL 
           AND v.actionabilityScore IS NOT NULL AND v.inspirationalScore IS NOT NULL
           AND v.overallQuality IS NOT NULL
         RETURN avg(v.clarityScore) as clarity,
                avg(v.specificityScore) as specificity,
                avg(v.actionabilityScore) as actionability,
                avg(v.inspirationalScore) as inspirational,
                avg(v.overallQuality) as overall`
      );
      
      return result[0] || { clarity: 0, specificity: 0, actionability: 0, inspirational: 0, overall: 0 };
    }, 'getAverageQualityMetrics', 'Vision');
  }

  async findTopQuality(limit: number = 10): Promise<Vision[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ v: Vision }>(
        'MATCH (v:Vision) WHERE v.overallQuality IS NOT NULL RETURN v ORDER BY v.overallQuality DESC LIMIT $limit',
        { limit }
      );
      
      return result.map((record) => record.v);
    }, 'findTopQuality', 'Vision');
  }
}