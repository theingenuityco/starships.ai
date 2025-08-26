import { getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowEdge
} from '@starships/protocol';

export interface WorkflowEdgeRepositoryInterface {
  createEdge(workflowId: string, edgeData: Omit<WorkflowEdge, 'id'>): Promise<WorkflowEdge>;
  createEdges(workflowId: string, edgesData: Array<Omit<WorkflowEdge, 'id'>>, idMapping?: Map<string, string>): Promise<WorkflowEdge[]>;
  getEdgesByWorkflowId(workflowId: string): Promise<WorkflowEdge[]>;
  getEdgeById(edgeId: string): Promise<WorkflowEdge | null>;
  updateEdge(edgeId: string, updates: Partial<WorkflowEdge>): Promise<WorkflowEdge | null>;
  deleteEdge(edgeId: string): Promise<boolean>;
  deleteEdgesByWorkflowId(workflowId: string): Promise<void>;
  getEdgesByFromNode(fromNodeId: string): Promise<WorkflowEdge[]>;
  getEdgesByToNode(toNodeId: string): Promise<WorkflowEdge[]>;
}

export class WorkflowEdgeRepository extends BaseRepository implements WorkflowEdgeRepositoryInterface {
  constructor() {
    super('WorkflowEdgeRepository');
  }

  async createEdge(workflowId: string, edgeData: Omit<WorkflowEdge, 'id'>): Promise<WorkflowEdge> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'createEdge');
      this.validateRequired(edgeData, ['from', 'to'], 'createEdge');

      const connection = getConnection();
      const edgeId = uuidv4();

      // Check if workflow exists
      const workflowCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (w:Workflow {id: $workflowId}) RETURN w.id as id',
        { workflowId }
      );

      if (!workflowCheck || workflowCheck.length === 0) {
        this.handleNotFound('Workflow', workflowId, 'createEdge');
      }

      // Check if both nodes exist
      const nodesCheck = await connection.executeQuery<{ fromId: string; toId: string }>(
        `MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(from:WorkflowNode {id: $fromId})
         MATCH (w)-[:CONTAINS]->(to:WorkflowNode {id: $toId})
         RETURN from.id as fromId, to.id as toId`,
        { workflowId, fromId: edgeData.from, toId: edgeData.to }
      );

      if (!nodesCheck || nodesCheck.length === 0) {
        this.handleValidationError([{
          field: 'nodes',
          message: 'Both from and to nodes must exist in the workflow',
          value: { from: edgeData.from, to: edgeData.to }
        }], 'createEdge');
      }

      const edge: WorkflowEdge = {
        id: edgeId,
        ...edgeData
      };

      // Create relationship between nodes
      await connection.executeWrite(`
        MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(from:WorkflowNode {id: $fromId})
        MATCH (w)-[:CONTAINS]->(to:WorkflowNode {id: $toId})
        CREATE (from)-[:FLOWS_TO {id: $edgeId}]->(to)
      `, {
        workflowId,
        fromId: edge.from,
        toId: edge.to,
        edgeId: edge.id
      });

      return edge;
    }, 'createEdge', 'WorkflowEdge');
  }

  async createEdges(workflowId: string, edgesData: Array<Omit<WorkflowEdge, 'id'>>, idMapping?: Map<string, string>): Promise<WorkflowEdge[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'createEdges');
      
      if (!Array.isArray(edgesData)) {
        this.handleValidationError([{
          field: 'edgesData',
          message: 'Edges array is required',
          value: edgesData
        }], 'createEdges');
      }

      const connection = getConnection();
      
      // Check if workflow exists
      const workflowCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (w:Workflow {id: $workflowId}) RETURN w.id as id',
        { workflowId }
      );

      if (!workflowCheck || workflowCheck.length === 0) {
        this.handleNotFound('Workflow', workflowId, 'createEdges');
      }

      const edges: WorkflowEdge[] = [];

      for (const edgeData of edgesData) {
        const edgeId = uuidv4();
        
        // Convert edge node IDs using mapping if provided
        const fromNodeId = idMapping?.get(edgeData.from) || edgeData.from;
        const toNodeId = idMapping?.get(edgeData.to) || edgeData.to;
        
        const edge: WorkflowEdge = {
          id: edgeId,
          from: fromNodeId,
          to: toNodeId
        };

        // Verify nodes exist before creating edge
        const nodesCheck = await connection.executeQuery<{ fromId: string; toId: string }>(
          `MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(from:WorkflowNode {id: $fromId})
           MATCH (w)-[:CONTAINS]->(to:WorkflowNode {id: $toId})
           RETURN from.id as fromId, to.id as toId`,
          { workflowId, fromId: fromNodeId, toId: toNodeId }
        );

        if (!nodesCheck || nodesCheck.length === 0) {
          console.warn(`Skipping edge creation: nodes not found`, { from: fromNodeId, to: toNodeId });
          continue;
        }

        // Create relationship between nodes
        await connection.executeWrite(`
          MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(from:WorkflowNode {id: $fromId})
          MATCH (w)-[:CONTAINS]->(to:WorkflowNode {id: $toId})
          CREATE (from)-[:FLOWS_TO {id: $edgeId}]->(to)
        `, {
          workflowId,
          fromId: edge.from,
          toId: edge.to,
          edgeId: edge.id
        });

        edges.push(edge);
      }

      return edges;
    }, 'createEdges', 'WorkflowEdge');
  }

  async getEdgesByWorkflowId(workflowId: string): Promise<WorkflowEdge[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'getEdgesByWorkflowId');

      const connection = getConnection();

      const result = await connection.executeQuery<{ edgeId: string; fromId: string; toId: string }>(
        `MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(from:WorkflowNode)
         MATCH (from)-[r:FLOWS_TO]->(to:WorkflowNode)
         RETURN r.id as edgeId, from.id as fromId, to.id as toId`,
        { workflowId }
      );

      return result?.map(record => ({
        id: record.edgeId,
        from: record.fromId,
        to: record.toId
      })) || [];
    }, 'getEdgesByWorkflowId', 'WorkflowEdge');
  }

  async getEdgeById(edgeId: string): Promise<WorkflowEdge | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ edgeId }, ['edgeId'], 'getEdgeById');

      const connection = getConnection();

      const result = await connection.executeQuery<{ edgeId: string; fromId: string; toId: string }>(
        `MATCH (from:WorkflowNode)-[r:FLOWS_TO {id: $edgeId}]->(to:WorkflowNode)
         RETURN r.id as edgeId, from.id as fromId, to.id as toId`,
        { edgeId }
      );

      if (!result || result.length === 0) {
        return null;
      }

      return {
        id: result[0].edgeId,
        from: result[0].fromId,
        to: result[0].toId
      };
    }, 'getEdgeById', 'WorkflowEdge', edgeId);
  }

  async updateEdge(edgeId: string, updates: Partial<WorkflowEdge>): Promise<WorkflowEdge | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ edgeId }, ['edgeId'], 'updateEdge');
      
      if (!updates || Object.keys(updates).length === 0) {
        this.handleValidationError([{
          field: 'updates',
          message: 'At least one field must be provided for update'
        }], 'updateEdge');
      }

      // For edges, we typically only update by recreating the relationship
      // since we can't easily update the from/to relationships in Neo4j
      if (updates.from !== undefined || updates.to !== undefined) {
        // Get current edge details
        const currentEdge = await this.getEdgeById(edgeId);
        if (!currentEdge) {
          this.handleNotFound('WorkflowEdge', edgeId, 'updateEdge');
        }

        const connection = getConnection();
        
        // Delete old relationship
        await connection.executeWrite(
          'MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() DELETE r',
          { edgeId }
        );

        // Create new relationship with updated values
        const newFromId = updates.from !== undefined ? updates.from : currentEdge!.from;
        const newToId = updates.to !== undefined ? updates.to : currentEdge!.to;

        await connection.executeWrite(`
          MATCH (from:WorkflowNode {id: $fromId})
          MATCH (to:WorkflowNode {id: $toId})
          CREATE (from)-[:FLOWS_TO {id: $edgeId}]->(to)
        `, {
          fromId: newFromId,
          toId: newToId,
          edgeId
        });

        return {
          id: edgeId,
          from: newFromId,
          to: newToId
        };
      }

      // If no structural changes, return current edge
      return this.getEdgeById(edgeId);
    }, 'updateEdge', 'WorkflowEdge', edgeId);
  }

  async deleteEdge(edgeId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ edgeId }, ['edgeId'], 'deleteEdge');

      const connection = getConnection();

      // Check if edge exists
      const existingResult = await connection.executeQuery<{ edgeId: string }>(
        'MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() RETURN r.id as edgeId',
        { edgeId }
      );

      if (!existingResult || existingResult.length === 0) {
        this.handleNotFound('WorkflowEdge', edgeId, 'deleteEdge');
      }

      // Delete the edge relationship
      await connection.executeWrite(
        'MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() DELETE r',
        { edgeId }
      );

      return true;
    }, 'deleteEdge', 'WorkflowEdge', edgeId);
  }

  async deleteEdgesByWorkflowId(workflowId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'deleteEdgesByWorkflowId');

      const connection = getConnection();

      // Check if workflow exists
      const workflowCheck = await connection.executeQuery<{ id: string }>(
        'MATCH (w:Workflow {id: $workflowId}) RETURN w.id as id',
        { workflowId }
      );

      if (!workflowCheck || workflowCheck.length === 0) {
        this.handleNotFound('Workflow', workflowId, 'deleteEdgesByWorkflowId');
      }

      // Delete all edges belonging to the workflow's nodes
      await connection.executeWrite(`
        MATCH (w:Workflow {id: $workflowId})-[:CONTAINS]->(from:WorkflowNode)
        MATCH (from)-[r:FLOWS_TO]->()
        DELETE r
      `, { workflowId });
    }, 'deleteEdgesByWorkflowId', 'WorkflowEdge');
  }

  async getEdgesByFromNode(fromNodeId: string): Promise<WorkflowEdge[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ fromNodeId }, ['fromNodeId'], 'getEdgesByFromNode');

      const connection = getConnection();

      const result = await connection.executeQuery<{ edgeId: string; fromId: string; toId: string }>(
        `MATCH (from:WorkflowNode {id: $fromNodeId})-[r:FLOWS_TO]->(to:WorkflowNode)
         RETURN r.id as edgeId, from.id as fromId, to.id as toId`,
        { fromNodeId }
      );

      return result?.map(record => ({
        id: record.edgeId,
        from: record.fromId,
        to: record.toId
      })) || [];
    }, 'getEdgesByFromNode', 'WorkflowEdge');
  }

  async getEdgesByToNode(toNodeId: string): Promise<WorkflowEdge[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ toNodeId }, ['toNodeId'], 'getEdgesByToNode');

      const connection = getConnection();

      const result = await connection.executeQuery<{ edgeId: string; fromId: string; toId: string }>(
        `MATCH (from:WorkflowNode)-[r:FLOWS_TO]->(to:WorkflowNode {id: $toNodeId})
         RETURN r.id as edgeId, from.id as fromId, to.id as toId`,
        { toNodeId }
      );

      return result?.map(record => ({
        id: record.edgeId,
        from: record.fromId,
        to: record.toId
      })) || [];
    }, 'getEdgesByToNode', 'WorkflowEdge');
  }
}