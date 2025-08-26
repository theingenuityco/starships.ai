/**
 * WorkflowRepository - Repository for mission workflow DSL
 * 
 * Handles CRUD operations for MissionWorkflow, WorkflowNode, and WorkflowEdge entities
 * following BaseRepository patterns and Neo4j relationship patterns.
 */

import { BaseRepository } from './BaseRepository';
import { getConnection } from '../helpers/database';
import { 
  MissionWorkflow, 
  WorkflowNode,
  WorkflowEdge,
  CreateWorkflowRequest, 
  UpdateWorkflowApprovalRequest 
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

// Inline ID mapper utilities for this repository
class WorkflowIdMapper {
  private aiToRealMap = new Map<string, string>();
  
  addMapping(aiId: string, realId: string): void {
    this.aiToRealMap.set(aiId, realId);
  }
  
  getRealId(aiId: string): string | undefined {
    return this.aiToRealMap.get(aiId);
  }
  
  convertEdgesToReal(edges: Array<{ from: string; to: string }>): Array<{ from: string; to: string }> {
    return edges.map(edge => ({
      from: this.getRealId(edge.from) || edge.from,
      to: this.getRealId(edge.to) || edge.to
    }));
  }
}

export interface WorkflowRepositoryInterface {
  createWorkflow(request: CreateWorkflowRequest): Promise<MissionWorkflow>;
  getWorkflowByMissionId(missionId: string): Promise<MissionWorkflow | null>;
  updateApprovalStatus(workflowId: string, updates: UpdateWorkflowApprovalRequest): Promise<MissionWorkflow>;
  deleteWorkflow(workflowId: string): Promise<void>;
}

export class WorkflowRepository extends BaseRepository implements WorkflowRepositoryInterface {
  constructor() {
    super('WorkflowRepository');
  }

  async createWorkflow(request: CreateWorkflowRequest): Promise<MissionWorkflow> {
    return this.executeWithErrorHandling(async () => {
      // Validation following BaseRepository pattern
      this.validateRequired(request, ['missionId', 'nodes', 'edges'], 'createWorkflow');
      
      if (!Array.isArray(request.nodes) || request.nodes.length === 0) {
        this.handleValidationError([{
          field: 'nodes',
          message: 'At least one node is required',
          value: request.nodes
        }], 'createWorkflow');
      }

      if (!Array.isArray(request.edges)) {
        this.handleValidationError([{
          field: 'edges',
          message: 'Edges array is required',
          value: request.edges
        }], 'createWorkflow');
      }

      const connection = getConnection();
      const workflowId = uuidv4();
      const now = new Date().toISOString();

      // Check if mission exists
      const missionCheck = await connection.executeQuery(
        'MATCH (m:Mission {id: $missionId}) RETURN m.id as id',
        { missionId: request.missionId }
      );

      if (!missionCheck || missionCheck.length === 0) {
        this.handleNotFound('Mission', request.missionId, 'createWorkflow');
      }

      // Create workflow using MERGE pattern
      const workflowCypher = `
        MATCH (m:Mission {id: $missionId})
        MERGE (m)-[:HAS_WORKFLOW]->(w:Workflow {missionId: $missionId})
        ON CREATE SET 
          w.id = $workflowId,
          w.approvalStatus = 'pending',
          w.createdAt = $now
        RETURN w
      `;

      await connection.executeWrite(workflowCypher, { 
        missionId: request.missionId, 
        workflowId, 
        now 
      });

      // Clear existing nodes and edges
      await connection.executeWrite(`
        MATCH (w:Workflow {missionId: $missionId})-[:CONTAINS]->(n:WorkflowNode)
        OPTIONAL MATCH (n)-[r:FLOWS_TO]->()
        DETACH DELETE n, r
      `, { missionId: request.missionId });

      // Create ID mapper and nodes
      const idMapper = new WorkflowIdMapper();
      const nodes: WorkflowNode[] = [];

      for (const nodeData of request.nodes) {
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
          MATCH (w:Workflow {missionId: $missionId})
          CREATE (w)-[:CONTAINS]->(n:WorkflowNode $nodeProps)
        `, {
          missionId: request.missionId,
          nodeProps
        });

        // Map AI-provided ID to real UUID for edge creation
        if (aiId) {
          idMapper.addMapping(aiId, nodeId);
        }
        nodes.push(node);
      }

      // Create edges between nodes using ID mapper
      const edges: WorkflowEdge[] = [];
      const mappedEdges = idMapper.convertEdgesToReal(request.edges);
      
      for (let i = 0; i < mappedEdges.length; i++) {
        const edgeData = mappedEdges[i];
        const edgeId = uuidv4();
        
        const edge: WorkflowEdge = {
          id: edgeId,
          from: edgeData.from,
          to: edgeData.to
        };

        // Create relationship between nodes
        await connection.executeWrite(`
          MATCH (w:Workflow {missionId: $missionId})-[:CONTAINS]->(from:WorkflowNode {id: $fromId})
          MATCH (w)-[:CONTAINS]->(to:WorkflowNode {id: $toId})
          CREATE (from)-[:FLOWS_TO {id: $edgeId}]->(to)
        `, {
          missionId: request.missionId,
          fromId: edge.from,
          toId: edge.to,
          edgeId: edge.id
        });

        edges.push(edge);
      }

      return {
        id: workflowId,
        missionId: request.missionId,
        nodes,
        edges,
        approvalStatus: 'pending',
        createdAt: now
      } as MissionWorkflow;
    }, 'createWorkflow', 'MissionWorkflow');
  }

  async getWorkflowByMissionId(missionId: string): Promise<MissionWorkflow | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ missionId }, ['missionId'], 'getWorkflowByMissionId');

      const connection = getConnection();
      
      // Get workflow and nodes
      const workflowResult = await connection.executeQuery(`
        MATCH (m:Mission {id: $missionId})-[:HAS_WORKFLOW]->(w:Workflow)
        OPTIONAL MATCH (w)-[:CONTAINS]->(n:WorkflowNode)
        RETURN w, collect(n) as nodes
      `, { missionId });

      if (!workflowResult || workflowResult.length === 0) return null;

      const record = workflowResult[0];
      const w = record.w;
      const nodes = record.nodes;

      // Get edges
      const edgeResult = await connection.executeQuery(`
        MATCH (w:Workflow {missionId: $missionId})-[:CONTAINS]->(from:WorkflowNode)
        MATCH (from)-[r:FLOWS_TO]->(to:WorkflowNode)
        RETURN r.id as edgeId, from.id as fromId, to.id as toId
      `, { missionId });

      // Extract properties from Neo4j nodes
      const workflowProperties = w?.properties || w;
      const nodeProperties = nodes ? 
        nodes.filter((n: unknown) => n !== null)
             .map((n: any) => {
               const nodeProps = n?.properties || n;
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
             }) : [];

      const edgeProperties = edgeResult ? 
        edgeResult.map((e: any) => ({
          id: e.edgeId,
          from: e.fromId,
          to: e.toId
        })) : [];
      
      return { 
        ...workflowProperties, 
        nodes: nodeProperties,
        edges: edgeProperties
      } as MissionWorkflow;
    }, 'getWorkflowByMissionId', 'MissionWorkflow', missionId);
  }

  async updateApprovalStatus(workflowId: string, updates: UpdateWorkflowApprovalRequest): Promise<MissionWorkflow> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'updateApprovalStatus');
      this.validateRequired(updates, ['approvalStatus'], 'updateApprovalStatus');

      const connection = getConnection();
      const params: any = {
        workflowId,
        approvalStatus: updates.approvalStatus
      };

      // Add approvedAt timestamp if approving
      if (updates.approvalStatus === 'approved') {
        params.approvedAt = new Date().toISOString();
      }

      const setClauses = ['w.approvalStatus = $approvalStatus'];
      if (params.approvedAt) {
        setClauses.push('w.approvedAt = $approvedAt');
      }

      const query = `
        MATCH (w:Workflow {id: $workflowId})
        SET ${setClauses.join(', ')}
        RETURN w.missionId as missionId
      `;

      const result = await connection.executeWrite(query, params);

      if (!result || result.length === 0) {
        this.handleNotFound('Workflow', workflowId, 'updateApprovalStatus');
      }

      // Return full workflow
      const missionId = result[0].missionId;
      return this.getWorkflowByMissionId(missionId) as Promise<MissionWorkflow>;
    }, 'updateApprovalStatus', 'MissionWorkflow', workflowId);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ workflowId }, ['workflowId'], 'deleteWorkflow');

      const connection = getConnection();
      
      await connection.executeWrite(`
        MATCH (w:Workflow {id: $workflowId})
        OPTIONAL MATCH (w)-[:CONTAINS]->(n:WorkflowNode)
        OPTIONAL MATCH (n)-[r:FLOWS_TO]->()
        DETACH DELETE w, n, r
      `, { workflowId });
    }, 'deleteWorkflow', 'MissionWorkflow', workflowId);
  }
}