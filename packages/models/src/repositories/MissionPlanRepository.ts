/**
 * MissionPlanRepository - Repository for mission execution plans
 * 
 * Handles CRUD operations for MissionPlan and MissionTask entities following
 * BaseRepository patterns and Neo4j MERGE patterns like MissionClarity.
 */

import { BaseRepository } from './BaseRepository';
import { getConnection } from '../connection';
import { 
  MissionPlan, 
  MissionTask,
  CreateMissionPlanRequest, 
  UpdateMissionPlanRequest 
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

export interface MissionPlanRepositoryInterface {
  createPlan(request: CreateMissionPlanRequest): Promise<MissionPlan>;
  getPlanByMissionId(missionId: string): Promise<MissionPlan | null>;
  updatePlan(missionId: string, updates: UpdateMissionPlanRequest): Promise<MissionPlan>;
  deletePlan(missionId: string): Promise<void>;
}

export class MissionPlanRepository extends BaseRepository implements MissionPlanRepositoryInterface {
  constructor() {
    super('MissionPlanRepository');
  }

  async createPlan(request: CreateMissionPlanRequest): Promise<MissionPlan> {
    return this.executeWithErrorHandling(async () => {
      // Validation following BaseRepository pattern
      this.validateRequired(request, ['missionId', 'tasks'], 'createPlan');
      
      if (!Array.isArray(request.tasks) || request.tasks.length === 0) {
        this.handleValidationError([{
          field: 'tasks',
          message: 'At least one task is required',
          value: request.tasks
        }], 'createPlan');
      }

      const connection = getConnection();
      const planId = uuidv4();
      const now = new Date().toISOString();

      // Check if mission exists
      const missionCheck = await connection.executeQuery(
        'MATCH (m:Mission {id: $missionId}) RETURN m.id as id',
        { missionId: request.missionId }
      );

      if (!missionCheck || missionCheck.length === 0) {
        this.handleNotFound('Mission', request.missionId, 'createPlan');
      }

      // Create plan using MERGE pattern (like MissionClarity)
      const planCypher = `
        MATCH (m:Mission {id: $missionId})
        MERGE (m)-[:HAS_PLAN]->(mp:MissionPlan {missionId: $missionId})
        ON CREATE SET 
          mp.id = $planId,
          mp.approvalStatus = 'pending',
          mp.createdAt = $now
        SET 
          mp.updatedAt = $now
        RETURN mp
      `;

      await connection.executeWrite(planCypher, { 
        missionId: request.missionId, 
        planId, 
        now 
      });

      // Clear existing tasks and create new ones
      await connection.executeWrite(`
        MATCH (mp:MissionPlan {missionId: $missionId})-[:CONTAINS_TASK]->(t:MissionTask)
        DETACH DELETE t
      `, { missionId: request.missionId });

      // Create tasks
      const tasks: MissionTask[] = [];
      for (const taskData of request.tasks) {
        const taskId = uuidv4();
        const task: MissionTask = {
          id: taskId,
          ...taskData
        };

        await connection.executeWrite(`
          MATCH (mp:MissionPlan {missionId: $missionId})
          CREATE (mp)-[:CONTAINS_TASK]->(t:MissionTask $taskProps)
        `, {
          missionId: request.missionId,
          taskProps: task
        });

        tasks.push(task);
      }

      return {
        id: planId,
        missionId: request.missionId,
        tasks,
        approvalStatus: 'pending',
        createdAt: now,
        updatedAt: now
      } as MissionPlan;
    }, 'createPlan', 'MissionPlan');
  }

  async getPlanByMissionId(missionId: string): Promise<MissionPlan | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'getPlanByMissionId');

      const connection = getConnection();
      
      const result = await connection.executeQuery(`
        MATCH (m:Mission {id: $missionId})-[:HAS_PLAN]->(mp:MissionPlan)
        OPTIONAL MATCH (mp)-[:CONTAINS_TASK]->(t:MissionTask)
        RETURN mp, collect(t) as tasks
      `, { missionId });

      if (!result || result.length === 0) return null;

      const record = result[0];
      const mp = record.mp;
      const tasks = record.tasks;
      
      return { 
        ...mp, 
        tasks: tasks ? tasks.filter((t: unknown) => t !== null) : []
      } as MissionPlan;
    }, 'getPlanByMissionId', 'MissionPlan', missionId);
  }

  async updatePlan(missionId: string, updates: UpdateMissionPlanRequest): Promise<MissionPlan> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'updatePlan');

      if (!updates || Object.keys(updates).length === 0) {
        this.handleValidationError([{
          field: 'updates',
          message: 'At least one field must be provided for update'
        }], 'updatePlan');
      }

      // Build SET clause following BaseRepository pattern
      const setClauses: string[] = ['mp.updatedAt = $updatedAt'];
      const params: any = {
        missionId,
        updatedAt: new Date().toISOString()
      };

      if (updates.approvalStatus !== undefined) {
        setClauses.push('mp.approvalStatus = $approvalStatus');
        params.approvalStatus = updates.approvalStatus;
      }

      if (updates.approvalTimestamp !== undefined) {
        setClauses.push('mp.approvalTimestamp = $approvalTimestamp');
        params.approvalTimestamp = updates.approvalTimestamp;
      }

      const connection = getConnection();
      const query = `
        MATCH (mp:MissionPlan {missionId: $missionId})
        SET ${setClauses.join(', ')}
        RETURN mp
      `;

      const result = await connection.executeWrite(query, params);

      if (!result || result.length === 0) {
        this.handleNotFound('MissionPlan', missionId, 'updatePlan');
      }

      // Return full plan with tasks
      return this.getPlanByMissionId(missionId) as Promise<MissionPlan>;
    }, 'updatePlan', 'MissionPlan', missionId);
  }

  async deletePlan(missionId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'deletePlan');

      const connection = getConnection();
      
      await connection.executeWrite(`
        MATCH (mp:MissionPlan {missionId: $missionId})
        OPTIONAL MATCH (mp)-[:CONTAINS_TASK]->(t:MissionTask)
        DETACH DELETE mp, t
      `, { missionId });
    }, 'deletePlan', 'MissionPlan', missionId);
  }
}