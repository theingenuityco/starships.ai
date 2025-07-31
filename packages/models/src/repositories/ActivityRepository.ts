import { BaseRepository } from './BaseRepository';
import { getConnection } from '../connection';
import { v4 as uuidv4 } from 'uuid';
import { convertNeo4jIntsInObject } from '../utils/neo4j-helpers';
import type { Activity } from '@starships/protocol';

export class ActivityRepository extends BaseRepository {
  constructor() {
    super('activity');
  }
  async create(data: Omit<Activity, 'id'>): Promise<Activity> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const activityId = uuidv4();
    
    const activityData = {
      id: activityId,
      expeditionId: data.expeditionId,
      type: data.type,
      description: data.description,
      timestamp: data.timestamp || new Date().toISOString(),
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      agentId: data.agentId || null,
      status: data.status || 'completed'
    };

    await connection.executeWrite(
      `MATCH (e:Expedition {id: $expeditionId})
       CREATE (a:Activity {
         id: $id,
         type: $type,
         description: $description,
         timestamp: $timestamp,
         metadata: $metadata,
         agentId: $agentId,
         status: $status
       })
       CREATE (a)-[:BELONGS_TO]->(e)`,
      activityData
    );

        const result = convertNeo4jIntsInObject({
          ...activityData,
          metadata: data.metadata || undefined
        });
        
        return result as Activity;
      },
      'create activity'
    );
  }

  async findByExpeditionId(expeditionId: string, options?: { limit?: number }): Promise<Activity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const limit = options?.limit ? Math.floor(options.limit) : 100;
        
        const result = await connection.executeQuery<{ a: any }>(
          `MATCH (a:Activity)-[:BELONGS_TO]->(e:Expedition {id: $expeditionId})
           RETURN a
           ORDER BY a.timestamp DESC
           LIMIT toInteger($limit)`,
          { expeditionId, limit }
        );

        return result.map((record: any) => {
          const activity = convertNeo4jIntsInObject(record.a);
          return {
            ...activity,
            metadata: activity.metadata ? JSON.parse(activity.metadata) : undefined
          };
        });
      },
      'find activities by expedition'
    );
  }

  async findById(id: string): Promise<Activity | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        
        const result = await connection.executeQuery<{ a: any }>(
          `MATCH (a:Activity {id: $id})
           RETURN a`,
          { id }
        );

        if (result.length === 0) {
          return null;
        }

        const activity = convertNeo4jIntsInObject(result[0].a);
        return {
          ...activity,
          metadata: activity.metadata ? JSON.parse(activity.metadata) : undefined
        };
      },
      'find activity by id'
    );
  }

  async updateStatus(id: string, status: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        
        await connection.executeWrite(
          `MATCH (a:Activity {id: $id})
           SET a.status = $status`,
          { id, status }
        );
      },
      'update activity status'
    );
  }

  async deleteByExpeditionId(expeditionId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        
        await connection.executeWrite(
          `MATCH (a:Activity)-[:BELONGS_TO]->(e:Expedition {id: $expeditionId})
           DETACH DELETE a`,
          { expeditionId }
        );
      },
      'delete activities by expedition'
    );
  }
}