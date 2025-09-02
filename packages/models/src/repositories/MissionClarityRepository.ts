/**
 * MissionClarityModelRepository - Neo4j-native storage for mission clarity assessments
 * 
 * Handles CRUD operations for MissionClarityModel nodes with single clarity per mission.
 * Uses MERGE pattern for upsert operations following existing repository patterns.
 */

import { BaseRepository } from './BaseRepository';
import { getConnection } from '../helpers/database';
import { 
  MissionClarityModel,
  CreateMissionClarityRequest,
  UpdateMissionClarityRequest
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

export class MissionClarityRepository extends BaseRepository {
  constructor() {
    super('MissionClarityRepository');
  }

  /**
   * Create or update mission clarity (single clarity per mission)
   * Uses MERGE pattern to handle both create and update scenarios
   */
  async upsertByMissionId(missionId: string, request: CreateMissionClarityRequest): Promise<MissionClarityModel> {
    return this.executeWithErrorHandling(async () => {
      // Validate required fields
      this.validateRequired(request, ['missionId', 'objectiveClarity', 'successMetrics', 'timelineDefinition', 'scopeBoundaries', 'reasoning', 'iteration'], 'upsert');
      
      // Validate score ranges (0-10)
      const scoreFields = ['objectiveClarity', 'successMetrics', 'timelineDefinition', 'scopeBoundaries'];
      for (const field of scoreFields) {
        const score = request[field as keyof CreateMissionClarityRequest] as number;
        if (typeof score !== 'number' || score < 0 || score > 10) {
          this.handleValidationError([{
            field,
            message: `${field} must be a number between 0 and 10`,
            value: score
          }], 'upsert');
        }
      }

      // Calculate overall score as average of 4 dimensions
      const overallScore = (
        request.objectiveClarity +
        request.successMetrics +
        request.timelineDefinition +
        request.scopeBoundaries
      ) / 4;

      const now = new Date().toISOString();
      
      // Generate ID for new clarity or reuse existing
      const clarityId = uuidv4();

      const cypher = `
        MATCH (m:Mission {id: $missionId})
        MERGE (m)-[:HAS_CLARITY]->(mc:MissionClarityModel {missionId: $missionId})
        ON CREATE SET 
          mc.id = $clarityId,
          mc.createdAt = $now
        SET 
          mc.objectiveClarity = $objectiveClarity,
          mc.successMetrics = $successMetrics,
          mc.timelineDefinition = $timelineDefinition,
          mc.scopeBoundaries = $scopeBoundaries,
          mc.overallScore = $overallScore,
          mc.reasoning = $reasoning,
          mc.iteration = $iteration,
          mc.updatedAt = $now
        RETURN mc
      `;

      const connection = getConnection();
      const result = await connection.executeWrite(cypher, {
        missionId,
        clarityId,
        objectiveClarity: request.objectiveClarity,
        successMetrics: request.successMetrics,
        timelineDefinition: request.timelineDefinition,
        scopeBoundaries: request.scopeBoundaries,
        overallScore,
        reasoning: request.reasoning,
        iteration: request.iteration,
        now
      });

      if (result.length === 0) {
        this.handleNotFound('Mission', missionId, 'upsert');
      }

      return result[0].mc as MissionClarityModel;
    }, 'upsertByMissionId', 'MissionClarityModel', missionId);
  }

  /**
   * Get mission clarity by mission ID
   */
  async getByMissionId(missionId: string): Promise<MissionClarityModel | null> {
    return this.executeWithErrorHandling(async () => {
      if (!missionId) {
        this.handleValidationError([{
          field: 'missionId',
          message: 'missionId is required',
          value: missionId
        }], 'get');
      }

      const cypher = `
        MATCH (m:Mission {id: $missionId})-[:HAS_CLARITY]->(mc:MissionClarityModel)
        RETURN mc
      `;

      const connection = getConnection();
      const result = await connection.executeQuery(cypher, { missionId });

      if (result.length === 0) {
        return null;
      }

      return result[0].mc as MissionClarityModel;
    }, 'getByMissionId', 'MissionClarityModel', missionId);
  }

  /**
   * Update existing mission clarity
   */
  async updateByMissionId(missionId: string, request: UpdateMissionClarityRequest): Promise<MissionClarityModel> {
    return this.executeWithErrorHandling(async () => {
      if (!missionId) {
        this.handleValidationError([{
          field: 'missionId',
          message: 'missionId is required',
          value: missionId
        }], 'update');
      }

      // Build dynamic SET clause based on provided fields
      const setClauses: string[] = ['mc.updatedAt = $updatedAt'];
      const params: any = {
        missionId,
        updatedAt: new Date().toISOString()
      };

      // Add score fields with validation
      const scoreFields = ['objectiveClarity', 'successMetrics', 'timelineDefinition', 'scopeBoundaries'];
      const providedScores: number[] = [];

      for (const field of scoreFields) {
        const value = request[field as keyof UpdateMissionClarityRequest];
        if (value !== undefined) {
          if (typeof value !== 'number' || value < 0 || value > 10) {
            this.handleValidationError([{
              field,
              message: `${field} must be a number between 0 and 10`,
              value
            }], 'update');
          }
          setClauses.push(`mc.${field} = $${field}`);
          params[field] = value;
          providedScores.push(value);
        }
      }

      // Add non-score fields
      if (request.reasoning !== undefined) {
        setClauses.push('mc.reasoning = $reasoning');
        params.reasoning = request.reasoning;
      }

      if (request.iteration !== undefined) {
        setClauses.push('mc.iteration = $iteration');
        params.iteration = request.iteration;
      }

      // If any scores were updated, recalculate overall score
      if (providedScores.length > 0) {
        // Get current scores for missing fields
        const currentClarity = await this.getByMissionId(missionId);
        if (!currentClarity) {
          this.handleNotFound('MissionClarityModel', missionId, 'update');
        }

        const allScores = [
          request.objectiveClarity ?? currentClarity!.objectiveClarity,
          request.successMetrics ?? currentClarity!.successMetrics,
          request.timelineDefinition ?? currentClarity!.timelineDefinition,
          request.scopeBoundaries ?? currentClarity!.scopeBoundaries
        ];

        const overallScore = allScores.reduce((sum, score) => sum + score, 0) / 4;
        setClauses.push('mc.overallScore = $overallScore');
        params.overallScore = overallScore;
      }

      const cypher = `
        MATCH (m:Mission {id: $missionId})-[:HAS_CLARITY]->(mc:MissionClarityModel)
        SET ${setClauses.join(', ')}
        RETURN mc
      `;

      const connection = getConnection();
      const result = await connection.executeWrite(cypher, params);

      if (result.length === 0) {
        this.handleNotFound('MissionClarityModel', missionId, 'update');
      }

      return result[0].mc as MissionClarityModel;
    }, 'updateByMissionId', 'MissionClarityModel', missionId);
  }

  /**
   * Delete mission clarity by mission ID
   */
  async deleteByMissionId(missionId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      if (!missionId) {
        this.handleValidationError([{
          field: 'missionId',
          message: 'missionId is required',
          value: missionId
        }], 'delete');
      }

      const cypher = `
        MATCH (m:Mission {id: $missionId})-[:HAS_CLARITY]->(mc:MissionClarityModel)
        DELETE mc
        RETURN count(mc) as deletedCount
      `;

      const connection = getConnection();
      const result = await connection.executeWrite(cypher, { missionId });

      return result.length > 0 && result[0].deletedCount > 0;
    }, 'deleteByMissionId', 'MissionClarityModel', missionId);
  }

  /**
   * Get all mission clarities (for analytics/debugging)
   */
  async getAll(): Promise<MissionClarityModel[]> {
    return this.executeWithErrorHandling(async () => {
      const cypher = `
        MATCH (mc:MissionClarityModel)
        RETURN mc
        ORDER BY mc.createdAt DESC
      `;

      const connection = getConnection();
      const result = await connection.executeQuery(cypher);

      return result.map(row => row.mc as MissionClarityModel);
    }, 'getAll', 'MissionClarityModel');
  }

  /**
   * Get mission clarities by score range (for analytics)
   */
  async getByScoreRange(minScore: number, maxScore: number): Promise<MissionClarityModel[]> {
    return this.executeWithErrorHandling(async () => {
      if (minScore < 0 || maxScore > 10 || minScore > maxScore) {
        this.handleValidationError([{
          field: 'scoreRange',
          message: 'Invalid score range: must be between 0-10 and min <= max',
          value: { minScore, maxScore }
        }], 'getByScoreRange');
      }

      const cypher = `
        MATCH (mc:MissionClarityModel)
        WHERE mc.overallScore >= $minScore AND mc.overallScore <= $maxScore
        RETURN mc
        ORDER BY mc.overallScore DESC, mc.createdAt DESC
      `;

      const connection = getConnection();
      const result = await connection.executeQuery(cypher, { minScore, maxScore });

      return result.map(row => row.mc as MissionClarityModel);
    }, 'getByScoreRange', 'MissionClarityModel');
  }
}