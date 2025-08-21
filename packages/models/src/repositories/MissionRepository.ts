import { getConnection } from '../connection';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInArray, convertNeo4jIntsInObject } from '../utils/neo4j-helpers';
import {
  Mission,
  MissionStatus,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  MissionListResponse,
  MissionMessage,
  MissionMessageRole
} from '@starships/protocol';

export interface MissionRepositoryInterface {
  createMission(request: CreateMissionRequest, userId: string): Promise<Mission>;
  getMissionById(id: string): Promise<Mission>;
  getMissionsByStarshipId(starshipId: string, filters?: MissionFilters, sort?: MissionSort): Promise<MissionListResponse>;
  getAllMissions(filters?: MissionFilters, sort?: MissionSort): Promise<MissionListResponse>;
  updateMission(id: string, updates: UpdateMissionRequest): Promise<Mission>;
  deleteMission(id: string): Promise<void>;
  
  // Message methods for Mission Orchestrator
  saveMessage(message: Omit<MissionMessage, 'id'>): Promise<MissionMessage>;
  getMessagesByMission(missionId: string, limit?: number, offset?: number): Promise<MissionMessage[]>;
  getMessageCount(missionId: string): Promise<number>;
  getMessagesByMissionWithPagination(missionId: string, page?: number, pageSize?: number): Promise<{
    messages: MissionMessage[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>;
}

export class MissionRepository extends BaseRepository implements MissionRepositoryInterface {
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
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        executionState: undefined
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

      if (updates.executionState !== undefined) {
        setClause.push('m.executionState = $executionState');
        params.executionState = updates.executionState ? JSON.stringify(updates.executionState) : null;
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

  // ============================================================================
  // MESSAGE METHODS FOR MISSION ORCHESTRATOR
  // ============================================================================

  async saveMessage(message: Omit<MissionMessage, 'id'>): Promise<MissionMessage> {
    return this.executeWithErrorHandling(async () => {
      // Validate required fields
      this.validateRequired(message, ['missionId', 'role', 'content', 'timestamp'], 'saveMessage');

      // Validate field types
      this.validateTypes(message, {
        missionId: 'string',
        role: 'string',
        content: 'string',
        timestamp: 'string'
      }, 'saveMessage');

      // Validate role
      const validRoles: MissionMessageRole[] = ['user', 'orchestrator', 'system'];
      if (!validRoles.includes(message.role as MissionMessageRole)) {
        this.handleValidationError([{
          field: 'role',
          message: `Role must be one of: ${validRoles.join(', ')}`,
          value: message.role
        }], 'saveMessage');
      }

      // Validate string lengths
      this.validateStringLengths(message, {
        content: { min: 1, max: 10000 }, // Allow up to 10k characters
        ...(message.senderName && { senderName: { min: 1, max: 200 } })
      }, 'saveMessage');

      const connection = getConnection();
      const id = uuidv4();

      // Check if mission exists
      const missionCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (m:Mission {id: $missionId}) RETURN m.id as id',
        { missionId: message.missionId }
      );

      if (!missionCheck || missionCheck.length === 0) {
        this.handleNotFound('Mission', message.missionId, 'saveMessage');
      }

      // Prepare message data
      const messageData: MissionMessage = {
        ...message,
        id
      };

      // Create the message node and relationships
      let query: string;
      let params: any;

      if (message.role === 'user' && message.userId) {
        // Create message with user relationship
        query = `
          MATCH (m:Mission {id: $missionId})
          MATCH (u:User {id: $userId})
          CREATE (msg:MissionMessage $messageProps)
          CREATE (u)-[:SENT]->(msg)
          CREATE (msg)-[:BELONGS_TO]->(m)
          RETURN msg
        `;
        params = {
          missionId: message.missionId,
          userId: message.userId,
          messageProps: messageData
        };
      } else {
        // Create message without user relationship (orchestrator/system)
        query = `
          MATCH (m:Mission {id: $missionId})
          CREATE (msg:MissionMessage $messageProps)
          CREATE (msg)-[:BELONGS_TO]->(m)
          RETURN msg
        `;
        params = {
          missionId: message.missionId,
          messageProps: messageData
        };
      }

      const result = await connection.executeWrite<{ msg: MissionMessage }>(query, params);

      if (!result || result.length === 0) {
        throw new Error('Failed to save message');
      }

      return convertNeo4jIntsInObject(result[0].msg);
    }, 'saveMessage', 'MissionMessage');
  }

  async getMessagesByMission(missionId: string, limit?: number, offset?: number): Promise<MissionMessage[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'getMessagesByMission');

      const connection = getConnection();

      // Build query with optional LIMIT and SKIP
      let query = `
        MATCH (msg:MissionMessage)-[:BELONGS_TO]->(m:Mission {id: $missionId})
        RETURN msg
        ORDER BY msg.timestamp ASC
      `;

      const params: any = { missionId };

      if (limit !== undefined && limit > 0) {
        if (offset !== undefined && offset > 0) {
          query += ` SKIP $offset`;
          params.offset = int(Math.floor(offset));
        }
        query += ` LIMIT $limit`;
        params.limit = int(Math.floor(limit));
      }

      const result = await connection.executeQuery<{ msg: MissionMessage }>(query, params);

      return convertNeo4jIntsInArray(result?.map(record => record.msg) || []);
    }, 'getMessagesByMission', 'MissionMessage');
  }

  async getMessageCount(missionId: string): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'getMessageCount');

      const connection = getConnection();

      const result = await connection.executeQuery<{ count: number }>(
        `MATCH (msg:MissionMessage)-[:BELONGS_TO]->(m:Mission {id: $missionId})
         RETURN count(msg) as count`,
        { missionId }
      );

      const count = result?.[0]?.count || 0;
      // Convert Neo4j integer to regular number
      return convertNeo4jIntsInObject({ count }).count;
    }, 'getMessageCount', 'MissionMessage');
  }

  async getMessagesByMissionWithPagination(
    missionId: string, 
    page: number = 1, 
    pageSize: number = 50
  ): Promise<{
    messages: MissionMessage[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'getMessagesByMissionWithPagination');

      // Validate pagination parameters
      if (page < 1) {
        this.handleValidationError([{
          field: 'page',
          message: 'Page must be >= 1',
          value: page
        }], 'getMessagesByMissionWithPagination');
      }

      if (pageSize < 1 || pageSize > 200) {
        this.handleValidationError([{
          field: 'pageSize',
          message: 'Page size must be between 1 and 200',
          value: pageSize
        }], 'getMessagesByMissionWithPagination');
      }

      // Calculate offset as regular number
      const offset = (page - 1) * pageSize;

      // Get total count and messages in parallel
      const [total, messages] = await Promise.all([
        this.getMessageCount(missionId),
        this.getMessagesByMission(missionId, pageSize, offset)
      ]);

      const totalPages = Math.ceil(total / pageSize);

      return {
        messages,
        total,
        page,
        pageSize,
        totalPages
      };
    }, 'getMessagesByMissionWithPagination', 'MissionMessage');
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
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      createdBy: record.createdBy,
      executionState: record.executionState ? JSON.parse(record.executionState) : undefined
    };
  }
}