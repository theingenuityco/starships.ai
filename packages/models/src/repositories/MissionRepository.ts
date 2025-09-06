/**
 * Mission Repository - Layer 3
 *
 * Abstracts database operations and provides a clean interface for mission data access.
 * Follows the layered architecture pattern established by ConversationRepository and UserRepository.
 */

import { MissionEntity } from '@/entities/MissionEntity';
import { getConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type {
  CreateMissionRequest,
  MissionFilters,
  MissionListResponse,
  MissionModel,
  MissionSort,
  UpdateMissionRequest,
} from '@starships/protocol';

export class MissionRepository extends BaseRepository {
  constructor() {
    super('MissionRepository');
  }

  async createMission(request: CreateMissionRequest, userId: string): Promise<MissionModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Create mission data with defaults
        const missionData = {
          ...request,
          status: 'draft' as const,
          phase: 'welcome' as const,
          approvalStatus: 'pending' as const,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
        };

        // Validate using Entity
        await MissionEntity.validate(missionData, 'create');

        // Check if starship exists
        const connection = getConnection();
        const starshipResult = await connection.executeQuery('MATCH (s:Starship {id: $starshipId}) RETURN s.id as id', {
          starshipId: request.starshipId,
        });

        if (!starshipResult || starshipResult.length === 0) {
          this.handleNotFound('Starship', request.starshipId, 'createMission');
        }

        // Transform using Entity
        const missionEntity = MissionEntity.deserialize(missionData);

        // Use base repository for database operation
        const result = await this.createEntityWithAutoId<MissionModel>('Mission', missionEntity.serialize());

        return MissionEntity.deserialize(result);
      },
      'create',
      'Mission'
    );
  }

  async getMissionById(id: string): Promise<MissionModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ m: MissionModel }>('MATCH (m:Mission) WHERE m.id = $id RETURN m', { id });

        if (!result || result.length === 0) {
          this.handleNotFound('Mission', id, 'getMissionById');
        }

        const mission = result[0].m;
        return MissionEntity.deserialize(mission);
      },
      'findById',
      'Mission',
      id
    );
  }

  async getMissionModelsByStarshipId(starshipId: string, filters?: MissionFilters, sort?: MissionSort): Promise<MissionListResponse> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();

        // Build WHERE clause
        let whereClause = 'm.starshipId = $starshipId';
        const params: any = { starshipId };

        if (filters?.status && filters.status.length > 0) {
          whereClause += ' AND m.status IN $statusList';
          params.statusList = filters.status;
        }

        if (filters?.createdBy) {
          whereClause += ' AND m.createdBy = $createdBy';
          params.createdBy = filters.createdBy;
        }

        // Build ORDER BY clause
        let orderByClause = 'ORDER BY m.createdAt DESC';
        if (sort?.field && sort?.direction) {
          orderByClause = `ORDER BY m.${sort.field} ${sort.direction.toUpperCase()}`;
        }

        const query = `
          MATCH (m:Mission)
          WHERE ${whereClause}
          RETURN m
          ${orderByClause}
        `;

        const result = await connection.executeQuery<{ m: MissionModel }>(query, params);

        const missions: MissionModel[] = result?.map((record) => MissionEntity.deserialize(record.m)) || [];

        return {
          missions,
          total: missions.length,
        };
      },
      'findByStarshipId',
      'Mission'
    );
  }

  async getAllMissions(filters?: MissionFilters, sort?: MissionSort): Promise<MissionListResponse> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();

        // Build WHERE clause
        let whereClause = '';
        const params: any = {};

        const conditions: string[] = [];

        if (filters?.starshipId) {
          conditions.push('m.starshipId = $starshipId');
          params.starshipId = filters.starshipId;
        }

        if (filters?.status && filters.status.length > 0) {
          conditions.push('m.status IN $statusList');
          params.statusList = filters.status;
        }

        if (filters?.createdBy) {
          conditions.push('m.createdBy = $createdBy');
          params.createdBy = filters.createdBy;
        }

        if (conditions.length > 0) {
          whereClause = `WHERE ${conditions.join(' AND ')}`;
        }

        // Build ORDER BY clause
        let orderByClause = 'ORDER BY m.createdAt DESC';
        if (sort?.field && sort?.direction) {
          orderByClause = `ORDER BY m.${sort.field} ${sort.direction.toUpperCase()}`;
        }

        const query = `
          MATCH (m:Mission)
          ${whereClause}
          RETURN m
          ${orderByClause}
        `;

        const result = await connection.executeQuery<{ m: MissionModel }>(query, params);

        const missions: MissionModel[] = result?.map((record) => MissionEntity.deserialize(record.m)) || [];

        return {
          missions,
          total: missions.length,
        };
      },
      'findAll',
      'Mission'
    );
  }

  async updateMission(id: string, updates: UpdateMissionRequest): Promise<MissionModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate using Entity
        if (Object.keys(updates).length > 0) {
          await MissionEntity.validate(updates, 'update');
        }

        const connection = getConnection();
        const now = new Date().toISOString();

        // Transform using Entity
        const updateEntity = MissionEntity.deserialize({
          ...updates,
          updatedAt: now,
        });

        const updateData = updateEntity.serialize();

        // Build SET clause for non-null values
        const setClause = Object.keys(updateData)
          .filter((key) => key !== 'id' && key !== 'createdAt' && updateData[key] !== undefined)
          .map((key) => `m.${key} = $${key}`)
          .join(', ');

        if (!setClause) {
          // If no valid updates, just return the existing mission
          return this.getMissionById(id);
        }

        const params = {
          id,
          ...updateData,
        };

        const result = await connection.executeWrite<{ m: MissionModel }>(
          `MATCH (m:Mission) WHERE m.id = $id
           SET ${setClause}
           RETURN m`,
          params
        );

        if (result.length === 0) {
          this.handleNotFound('Mission', id, 'update');
        }

        return MissionEntity.deserialize(result[0].m);
      },
      'update',
      'Mission',
      id
    );
  }

  async deleteMissionModel(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (m:Mission) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
          { id }
        );

        if (result[0]?.deletedCount === 0) {
          this.handleNotFound('Mission', id, 'delete');
        }
      },
      'delete',
      'Mission',
      id
    );
  }

  // Additional helper methods following repository patterns

  async findByStatus(status: MissionModel['status'], starshipId?: string): Promise<MissionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        let query = 'MATCH (m:Mission) WHERE m.status = $status';
        const params: any = { status };

        if (starshipId) {
          query += ' AND m.starshipId = $starshipId';
          params.starshipId = starshipId;
        }

        query += ' RETURN m ORDER BY m.updatedAt DESC';

        const result = await connection.executeQuery<{ m: MissionModel }>(query, params);
        return result.map((record) => MissionEntity.deserialize(record.m));
      },
      'findByStatus',
      'Mission'
    );
  }

  async findByCreatedBy(userId: string): Promise<MissionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ m: MissionModel }>(
          'MATCH (m:Mission) WHERE m.createdBy = $userId RETURN m ORDER BY m.createdAt DESC',
          { userId }
        );
        return result.map((record) => MissionEntity.deserialize(record.m));
      },
      'findByCreatedBy',
      'Mission'
    );
  }

  async findActiveMissions(): Promise<MissionModel[]> {
    return this.findByStatus('active');
  }

  async findDraftMissions(starshipId?: string): Promise<MissionModel[]> {
    return this.findByStatus('draft', starshipId);
  }

  async findCompletedMissions(starshipId?: string): Promise<MissionModel[]> {
    return this.findByStatus('completed', starshipId);
  }

  async countMissionsByStatus(starshipId: string): Promise<Record<MissionModel['status'], number>> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ status: string; count: number }>(
          `MATCH (m:Mission) WHERE m.starshipId = $starshipId 
           RETURN m.status as status, count(m) as count`,
          { starshipId }
        );

        // Initialize counts
        const counts: Record<MissionModel['status'], number> = {
          draft: 0,
          active: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        };

        // Fill in actual counts
        result.forEach((record) => {
          if (record.status in counts) {
            counts[record.status as MissionModel['status']] = Number(record.count);
          }
        });

        return counts;
      },
      'countMissionsByStatus',
      'Mission'
    );
  }
}
