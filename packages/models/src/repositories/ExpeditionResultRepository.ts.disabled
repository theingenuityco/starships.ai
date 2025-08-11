import { getConnection } from '../connection';
import { 
  ExpeditionResult, 
  ExpeditionResultRepository as ExpeditionResultRepositoryInterface,
  ResultType,
  ResultFormat,
  QualityScore
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based expedition result repository
 * 
 * Handles all database operations for expedition results including CRUD operations,
 * quality scoring, result categorization, and deliverable management.
 */
export class ExpeditionResultRepository implements ExpeditionResultRepositoryInterface {
  
  /**
   * Find all results (admin use only)
   */
  async findAll(): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      'MATCH (r:ExpeditionResult) RETURN r ORDER BY r.createdAt DESC'
    );
    return result.map(record => record.r);
  }

  /**
   * Find result by ID
   */
  async findById(id: string): Promise<ExpeditionResult | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      'MATCH (r:ExpeditionResult) WHERE r.id = $id RETURN r',
      { id }
    );
    return result[0]?.r || null;
  }

  /**
   * Find all results for a specific expedition
   */
  async findByExpedition(expeditionId: string): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       RETURN r ORDER BY r.createdAt DESC`,
      { expeditionId }
    );
    return result.map(record => record.r);
  }

  /**
   * Find results by type for an expedition
   */
  async findByType(expeditionId: string, resultType: ResultType): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       WHERE r.resultType = $resultType
       RETURN r ORDER BY r.createdAt DESC`,
      { expeditionId, resultType }
    );
    return result.map(record => record.r);
  }

  /**
   * Find results by format for an expedition
   */
  async findByFormat(expeditionId: string, format: ResultFormat): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       WHERE r.format = $format
       RETURN r ORDER BY r.createdAt DESC`,
      { expeditionId, format }
    );
    return result.map(record => record.r);
  }

  /**
   * Find results created by a specific user or agent
   */
  async findByCreator(createdBy: string): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      `MATCH (r:ExpeditionResult) 
       WHERE r.createdBy = $createdBy
       RETURN r ORDER BY r.createdAt DESC`,
      { createdBy }
    );
    return result.map(record => record.r);
  }

  /**
   * Create a new result
   */
  async create(entity: Omit<ExpeditionResult, 'id' | 'createdAt'>): Promise<ExpeditionResult> {
    const connection = getConnection();
    const now = new Date().toISOString();
    
    const result: ExpeditionResult = {
      ...entity,
      id: uuidv4(),
      createdAt: now,
      updatedAt: entity.updatedAt || now,
      attachments: entity.attachments || [],
      metadata: entity.metadata || {},
      quality: entity.quality || {
        overall: 0,
        completeness: 0,
        accuracy: 0,
        relevance: 0,
        clarity: 0,
        assessedBy: 'system',
        assessedAt: now
      }
    };

    // Create result node
    await connection.executeWrite(
      'CREATE (r:ExpeditionResult $props) RETURN r',
      { props: result }
    );

    // Create relationship with expedition
    await connection.executeWrite(
      `MATCH (e:Expedition {id: $expeditionId}), (r:ExpeditionResult {id: $resultId})
       CREATE (e)-[:HAS_RESULT {createdAt: $timestamp}]->(r)`,
      {
        expeditionId: result.expeditionId,
        resultId: result.id,
        timestamp: result.createdAt
      }
    );

    // Create relationship with creator (agent or user)
    await connection.executeWrite(
      `MATCH (r:ExpeditionResult {id: $resultId})
       OPTIONAL MATCH (a:Agent {id: $createdBy})
       OPTIONAL MATCH (u:User {id: $createdBy})
       FOREACH (agent IN CASE WHEN a IS NOT NULL THEN [a] ELSE [] END |
         CREATE (agent)-[:CREATED_RESULT {createdAt: $timestamp}]->(r)
       )
       FOREACH (user IN CASE WHEN u IS NOT NULL THEN [u] ELSE [] END |
         CREATE (user)-[:CREATED_RESULT {createdAt: $timestamp}]->(r)
       )`,
      {
        resultId: result.id,
        createdBy: result.createdBy,
        timestamp: result.createdAt
      }
    );

    return result;
  }

  /**
   * Update a result
   */
  async update(id: string, updates: Partial<ExpeditionResult>): Promise<ExpeditionResult | null> {
    const connection = getConnection();
    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const result = await connection.executeWrite<{ r: ExpeditionResult }>(
      'MATCH (r:ExpeditionResult) WHERE r.id = $id SET r += $updates RETURN r',
      { id, updates: updateProps }
    );

    return result[0]?.r || null;
  }

  /**
   * Delete a result
   */
  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (r:ExpeditionResult) WHERE r.id = $id 
       DETACH DELETE r 
       RETURN count(r) as deletedCount`,
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  /**
   * Update quality score for a result
   */
  async updateQuality(resultId: string, quality: QualityScore): Promise<ExpeditionResult | null> {
    const connection = getConnection();
    
    const result = await connection.executeWrite<{ r: ExpeditionResult }>(
      `MATCH (r:ExpeditionResult) WHERE r.id = $resultId 
       SET r.quality = $quality, r.updatedAt = $timestamp 
       RETURN r`,
      { 
        resultId, 
        quality, 
        timestamp: new Date().toISOString() 
      }
    );

    return result[0]?.r || null;
  }

  /**
   * Get result statistics for an expedition
   */
  async getResultStats(expeditionId: string): Promise<{
    total: number;
    byType: Record<ResultType, number>;
    byFormat: Record<ResultFormat, number>;
    averageQuality: number;
  }> {
    const connection = getConnection();
    
    // Get total count and quality average
    const basicStats = await connection.executeQuery<{
      total: number;
      avgQuality: number;
    }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       RETURN count(r) as total, avg(r.quality.overall) as avgQuality`,
      { expeditionId }
    );

    // Get counts by type
    const typeStats = await connection.executeQuery<{
      resultType: ResultType;
      count: number;
    }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       RETURN r.resultType as resultType, count(r) as count`,
      { expeditionId }
    );

    // Get counts by format
    const formatStats = await connection.executeQuery<{
      format: ResultFormat;
      count: number;
    }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       RETURN r.format as format, count(r) as count`,
      { expeditionId }
    );

    const basic = basicStats[0] || { total: 0, avgQuality: 0 };

    // Initialize type counts
    const byType: Record<ResultType, number> = {
      'final-report': 0,
      'task-output': 0,
      'analysis': 0,
      'code': 0,
      'document': 0,
      'design': 0,
      'data': 0,
      'recommendation': 0
    };

    // Initialize format counts
    const byFormat: Record<ResultFormat, number> = {
      'text': 0,
      'markdown': 0,
      'json': 0,
      'code': 0,
      'html': 0,
      'pdf': 0,
      'image': 0,
      'video': 0,
      'audio': 0,
      'archive': 0
    };

    // Populate type counts
    typeStats.forEach(stat => {
      if (stat.resultType in byType) {
        byType[stat.resultType] = stat.count;
      }
    });

    // Populate format counts
    formatStats.forEach(stat => {
      if (stat.format in byFormat) {
        byFormat[stat.format] = stat.count;
      }
    });

    return {
      total: basic.total,
      byType,
      byFormat,
      averageQuality: Math.round((basic.avgQuality || 0) * 100) / 100
    };
  }

  /**
   * Get high-quality results for an expedition (quality score > threshold)
   */
  async getHighQualityResults(expeditionId: string, qualityThreshold: number = 80): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       WHERE r.quality.overall >= $threshold
       RETURN r ORDER BY r.quality.overall DESC, r.createdAt DESC`,
      { expeditionId, threshold: qualityThreshold }
    );
    return result.map(record => record.r);
  }

  /**
   * Get results that need quality assessment
   */
  async getResultsNeedingAssessment(expeditionId: string): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       WHERE r.quality.overall = 0 OR r.quality.assessedBy = 'system'
       RETURN r ORDER BY r.createdAt ASC`,
      { expeditionId }
    );
    return result.map(record => record.r);
  }

  /**
   * Search results by content
   */
  async searchResults(expeditionId: string, query: string): Promise<ExpeditionResult[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ r: ExpeditionResult }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       WHERE toLower(r.title) CONTAINS toLower($query) 
          OR toLower(r.description) CONTAINS toLower($query)
          OR toLower(r.content) CONTAINS toLower($query)
       RETURN r ORDER BY r.createdAt DESC`,
      { expeditionId, query }
    );
    return result.map(record => record.r);
  }

  /**
   * Delete all results for an expedition
   */
  async deleteByExpedition(expeditionId: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_RESULT]->(r:ExpeditionResult)
       DETACH DELETE r
       RETURN count(r) as deletedCount`,
      { expeditionId }
    );

    return result[0]?.deletedCount > 0;
  }
}