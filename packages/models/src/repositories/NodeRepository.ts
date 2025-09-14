import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { NodeModel } from '@starships/protocol';

export class NodeRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('NodeRepository', connection);
  }

  async createNode(blueprintId: string, nodeData: Omit<NodeModel, 'id'>): Promise<NodeModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!blueprintId) {
          this.handleValidationError([{ field: 'blueprintId', message: 'blueprintId is required' }]);
        }
        if (!nodeData?.type || !nodeData?.name) {
          this.handleValidationError([{ field: 'nodeData', message: 'type and name are required' }]);
        }

        const connection = this.getConnection();

        // Check if blueprint exists
        const blueprintCheck = await connection.executeQuery<{ id: string }>('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', {
          blueprintId,
        });

        if (!blueprintCheck || blueprintCheck.length === 0) {
          this.handleNotFound('Blueprint', blueprintId);
        }

        // Prepare node data with serialized parameters
        const nodeProps = {
          ...nodeData,
          parameters: JSON.stringify(nodeData.parameters || {}),
        };

        const node = await this.createEntityWithAutoId<NodeModel>('Node', nodeProps);

        // Create relationship with blueprint
        await connection.executeWrite(
          `
        MATCH (b:Blueprint {id: $blueprintId}), (n:Node {id: $nodeId})
        CREATE (b)-[:CONTAINS]->(n)
      `,
          {
            blueprintId,
            nodeId: node.id,
          }
        );

        return {
          ...node,
          parameters: nodeData.parameters || {},
        };
      },
      'createNode',
      'Node'
    );
  }

  async createNodes(
    blueprintId: string,
    nodesData: Array<Omit<NodeModel, 'id'> & { aiId?: string }>
  ): Promise<{ nodes: NodeModel[]; idMapping: Map<string, string> }> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!blueprintId) {
          this.handleValidationError([{ field: 'blueprintId', message: 'blueprintId is required' }]);
        }

        if (!Array.isArray(nodesData) || nodesData.length === 0) {
          this.handleValidationError([
            {
              field: 'nodesData',
              message: 'At least one node is required',
              value: nodesData,
            },
          ]);
        }

        const connection = this.getConnection();

        // Check if blueprint exists
        const blueprintCheck = await connection.executeQuery<{ id: string }>('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', {
          blueprintId,
        });

        if (!blueprintCheck || blueprintCheck.length === 0) {
          this.handleNotFound('Blueprint', blueprintId);
        }

        const nodes: NodeModel[] = [];
        const idMapping = new Map<string, string>();

        for (const nodeData of nodesData) {
          const { aiId, ...nodeWithoutAiId } = nodeData as Omit<NodeModel, 'id'> & { aiId?: string };

          // Prepare node data with serialized parameters
          const nodeProps = {
            ...nodeWithoutAiId,
            parameters: JSON.stringify(nodeWithoutAiId.parameters || {}),
            ref: nodeWithoutAiId.ref || null,
          };

          const node = await this.createEntityWithAutoId<NodeModel>('Node', nodeProps);

          // Set ref to node ID if not provided
          if (!node.ref) {
            node.ref = node.id;
            await connection.executeWrite('MATCH (n:Node {id: $nodeId}) SET n.ref = $ref', {
              nodeId: node.id,
              ref: node.id,
            });
          }

          // Create relationship with blueprint
          await connection.executeWrite(
            `
          MATCH (b:Blueprint {id: $blueprintId}), (n:Node {id: $nodeId})
          CREATE (b)-[:CONTAINS]->(n)
        `,
            {
              blueprintId,
              nodeId: node.id,
            }
          );

          // Map AI-provided ID to real UUID for edge creation
          if (aiId) {
            idMapping.set(aiId, node.id);
          }

          nodes.push({
            ...node,
            parameters: nodeWithoutAiId.parameters || {},
          });
        }

        return { nodes, idMapping };
      },
      'createNodes',
      'Node'
    );
  }

  async getNodesByBlueprintId(blueprintId: string): Promise<NodeModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!blueprintId) {
          this.handleValidationError([{ field: 'blueprintId', message: 'blueprintId is required' }]);
        }

        const connection = this.getConnection();

        const result = await connection.executeQuery<{ n: NodeModel }>(
          `MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(n:Node)
         RETURN n`,
          { blueprintId }
        );

        return (
          result?.map((record) => {
            const nodeProps = record.n;
            // Deserialize parameters from JSON string
            if (nodeProps.parameters && typeof nodeProps.parameters === 'string') {
              try {
                nodeProps.parameters = JSON.parse(nodeProps.parameters);
              } catch (error) {
                console.warn('Failed to parse node parameters JSON:', nodeProps.id, error);
                nodeProps.parameters = {};
              }
            } else if (nodeProps.parameters === null || nodeProps.parameters === undefined) {
              nodeProps.parameters = {};
            }
            return nodeProps;
          }) || []
        );
      },
      'getNodesByBlueprintId',
      'Node'
    );
  }

  async getNodeById(nodeId: string): Promise<NodeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!nodeId) {
          this.handleValidationError([{ field: 'nodeId', message: 'nodeId is required' }]);
        }

        const connection = this.getConnection();

        const result = await connection.executeQuery<{ n: NodeModel }>('MATCH (n:Node {id: $nodeId}) RETURN n', { nodeId });

        if (!result || result.length === 0) {
          return null;
        }

        const nodeProps = result[0].n;
        // Deserialize parameters from JSON string
        if (nodeProps.parameters && typeof nodeProps.parameters === 'string') {
          try {
            nodeProps.parameters = JSON.parse(nodeProps.parameters);
          } catch (error) {
            console.warn('Failed to parse node parameters JSON:', nodeProps.id, error);
            nodeProps.parameters = {};
          }
        } else if (nodeProps.parameters === null || nodeProps.parameters === undefined) {
          nodeProps.parameters = {};
        }

        return nodeProps;
      },
      'getNodeById',
      'Node',
      nodeId
    );
  }

  async updateNode(nodeId: string, updates: Partial<NodeModel>): Promise<NodeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!nodeId) {
          this.handleValidationError([{ field: 'nodeId', message: 'nodeId is required' }]);
        }

        if (!updates || Object.keys(updates).length === 0) {
          this.handleValidationError([
            {
              field: 'updates',
              message: 'At least one field must be provided for update',
            },
          ]);
        }

        const connection = this.getConnection();

        // Check if node exists
        const existingResult = await connection.executeQuery<{ n: NodeModel }>('MATCH (n:Node {id: $nodeId}) RETURN n', { nodeId });

        if (!existingResult || existingResult.length === 0) {
          this.handleNotFound('Node', nodeId);
        }

        // Build SET clause dynamically
        const setClause: string[] = [];
        const params: Record<string, unknown> = { nodeId };

        if (updates.name !== undefined) {
          setClause.push('n.name = $name');
          params.name = updates.name;
        }

        if (updates.type !== undefined) {
          setClause.push('n.type = $type');
          params.type = updates.type;
        }

        if (updates.parameters !== undefined) {
          setClause.push('n.parameters = $parameters');
          params.parameters = JSON.stringify(updates.parameters || {});
        } else if (updates.parameters === undefined) {
          // When parameters is explicitly undefined, we still want to set it to an empty object
          setClause.push('n.parameters = $parameters');
          params.parameters = '{}';
        }

        if (updates.description !== undefined) {
          setClause.push('n.description = $description');
          params.description = updates.description;
        }

        if (updates.ref !== undefined) {
          setClause.push('n.ref = $ref');
          params.ref = updates.ref;
        }

        if (setClause.length === 0) {
          return this.getNodeById(nodeId);
        }

        const query = `
        MATCH (n:Node {id: $nodeId})
        SET ${setClause.join(', ')}
        RETURN n
      `;

        const result = await connection.executeWrite<{ n: NodeModel }>(query, params);

        if (!result || result.length === 0) {
          throw new Error('Failed to update node');
        }

        const nodeProps = result[0].n;
        // Deserialize parameters from JSON string
        if (nodeProps.parameters && typeof nodeProps.parameters === 'string') {
          try {
            nodeProps.parameters = JSON.parse(nodeProps.parameters);
          } catch (error) {
            console.warn('Failed to parse node parameters JSON:', nodeProps.id, error);
            nodeProps.parameters = {};
          }
        } else if (nodeProps.parameters === null || nodeProps.parameters === undefined) {
          nodeProps.parameters = {};
        }

        return nodeProps;
      },
      'updateNode',
      'Node',
      nodeId
    );
  }

  async deleteNode(nodeId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!nodeId) {
          this.handleValidationError([{ field: 'nodeId', message: 'nodeId is required' }]);
        }

        const connection = this.getConnection();

        // Check if node exists
        const existingResult = await connection.executeQuery<{ n: NodeModel }>('MATCH (n:Node {id: $nodeId}) RETURN n', { nodeId });

        if (!existingResult || existingResult.length === 0) {
          this.handleNotFound('Node', nodeId);
        }

        // Delete the node and all its relationships
        await connection.executeWrite('MATCH (n:Node {id: $nodeId}) DETACH DELETE n', { nodeId });

        return true;
      },
      'deleteNode',
      'Node',
      nodeId
    );
  }

  async deleteNodesByBlueprintId(blueprintId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!blueprintId) {
          this.handleValidationError([{ field: 'blueprintId', message: 'blueprintId is required' }]);
        }

        const connection = this.getConnection();

        // Check if blueprint exists
        const blueprintCheck = await connection.executeQuery<{ id: string }>('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', {
          blueprintId,
        });

        if (!blueprintCheck || blueprintCheck.length === 0) {
          this.handleNotFound('Blueprint', blueprintId);
        }

        // Delete all nodes belonging to the blueprint
        await connection.executeWrite(
          `
        MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(n:Node)
        DETACH DELETE n
      `,
          { blueprintId }
        );
      },
      'deleteNodesByBlueprintId',
      'Node'
    );
  }
}
