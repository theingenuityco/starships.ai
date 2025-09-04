import { getConnection, Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { EdgeModel } from '@starships/protocol';

export class EdgeRepository extends BaseRepository {
  private connection: Neo4jConnection;

  constructor(connection?: Neo4jConnection) {
    super('EdgeRepository');
    this.connection = connection || getConnection();
  }

  async createEdge(blueprintId: string, edgeData: Omit<EdgeModel, 'id'>): Promise<EdgeModel> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ blueprintId }, ['blueprintId'], 'createEdge');
        this.validateRequired(edgeData, ['from', 'to'], 'createEdge');

        const connection = this.connection;

        // Check if blueprint exists
        const blueprintCheck = await connection.executeQuery<{ id: string }>('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', {
          blueprintId,
        });

        if (!blueprintCheck || blueprintCheck.length === 0) {
          this.handleNotFound('Blueprint', blueprintId, 'createEdge');
        }

        // Check if both nodes exist
        const nodesCheck = await connection.executeQuery<{ fromId: string; toId: string }>(
          `MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node {id: $fromId})
         MATCH (b)-[:CONTAINS]->(to:Node {id: $toId})
         RETURN from.id as fromId, to.id as toId`,
          { blueprintId, fromId: edgeData.from, toId: edgeData.to }
        );

        if (!nodesCheck || nodesCheck.length === 0) {
          this.handleValidationError(
            [
              {
                field: 'nodes',
                message: 'Both from and to nodes must exist in the blueprint',
                value: { from: edgeData.from, to: edgeData.to },
              },
            ],
            'createEdge'
          );
        }

        // Note: Edges are stored as Neo4j relationships, not as nodes with createEntityWithAutoId
        // We still need to generate an ID for the relationship properties
        const edge: EdgeModel = {
          id: '', // Will be set after creation
          ...edgeData,
        };

        // Create relationship between nodes with generated ID
        const result = await connection.executeWrite<{ edgeId: string }>(
          `
        MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node {id: $fromId})
        MATCH (b)-[:CONTAINS]->(to:Node {id: $toId})
        CREATE (from)-[:FLOWS_TO {id: randomUUID(), ref: $ref}]->(to)
        RETURN from.id as fromId, to.id as toId, randomUUID() as edgeId
      `,
          {
            blueprintId,
            fromId: edgeData.from,
            toId: edgeData.to,
            ref: edgeData.ref || null,
          }
        );

        // Get the actual edge ID from the created relationship
        const edgeResult = await connection.executeQuery<{ edgeId: string; ref: string }>(
          `
        MATCH (from:Node {id: $fromId})-[r:FLOWS_TO]->(to:Node {id: $toId})
        RETURN r.id as edgeId, r.ref as ref
        ORDER BY r.id DESC
        LIMIT 1
      `,
          {
            fromId: edgeData.from,
            toId: edgeData.to,
          }
        );

        edge.id = edgeResult[0]?.edgeId || '';
        edge.ref = edge.ref || edge.id;

        return edge;
      },
      'createEdge',
      'Edge'
    );
  }

  async createEdges(blueprintId: string, edgesData: Array<Omit<EdgeModel, 'id'>>, idMapping?: Map<string, string>): Promise<EdgeModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ blueprintId }, ['blueprintId'], 'createEdges');

        if (!Array.isArray(edgesData)) {
          this.handleValidationError(
            [
              {
                field: 'edgesData',
                message: 'Edges array is required',
                value: edgesData,
              },
            ],
            'createEdges'
          );
        }

        const connection = this.connection;

        // Check if blueprint exists
        const blueprintCheck = await connection.executeQuery<{ id: string }>('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', {
          blueprintId,
        });

        if (!blueprintCheck || blueprintCheck.length === 0) {
          this.handleNotFound('Blueprint', blueprintId, 'createEdges');
        }

        const edges: EdgeModel[] = [];

        for (const edgeData of edgesData) {
          // Convert edge node IDs using mapping if provided
          const fromNodeId = idMapping?.get(edgeData.from) || edgeData.from;
          const toNodeId = idMapping?.get(edgeData.to) || edgeData.to;

          // Verify nodes exist before creating edge
          const nodesCheck = await connection.executeQuery<{ fromId: string; toId: string }>(
            `MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node {id: $fromId})
           MATCH (b)-[:CONTAINS]->(to:Node {id: $toId})
           RETURN from.id as fromId, to.id as toId`,
            { blueprintId, fromId: fromNodeId, toId: toNodeId }
          );

          if (!nodesCheck || nodesCheck.length === 0) {
            console.warn(`Skipping edge creation: nodes not found`, {
              from: fromNodeId,
              to: toNodeId,
            });
            continue;
          }

          // Create relationship between nodes with auto-generated ID
          await connection.executeWrite(
            `
          MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node {id: $fromId})
          MATCH (b)-[:CONTAINS]->(to:Node {id: $toId})
          CREATE (from)-[:FLOWS_TO {id: randomUUID(), ref: $ref}]->(to)
        `,
            {
              blueprintId,
              fromId: fromNodeId,
              toId: toNodeId,
              ref: edgeData.ref || null,
            }
          );

          // Get the created edge ID
          const edgeResult = await connection.executeQuery<{ edgeId: string; ref: string }>(
            `
          MATCH (from:Node {id: $fromId})-[r:FLOWS_TO]->(to:Node {id: $toId})
          RETURN r.id as edgeId, r.ref as ref
          ORDER BY r.id DESC
          LIMIT 1
        `,
            {
              fromId: fromNodeId,
              toId: toNodeId,
            }
          );

          const edge: EdgeModel = {
            id: edgeResult[0]?.edgeId || '',
            from: fromNodeId,
            to: toNodeId,
            ref: edgeData.ref || edgeResult[0]?.ref || edgeResult[0]?.edgeId || '',
          };

          edges.push(edge);
        }

        return edges;
      },
      'createEdges',
      'Edge'
    );
  }

  async getEdgesByBlueprintId(blueprintId: string): Promise<EdgeModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ blueprintId }, ['blueprintId'], 'getEdgesByBlueprintId');

        const connection = this.connection;

        const result = await connection.executeQuery<{
          edgeId: string;
          fromId: string;
          toId: string;
          ref: string;
        }>(
          `MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node)
         MATCH (from)-[r:FLOWS_TO]->(to:Node)
         RETURN r.id as edgeId, from.id as fromId, to.id as toId, r.ref as ref`,
          { blueprintId }
        );

        return (
          result?.map((record) => ({
            id: record.edgeId,
            from: record.fromId,
            to: record.toId,
            ref: record.ref || record.edgeId,
          })) || []
        );
      },
      'getEdgesByBlueprintId',
      'Edge'
    );
  }

  async getEdgeById(edgeId: string): Promise<EdgeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ edgeId }, ['edgeId'], 'getEdgeById');

        const connection = this.connection;

        const result = await connection.executeQuery<{
          edgeId: string;
          fromId: string;
          toId: string;
          ref: string;
        }>(
          `MATCH (from:Node)-[r:FLOWS_TO {id: $edgeId}]->(to:Node)
         RETURN r.id as edgeId, from.id as fromId, to.id as toId, r.ref as ref`,
          { edgeId }
        );

        if (!result || result.length === 0) {
          return null;
        }

        return {
          id: result[0].edgeId,
          from: result[0].fromId,
          to: result[0].toId,
          ref: result[0].ref || result[0].edgeId,
        };
      },
      'getEdgeById',
      'Edge',
      edgeId
    );
  }

  async updateEdge(edgeId: string, updates: Partial<EdgeModel>): Promise<EdgeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ edgeId }, ['edgeId'], 'updateEdge');

        if (!updates || Object.keys(updates).length === 0) {
          this.handleValidationError(
            [
              {
                field: 'updates',
                message: 'At least one field must be provided for update',
              },
            ],
            'updateEdge'
          );
        }

        // Check if edge exists first
        const currentEdge = await this.getEdgeById(edgeId);
        if (!currentEdge) {
          this.handleNotFound('Edge', edgeId, 'updateEdge');
        }

        // For edges, we typically only update by recreating the relationship
        // since we can't easily update the from/to relationships in Neo4j
        if (updates.from !== undefined || updates.to !== undefined) {
          const connection = this.connection;

          // Delete old relationship
          await connection.executeWrite('MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() DELETE r', {
            edgeId,
          });

          // Create new relationship with updated values
          const newFromId = updates.from !== undefined ? updates.from : currentEdge!.from;
          const newToId = updates.to !== undefined ? updates.to : currentEdge!.to;
          const newRef = updates.ref !== undefined ? updates.ref : currentEdge!.ref;

          await connection.executeWrite(
            `
          MATCH (from:Node {id: $fromId})
          MATCH (to:Node {id: $toId})
          CREATE (from)-[:FLOWS_TO {id: $edgeId, ref: $ref}]->(to)
        `,
            {
              fromId: newFromId,
              toId: newToId,
              edgeId,
              ref: newRef,
            }
          );

          return {
            id: edgeId,
            from: newFromId,
            to: newToId,
            ref: newRef,
          };
        }

        // If only ref is being updated
        if (updates.ref !== undefined) {
          const connection = this.connection;

          await connection.executeWrite('MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() SET r.ref = $ref', { edgeId, ref: updates.ref });
        }

        // Return updated edge
        return this.getEdgeById(edgeId);
      },
      'updateEdge',
      'Edge',
      edgeId
    );
  }

  async deleteEdge(edgeId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ edgeId }, ['edgeId'], 'deleteEdge');

        const connection = this.connection;

        // Check if edge exists
        const existingResult = await connection.executeQuery<{ edgeId: string }>(
          'MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() RETURN r.id as edgeId',
          { edgeId }
        );

        if (!existingResult || existingResult.length === 0) {
          this.handleNotFound('Edge', edgeId, 'deleteEdge');
        }

        // Delete the edge relationship
        await connection.executeWrite('MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() DELETE r', {
          edgeId,
        });

        return true;
      },
      'deleteEdge',
      'Edge',
      edgeId
    );
  }

  async deleteEdgesByBlueprintId(blueprintId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ blueprintId }, ['blueprintId'], 'deleteEdgesByBlueprintId');

        const connection = this.connection;

        // Check if blueprint exists
        const blueprintCheck = await connection.executeQuery<{ id: string }>('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', {
          blueprintId,
        });

        if (!blueprintCheck || blueprintCheck.length === 0) {
          this.handleNotFound('Blueprint', blueprintId, 'deleteEdgesByBlueprintId');
        }

        // Delete all edges belonging to the blueprint's nodes
        await connection.executeWrite(
          `
        MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node)
        MATCH (from)-[r:FLOWS_TO]->()
        DELETE r
      `,
          { blueprintId }
        );
      },
      'deleteEdgesByBlueprintId',
      'Edge'
    );
  }

  async getEdgesByFromNode(fromNodeId: string): Promise<EdgeModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ fromNodeId }, ['fromNodeId'], 'getEdgesByFromNode');

        const connection = this.connection;

        const result = await connection.executeQuery<{
          edgeId: string;
          fromId: string;
          toId: string;
          ref: string;
        }>(
          `MATCH (from:Node {id: $fromNodeId})-[r:FLOWS_TO]->(to:Node)
         RETURN r.id as edgeId, from.id as fromId, to.id as toId, r.ref as ref`,
          { fromNodeId }
        );

        return (
          result?.map((record) => ({
            id: record.edgeId,
            from: record.fromId,
            to: record.toId,
            ref: record.ref || record.edgeId,
          })) || []
        );
      },
      'getEdgesByFromNode',
      'Edge'
    );
  }

  async getEdgesByToNode(toNodeId: string): Promise<EdgeModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        this.validateRequired({ toNodeId }, ['toNodeId'], 'getEdgesByToNode');

        const connection = this.connection;

        const result = await connection.executeQuery<{
          edgeId: string;
          fromId: string;
          toId: string;
          ref: string;
        }>(
          `MATCH (from:Node)-[r:FLOWS_TO]->(to:Node {id: $toNodeId})
         RETURN r.id as edgeId, from.id as fromId, to.id as toId, r.ref as ref`,
          { toNodeId }
        );

        return (
          result?.map((record) => ({
            id: record.edgeId,
            from: record.fromId,
            to: record.toId,
            ref: record.ref || record.edgeId,
          })) || []
        );
      },
      'getEdgesByToNode',
      'Edge'
    );
  }
}
