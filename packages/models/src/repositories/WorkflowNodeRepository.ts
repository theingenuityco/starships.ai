import { getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowNode
} from '@starships/protocol';

export interface WorkflowNodeRepositoryInterface {
  createNode(workflowId: string, nodeData: Omit<WorkflowNode, 'id'>): Promise<WorkflowNode>;
  createNodes(workflowId: string, nodesData: Array<Omit<WorkflowNode, 'id'> & { aiId?: string }>): Promise<{ nodes: WorkflowNode[]; idMapping: Map<string, string> }>;
  getNodesByWorkflowId(workflowId: string): Promise<WorkflowNode[]>;
  getNodeById(nodeId: string): Promise<WorkflowNode | null>;
  updateNode(nodeId: string, updates: Partial<WorkflowNode>): Promise<WorkflowNode | null>;
  deleteNode(nodeId: string): Promise<boolean>;
  deleteNodesByWorkflowId(workflowId: string): Promise<void>;
}

export class WorkflowNodeRepository extends BaseRepository implements WorkflowNodeRepositoryInterface {
  constructor() {
    super('WorkflowNodeRepository');
  }

  async createNode(workflowId: string, nodeData: Omit<WorkflowNode, 'id'>): Promise<WorkflowNode> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'createNode');
      this.validateRequired(nodeData, ['type', 'name'], 'createNode');

      const connection = getConnection();
      const nodeId = uuidv4();

      // Check if workflow exists
      const workflowCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (w:Workflow {id: $workflowId}) RETURN w.id as id',
        { workflowId }
      );

      if (!workflowCheck || workflowCheck.length === 0) {
        this.handleNotFound('Workflow', workflowId, 'createNode');
      }

      const node: WorkflowNode = {
        id: nodeId,
        ...nodeData
      };

      // Serialize parameters as JSON string for Neo4j storage
      const nodeProps = {
        ...node,
        parameters: JSON.stringify(node.parameters || {})
      };

      await connection.executeWrite(`
        MATCH (w:Workflow {id: $workflowId})
        CREATE (w)-[:CONTAINS]->(n:WorkflowNode $nodeProps)
      `, {
        workflowId,
        nodeProps
      });

      return node;
    }, 'createNode', 'WorkflowNode');
  }

  async createNodes(workflowId: string, nodesData: Array<Omit<WorkflowNode, 'id'> & { aiId?: string }>): Promise<{ nodes: WorkflowNode[]; idMapping: Map<string, string> }> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'createNodes');
      
      if (!Array.isArray(nodesData) || nodesData.length === 0) {
        this.handleValidationError([{
          field: 'nodesData',
          message: 'At least one node is required',
          value: nodesData
        }], 'createNodes');
      }

      const connection = getConnection();
      
      // Check if workflow exists
      const workflowCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (w:Workflow {id: $workflowId}) RETURN w.id as id',
        { workflowId }
      );

      if (!workflowCheck || workflowCheck.length === 0) {
        this.handleNotFound('Workflow', workflowId, 'createNodes');
      }

      const nodes: WorkflowNode[] = [];
      const idMapping = new Map<string, string>();

      for (const nodeData of nodesData) {
        const nodeId = uuidv4();
        const { aiId, ...nodeWithoutAiId } = nodeData as any;
        
        const node: WorkflowNode = {
          id: nodeId,
          ...nodeWithoutAiId
        };

        // Serialize parameters as JSON string for Neo4j storage
        const nodeProps = {
          ...node,
          parameters: JSON.stringify(node.parameters || {})
        };

        await connection.executeWrite(`
          MATCH (w:Workflow {id: $workflowId})
          CREATE (w)-[:CONTAINS]->(n:WorkflowNode $nodeProps)
        `, {
          workflowId,
          nodeProps
        });

        // Map AI-provided ID to real UUID for edge creation
        if (aiId) {
          idMapping.set(aiId, nodeId);
        }
        
        nodes.push(node);
      }

      return { nodes, idMapping };
    }, 'createNodes', 'WorkflowNode');
  }

  async getNodesByWorkflowId(workflowId: string): Promise<WorkflowNode[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'getNodesByWorkflowId');

      const connection = getConnection();

      const result = await connection.executeQuery<{ n: WorkflowNode }>(
        `MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(n:WorkflowNode)
         RETURN n`,
        { workflowId }
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
    }, 'getNodesByWorkflowId', 'WorkflowNode');
  }

  async getNodeById(nodeId: string): Promise<WorkflowNode | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ nodeId }, ['nodeId'], 'getNodeById');

      const connection = getConnection();

      const result = await connection.executeQuery<{ n: WorkflowNode }>(
        'MATCH (n:WorkflowNode {id: $nodeId}) RETURN n',
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
    }, 'getNodeById', 'WorkflowNode', nodeId);
  }

  async updateNode(nodeId: string, updates: Partial<WorkflowNode>): Promise<WorkflowNode | null> {
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
      const existingResult = await connection.executeQuery<{ n: WorkflowNode }>(
        'MATCH (n:WorkflowNode {id: $nodeId}) RETURN n',
        { nodeId }
      );

      if (!existingResult || existingResult.length === 0) {
        this.handleNotFound('WorkflowNode', nodeId, 'updateNode');
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

      if (setClause.length === 0) {
        return this.getNodeById(nodeId);
      }

      const query = `
        MATCH (n:WorkflowNode {id: $nodeId})
        SET ${setClause.join(', ')}
        RETURN n
      `;

      const result = await connection.executeWrite<{ n: WorkflowNode }>(query, params);

      if (!result || result.length === 0) {
        throw new Error('Failed to update workflow node');
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
    }, 'updateNode', 'WorkflowNode', nodeId);
  }

  async deleteNode(nodeId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ nodeId }, ['nodeId'], 'deleteNode');

      const connection = getConnection();

      // Check if node exists
      const existingResult = await connection.executeQuery<{ n: WorkflowNode }>(
        'MATCH (n:WorkflowNode {id: $nodeId}) RETURN n',
        { nodeId }
      );

      if (!existingResult || existingResult.length === 0) {
        this.handleNotFound('WorkflowNode', nodeId, 'deleteNode');
      }

      // Delete the node and all its relationships
      await connection.executeWrite(
        'MATCH (n:WorkflowNode {id: $nodeId}) DETACH DELETE n',
        { nodeId }
      );

      return true;
    }, 'deleteNode', 'WorkflowNode', nodeId);
  }

  async deleteNodesByWorkflowId(workflowId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'deleteNodesByWorkflowId');

      const connection = getConnection();

      // Check if workflow exists
      const workflowCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (w:Workflow {id: $workflowId}) RETURN w.id as id',
        { workflowId }
      );

      if (!workflowCheck || workflowCheck.length === 0) {
        this.handleNotFound('Workflow', workflowId, 'deleteNodesByWorkflowId');
      }

      // Delete all nodes belonging to the workflow
      await connection.executeWrite(`
        MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(n:WorkflowNode)
        DETACH DELETE n
      `, { workflowId });
    }, 'deleteNodesByWorkflowId', 'WorkflowNode');
  }
}