/**
 * WorkflowParsingService - AI response parsing for mission workflows
 * 
 * Handles parsing and validation of AI-generated workflow DSL responses.
 * Separated from orchestrator agent to follow separation of concerns pattern.
 */

import { CreateWorkflowRequest } from '@starships/models';
import { AgentModel } from '@starships/models';
import { Logger } from '../utils/logger';

export class WorkflowParsingService {
  private static logger = Logger.getInstance();

  /**
   * Parse AI response and convert to WorkflowDSL
   * Moved from MissionOrchestratorAgent to follow separation of concerns
   */
  static parseAIResponse(aiResponse: string, missionId: string, agents: AgentModel[]): CreateWorkflowRequest {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
        throw new Error('Invalid nodes structure in AI response');
      }

      if (!parsed.edges || !Array.isArray(parsed.edges)) {
        throw new Error('Invalid edges structure in AI response');
      }

      // Validate agent assignments
      const agentIds = agents.map(a => a.id);
      for (const node of parsed.nodes) {
        if (node.type === 'agent' && node.parameters?.agentId) {
          if (!agentIds.includes(node.parameters.agentId)) {
            throw new Error(`Invalid agent assignment: ${node.parameters.agentId}`);
          }
        }
      }

      // Validate workflow structure
      const hasStart = parsed.nodes.some((node: any) => node.type === 'start');
      const hasEnd = parsed.nodes.some((node: any) => node.type === 'end');
      
      if (!hasStart) {
        throw new Error('Workflow must have a start node');
      }
      
      if (!hasEnd) {
        throw new Error('Workflow must have an end node');
      }

      // Process nodes and preserve AI IDs for mapping
      const processedNodes = parsed.nodes.map((node: any) => {
        return {
          type: node.type,
          name: node.name || '',
          description: node.description || '',
          parameters: node.parameters || {},
          aiId: node.id // Preserve AI-provided ID for mapping
        };
      });

      // Process edges directly - they reference AI IDs
      const processedEdges = parsed.edges.map((edge: any) => {
        return {
          from: edge.from,
          to: edge.to
        };
      });

      return {
        missionId,
        nodes: processedNodes,
        edges: processedEdges
      };

    } catch (error) {
      this.logger.error('Error parsing AI workflow response', { error });
      throw new Error(`Failed to parse workflow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate workflow structure
   */
  static validateWorkflow(workflow: CreateWorkflowRequest): boolean {
    try {
      // Check basic structure
      if (!workflow.nodes || workflow.nodes.length === 0) {
        throw new Error('Workflow must have nodes');
      }

      if (!workflow.edges || workflow.edges.length === 0) {
        throw new Error('Workflow must have edges');
      }

      // Check for required node types
      const hasStart = workflow.nodes.some(node => node.type === 'start');
      const hasEnd = workflow.nodes.some(node => node.type === 'end');
      
      if (!hasStart) {
        throw new Error('Workflow must have a start node');
      }
      
      if (!hasEnd) {
        throw new Error('Workflow must have an end node');
      }

      return true;
    } catch (error) {
      this.logger.error('Workflow validation failed', { error });
      return false;
    }
  }
}