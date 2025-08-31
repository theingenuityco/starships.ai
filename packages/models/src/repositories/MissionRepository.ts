import { getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import {
  Mission,
  MissionStatus,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  MissionListResponse
} from '@starships/protocol';

export class MissionRepository extends BaseRepository {
  constructor() {
    super('MissionRepository');
  }

  private validateMissionStatus(status: string): void {
    const validStatuses: MissionStatus[] = ['draft', 'active', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status as MissionStatus)) {
      this.handleValidationError([{
        field: 'status',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
        value: status
      }], 'validateStatus');
    }
  }

  async createMission(request: CreateMissionRequest, userId: string): Promise<Mission> {
    return this.executeWithErrorHandling(async () => {
      // Validate required fields
      this.validateRequired(request, ['starshipId', 'name', 'description', 'agentIds'], 'create');
      this.validateRequired({ userId }, ['userId'], 'create');

      // Validate field types
      this.validateTypes(request, {
        starshipId: 'string',
        name: 'string',
        description: 'string',
        agentIds: 'object'
      }, 'create');

      // Validate string lengths
      this.validateStringLengths(request, {
        name: { min: 1, max: 200 },
        description: { min: 1, max: 1000 }
      }, 'create');

      // Validate agentIds array
      if (!Array.isArray(request.agentIds)) {
        this.handleValidationError([{
          field: 'agentIds',
          message: 'agentIds must be an array',
          value: request.agentIds
        }], 'create');
      }

      if (request.agentIds.length === 0) {
        this.handleValidationError([{
          field: 'agentIds',
          message: 'At least one agent must be assigned to the mission',
          value: request.agentIds
        }], 'create');
      }

      const connection = getConnection();
      const id = uuidv4();
      const now = new Date().toISOString();

      // Check if starship exists
      const starshipCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (s:Starship {id: $starshipId}) RETURN s.id as id',
        { starshipId: request.starshipId }
      );

      if (!starshipCheck || starshipCheck.length === 0) {
        this.handleNotFound('Starship', request.starshipId, 'create');
      }

      // Create the mission
      const missionData = {
        id,
        starshipId: request.starshipId,
        name: request.name,
        description: request.description,
        status: 'draft',
        phase: 'welcome',
        agentIds: request.agentIds,
        approvalStatus: 'pending',
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      };

      await connection.executeWrite(
        'CREATE (m:Mission $props) RETURN m',
        { props: missionData }
      );

      return missionData as Mission;
    }, 'create', 'Mission');
  }

  async getMissionById(id: string): Promise<Mission> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'findById');

      const connection = getConnection();
      const result = await connection.executeQuery<{ m: Mission }>(
        'MATCH (m:Mission {id: $id}) RETURN m',
        { id }
      );

      if (!result || result.length === 0) {
        this.handleNotFound('Mission', id, 'findById');
      }

      const mission = result[0].m;
      return this.parseMissionFromRecord(mission);
    }, 'findById', 'Mission', id);
  }

  async getMissionsByStarshipId(
    starshipId: string,
    filters?: MissionFilters,
    sort?: MissionSort
  ): Promise<MissionListResponse> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ starshipId }, ['starshipId'], 'findByStarshipId');

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

      const result = await connection.executeQuery<{ m: Mission }>(query, params);

      const missions: Mission[] = result?.map(record => this.parseMissionFromRecord(record.m)) || [];

      return {
        missions,
        total: missions.length
      };
    }, 'findByStarshipId', 'Mission');
  }

  async getAllMissions(filters?: MissionFilters, sort?: MissionSort): Promise<MissionListResponse> {
    return this.executeWithErrorHandling(async () => {
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

      const result = await connection.executeQuery<{ m: Mission }>(query, params);

      const missions: Mission[] = result?.map(record => this.parseMissionFromRecord(record.m)) || [];

      return {
        missions,
        total: missions.length
      };
    }, 'findAll', 'Mission');
  }

  async updateMission(id: string, updates: UpdateMissionRequest): Promise<Mission> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'update');

      if (!updates || Object.keys(updates).length === 0) {
        this.handleValidationError([{
          field: 'updates',
          message: 'At least one field must be provided for update'
        }], 'update');
      }

      // Validate status if provided
      if (updates.status) {
        this.validateMissionStatus(updates.status);
      }

      // Validate string lengths if provided
      if (updates.name !== undefined || updates.description !== undefined) {
        this.validateStringLengths(updates, {
          ...(updates.name !== undefined && { name: { min: 1, max: 200 } }),
          ...(updates.description !== undefined && { description: { min: 1, max: 1000 } })
        }, 'update');
      }

      const connection = getConnection();
      
      // Check if mission exists
      const existingResult = await connection.executeQuery<{ m: Mission }>(
        'MATCH (m:Mission {id: $id}) RETURN m',
        { id }
      );

      if (!existingResult || existingResult.length === 0) {
        this.handleNotFound('Mission', id, 'update');
      }

      // Build SET clause dynamically
      const setClause: string[] = ['m.updatedAt = $updatedAt'];
      const params: any = { 
        id,
        updatedAt: new Date().toISOString()
      };

      if (updates.name !== undefined) {
        setClause.push('m.name = $name');
        params.name = updates.name;
      }

      if (updates.description !== undefined) {
        setClause.push('m.description = $description');
        params.description = updates.description;
      }

      if (updates.status !== undefined) {
        setClause.push('m.status = $status');
        params.status = updates.status;
      }

      if (updates.phase !== undefined) {
        setClause.push('m.phase = $phase');
        params.phase = updates.phase;
      }

      if (updates.agentIds !== undefined) {
        // Validate agentIds array if provided
        if (!Array.isArray(updates.agentIds)) {
          this.handleValidationError([{
            field: 'agentIds',
            message: 'agentIds must be an array',
            value: updates.agentIds
          }], 'update');
        }
        
        setClause.push('m.agentIds = $agentIds');
        params.agentIds = updates.agentIds;
      }

      if (updates.approvalStatus !== undefined) {
        setClause.push('m.approvalStatus = $approvalStatus');
        params.approvalStatus = updates.approvalStatus;
      }

      const query = `
        MATCH (m:Mission {id: $id})
        SET ${setClause.join(', ')}
        RETURN m
      `;

      const result = await connection.executeWrite<{ m: Mission }>(query, params);

      if (!result || result.length === 0) {
        throw new Error('Failed to update mission');
      }

      return this.parseMissionFromRecord(result[0].m);
    }, 'update', 'Mission', id);
  }

  async deleteMission(id: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'delete');

      const connection = getConnection();
      
      // Check if mission exists
      const existingResult = await connection.executeQuery<{ m: Mission }>(
        'MATCH (m:Mission {id: $id}) RETURN m',
        { id }
      );

      if (!existingResult || existingResult.length === 0) {
        this.handleNotFound('Mission', id, 'delete');
      }

      // Delete the mission
      await connection.executeWrite(
        'MATCH (m:Mission {id: $id}) DELETE m',
        { id }
      );
    }, 'delete', 'Mission', id);
  }

  /**
   * Parse mission from Neo4j record, handling JSON fields
   */
  private parseMissionFromRecord(record: any): Mission {
    return {
      id: record.id,
      starshipId: record.starshipId,
      name: record.name,
      description: record.description,
      status: record.status,
      phase: record.phase,
      agentIds: record.agentIds || [],
      approvalStatus: record.approvalStatus || 'pending',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdBy: record.createdBy
    };
  }
}