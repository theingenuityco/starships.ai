import { BaseRepository } from './BaseRepository';
import { getConnection } from '../connection';
import { Expedition, ExpeditionRepository as ExpeditionRepositoryInterface, Agent } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../utils/neo4j-helpers';

/**
 * Neo4j-based expedition repository
 */
export class ExpeditionRepository extends BaseRepository implements ExpeditionRepositoryInterface {
  constructor() {
    super('expedition');
  }

  async findAll(): Promise<Expedition[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ e: Expedition }>(
          'MATCH (e:Expedition) RETURN e ORDER BY e.createdAt DESC'
        );
        return convertNeo4jIntsInArray(result.map((record) => record.e));
      },
      'findAll',
      'Expedition'
    );
  }

  async findById(id: string): Promise<Expedition | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ e: Expedition }>(
          'MATCH (e:Expedition) WHERE e.id = $id RETURN e',
          { id }
        );
        const expedition = result[0]?.e || null;
        return expedition ? convertNeo4jIntsInObject(expedition) : null;
      },
      'findById',
      'Expedition',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<Expedition[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ e: Expedition }>(
          'MATCH (e:Expedition) WHERE e.starshipId = $starshipId RETURN e ORDER BY e.createdAt DESC',
          { starshipId }
        );
        return convertNeo4jIntsInArray(result.map((record) => record.e));
      },
      'findByStarship',
      'Expedition'
    );
  }

  async create(
    entity: Omit<Expedition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Expedition> {
    // Validation
    this.validateRequired(entity, ['name', 'starshipId']);
    this.validateStringLengths(entity, {
      name: { min: 3, max: 50 },
      description: { max: 500 }
    });
    this.validateEnums(entity, {
      status: ['active', 'inactive', 'completed']
    });

    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const now = new Date().toISOString();
        const expedition: Expedition = {
          ...entity,
          id: uuidv4(),
          status: entity.status || 'active',
          createdAt: now,
          updatedAt: now,
        };

        await connection.executeWrite(
          'CREATE (e:Expedition $props) RETURN e',
          { props: expedition }
        );

        // Create relationship to starship
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (e:Expedition {id: $expeditionId})
           CREATE (e)-[:BELONGS_TO]->(s)`,
          {
            starshipId: expedition.starshipId,
            expeditionId: expedition.id
          }
        );

        return convertNeo4jIntsInObject(expedition);
      },
      'create',
      'Expedition'
    );
  }

  async update(id: string, updates: Partial<Expedition>): Promise<Expedition | null> {
    // Validation for updates
    if (updates.name !== undefined) {
      this.validateStringLengths({ name: updates.name }, {
        name: { min: 3, max: 50 }
      });
    }
    if (updates.description !== undefined) {
      this.validateStringLengths({ description: updates.description }, {
        description: { max: 500 }
      });
    }
    if (updates.status !== undefined) {
      this.validateEnums({ status: updates.status }, {
        status: ['active', 'inactive', 'completed']
      });
    }

    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Remove fields that shouldn't be updated
        delete updateProps.id;
        delete updateProps.createdAt;
        delete updateProps.starshipId; // Don't allow changing starship

        const result = await connection.executeWrite<{ e: Expedition }>(
          'MATCH (e:Expedition) WHERE e.id = $id SET e += $updates RETURN e',
          { id, updates: updateProps }
        );

        const expedition = result[0]?.e || null;
        return expedition ? convertNeo4jIntsInObject(expedition) : null;
      },
      'update',
      'Expedition',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (e:Expedition) WHERE e.id = $id DETACH DELETE e RETURN count(e) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Expedition',
      id
    );
  }

  async assignAgents(expeditionId: string, agentIds: string[]): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        
        // First, remove all existing agent assignments
        await connection.executeWrite(
          'MATCH (a:Agent)-[r:ASSIGNED_TO]->(e:Expedition {id: $expeditionId}) DELETE r',
          { expeditionId }
        );

        // Then, create new assignments
        if (agentIds.length > 0) {
          await connection.executeWrite(
            `MATCH (e:Expedition {id: $expeditionId})
             MATCH (a:Agent) WHERE a.id IN $agentIds
             CREATE (a)-[:ASSIGNED_TO {assignedAt: $timestamp}]->(e)`,
            {
              expeditionId,
              agentIds,
              timestamp: new Date().toISOString()
            }
          );
        }
      },
      'assignAgents',
      'Expedition',
      expeditionId
    );
  }

  async getAssignedAgents(expeditionId: string): Promise<Agent[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const result = await connection.executeQuery<{ a: Agent }>(
          `MATCH (a:Agent)-[:ASSIGNED_TO]->(e:Expedition {id: $expeditionId})
           RETURN a ORDER BY a.name`,
          { expeditionId }
        );
        return convertNeo4jIntsInArray(result.map((record) => record.a));
      },
      'getAssignedAgents',
      'Expedition',
      expeditionId
    );
  }
}