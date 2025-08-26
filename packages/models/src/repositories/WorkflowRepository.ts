/**
 * WorkflowRepository - Repository for mission workflow DSL
 * 
 * Handles CRUD operations for MissionWorkflow, WorkflowNode, and WorkflowEdge entities
 * following BaseRepository patterns and Neo4j relationship patterns.
 */

import { BaseRepository } from './BaseRepository';
import { getConnection } from '../helpers/database';
import { WorkflowNodeRepository } from './WorkflowNodeRepository';
import { WorkflowEdgeRepository } from './WorkflowEdgeRepository';
import {
  MissionWorkflow,
  CreateWorkflowRequest,
  UpdateWorkflowApprovalRequest
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

export interface WorkflowRepositoryInterface {
  createWorkflow(request: CreateWorkflowRequest): Promise<MissionWorkflow>;
  getWorkflowByMissionId(missionId: string): Promise<MissionWorkflow | null>;
  updateApprovalStatus(workflowId: string, updates: UpdateWorkflowApprovalRequest): Promise<MissionWorkflow>;
  deleteWorkflow(workflowId: string): Promise<void>;
}

export class WorkflowRepository extends BaseRepository implements WorkflowRepositoryInterface {
  private workflowNodeRepo: WorkflowNodeRepository;
  private workflowEdgeRepo: WorkflowEdgeRepository;

  constructor() {
    super('WorkflowRepository');
    this.workflowNodeRepo = new WorkflowNodeRepository();
    this.workflowEdgeRepo = new WorkflowEdgeRepository();
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

      // Clear existing nodes and edges using separate repositories
      await this.workflowNodeRepo.deleteNodesByWorkflowId(workflowId);
      await this.workflowEdgeRepo.deleteEdgesByWorkflowId(workflowId);

      // Create nodes using WorkflowNodeRepository
      const { nodes, idMapping } = await this.workflowNodeRepo.createNodes(workflowId, request.nodes);

      // Create edges using WorkflowEdgeRepository with ID mapping
      const edges = await this.workflowEdgeRepo.createEdges(workflowId, request.edges, idMapping);

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
      
      // Get workflow metadata
      const workflowResult = await connection.executeQuery(`
        MATCH (m:Mission {id: $missionId})-[:HAS_WORKFLOW]->(w:Workflow)
        RETURN w
      `, { missionId });

      if (!workflowResult || workflowResult.length === 0) return null;

      const workflow = workflowResult[0].w;
      const workflowId = workflow.id;

      // Get nodes and edges using separate repositories
      const nodes = await this.workflowNodeRepo.getNodesByWorkflowId(workflowId);
      const edges = await this.workflowEdgeRepo.getEdgesByWorkflowId(workflowId);
      
      return {
        ...workflow,
        nodes,
        edges
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

      // Delete nodes and edges using separate repositories
      await this.workflowNodeRepo.deleteNodesByWorkflowId(workflowId);
      await this.workflowEdgeRepo.deleteEdgesByWorkflowId(workflowId);

      // Delete the workflow itself
      const connection = getConnection();
      await connection.executeWrite(`
        MATCH (w:Workflow {id: $workflowId})
        DETACH DELETE w
      `, { workflowId });
    }, 'deleteWorkflow', 'MissionWorkflow', workflowId);
  }
}