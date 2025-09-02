import { getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import type { NodeModel } from '@starships/protocol';

export class NodeRepository extends BaseRepository {
  constructor() {
    super('NodeRepository');
  }

  async createNode(blueprintId: string, nodeData: Omit<NodeModel, 'id'>): Promise<NodeModel> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ blueprintId }, ['blueprintId'], 'createNode');
      this.validateRequired(nodeData, ['type', 'name'], 'createNode');

      const connection = getConnection();
      const nodeId = uuidv4();

      // Check if blueprint exists
      const blueprintCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id',
        { blueprintId }
      );

      if (!blueprintCheck || blueprintCheck.length === 0) {
        this.handleNotFound('Blueprint', blueprintId, 'createNode');
      }

      const node: NodeModel = {
        id: nodeId,
        ...nodeData,
        parameters: nodeData.parameters || {},
        ref: nodeData.ref || nodeId
      };

      // Serialize parameters as JSON string for Neo4j storage
      const nodeProps = {
        ...node,
        parameters: JSON.stringify(node.parameters),
        ref: node.ref
      };

      await connection.executeWrite(`
        MATCH (b:Blueprint {id: $blueprintId})
        CREATE (b)-[:CONTAINS]->(n:Node $nodeProps)
      `, {
        blueprintId,
        nodeProps
      });

      return node;
    }, 'createNode', 'Node');
  }

  async createNodes(blueprintId: string, nodesData: Array<Omit<NodeModel, 'id'> & { aiId?: string }>): Promise<{ nodes: NodeModel[]; idMapping: Map<string, string> }> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ blueprintId }, ['blueprintId'], 'createNodes');
      
      if (!Array.isArray(nodesData) || nodesData.length === 0) {
        this.handleValidationError([{
          field: 'nodesData',
          message: 'At least one node is required',
          value: nodesData
        }], 'createNodes');
      }

      const connection = getConnection();
      
      // Check if blueprint exists
      const blueprintCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id',
        { blueprintId }
      );

      if (!blueprintCheck || blueprintCheck.length === 0) {
        this.handleNotFound('Blueprint', blueprintId, 'createNodes');
      }

      const nodes: NodeModel[] = [];
      const idMapping = new Map<string, string>();

      for (const nodeData of nodesData) {
        const nodeId = uuidv4();
        const { aiId, ...nodeWithoutAiId } = nodeData as any;
        
        const node: NodeModel = {
          id: nodeId,
          ...nodeWithoutAiId
        };

        // Serialize parameters as JSON string for Neo4j storage
        const nodeProps = {
          ...node,
          parameters: JSON.stringify(node.parameters || {}),
          ref: node.ref || nodeId
        };

        await connection.executeWrite(`
          MATCH (b:Blueprint {id: $blueprintId})
          CREATE (b)-[:CONTAINS]->(n:Node $nodeProps)
        `, {
          blueprintId,
          nodeProps
        });

        // Map AI-provided ID to real UUID for edge creation
        if (aiId) {
          idMapping.set(aiId, nodeId);
        }
        
        nodes.push(node);
      }

      return { nodes, idMapping };
    }, 'createNodes', 'Node');
  }

  async getNodesByBlueprintId(blueprintId: string): Promise<NodeModel[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ blueprintId }, ['blueprintId'], 'getNodesByBlueprintId');

      const connection = getConnection();

      const result = await connection.executeQuery<{ n: NodeModel }>(
        `MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(n:Node)
         RETURN n`,
        { blueprintId }
      );

      return result?.map(record => {
        const nodeProps = record.n;
        // Deserialize parameters from JSON string
        if (nodeProps.parameters && typeof nodeProps.parameters === 'string') {
          try {
            nodeProps.parameters = JSON.parse(nodeProps.parameters);
          } catch (error) {
            console.warn('Failed to parse node parameters JSON:', nodeProps.id, error);
            nodeProps.parameters = {};
          }
        }
        return nodeProps;
      }) || [];
    }, 'getNodesByBlueprintId', 'Node');
  }

  async getNodeById(nodeId: string): Promise<NodeModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ nodeId }, ['nodeId'], 'getNodeById');

      const connection = getConnection();

      const result = await connection.executeQuery<{ n: NodeModel }>(
        'MATCH (n:Node {id: $nodeId}) RETURN n',
        { nodeId }
      );

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
      }
      
      return nodeProps;
    }, 'getNodeById', 'Node', nodeId);
  }

  async updateNode(nodeId: string, updates: Partial<NodeModel>): Promise<NodeModel | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ nodeId }, ['nodeId'], 'updateNode');
      
      if (!updates || Object.keys(updates).length === 0) {
        this.handleValidationError([{
          field: 'updates',
          message: 'At least one field must be provided for update'
        }], 'updateNode');
      }

      const connection = getConnection();

      // Check if node exists
      const existingResult = await connection.executeQuery<{ n: NodeModel }>(
        'MATCH (n:Node {id: $nodeId}) RETURN n',
        { nodeId }
      );

      if (!existingResult || existingResult.length === 0) {
        this.handleNotFound('Node', nodeId, 'updateNode');
      }

      // Build SET clause dynamically
      const setClause: string[] = [];
      const params: any = { nodeId };

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
      }

      return nodeProps;
    }, 'updateNode', 'Node', nodeId);
  }

  async deleteNode(nodeId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ nodeId }, ['nodeId'], 'deleteNode');

      const connection = getConnection();

      // Check if node exists
      const existingResult = await connection.executeQuery<{ n: NodeModel }>(
        'MATCH (n:Node {id: $nodeId}) RETURN n',
        { nodeId }
      );

      if (!existingResult || existingResult.length === 0) {
        this.handleNotFound('Node', nodeId, 'deleteNode');
      }

      // Delete the node and all its relationships
      await connection.executeWrite(
        'MATCH (n:Node {id: $nodeId}) DETACH DELETE n',
        { nodeId }
      );

      return true;
    }, 'deleteNode', 'Node', nodeId);
  }

  async deleteNodesByBlueprintId(blueprintId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ blueprintId }, ['blueprintId'], 'deleteNodesByBlueprintId');

      const connection = getConnection();

      // Check if blueprint exists
      const blueprintCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id',
        { blueprintId }
      );

      if (!blueprintCheck || blueprintCheck.length === 0) {
        this.handleNotFound('Blueprint', blueprintId, 'deleteNodesByBlueprintId');
      }

      // Delete all nodes belonging to the blueprint
      await connection.executeWrite(`
        MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(n:Node)
        DETACH DELETE n
      `, { blueprintId });
    }, 'deleteNodesByBlueprintId', 'Node');
  }
}