/**
 * WorkflowParsingService - AI response parsing for mission workflows
 *
 * Handles parsing and validation of AI-generated workflow DSL responses.
 * Separated from orchestrator agent to follow separation of concerns pattern.
 */

import { Logger } from '@/utils/logger';
import type { Blueprint } from '@starships/autopilot';
import { ValidationError } from '@starships/errors';
import type { AgentModel, CreateWorkflowRequest } from '@starships/protocol';

export class WorkflowParsingService {
  private static logger = Logger.getInstance();

  /**
   * Parse AI response and convert to CreateWorkflowRequest with Blueprint
   * Migrated from legacy format to autopilot Blueprint pattern
   */
  static parseAIResponse(aiResponse: string, missionId: string, agents: AgentModel[]): CreateWorkflowRequest {
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new ValidationError('No JSON found in AI response', 'aiResponse');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
        throw new ValidationError('Invalid nodes structure in AI response', 'nodes');
      }

      if (!parsed.edges || !Array.isArray(parsed.edges)) {
        throw new ValidationError('Invalid edges structure in AI response', 'edges');
      }

      // Validate agent assignments
      const agentIds = agents.map((a) => a.id);
      for (const node of parsed.nodes) {
        if (node.type === 'agent' && node.parameters?.agentId) {
          if (!agentIds.includes(node.parameters.agentId)) {
            throw new ValidationError(`Invalid agent assignment: ${node.parameters.agentId}`, 'agentId');
          }
        }
      }

      // Validate workflow structure
      const hasStart = parsed.nodes.some((node: any) => node.type === 'start');
      const hasEnd = parsed.nodes.some((node: any) => node.type === 'end');

      if (!hasStart) {
        throw new ValidationError('Workflow must have a start node', 'nodes');
      }

      if (!hasEnd) {
        throw new ValidationError('Workflow must have an end node', 'nodes');
      }

      // Process nodes for Blueprint format
      const blueprintNodes = parsed.nodes.map((node: any) => {
        return {
          ref: node.id || node.name, // Use AI-provided ID or fallback to name
          type: node.type,
          name: node.name || '',
          description: node.description || '',
          parameters: node.parameters || {},
        };
      });

      // Process edges for Blueprint format
      const blueprintEdges = parsed.edges.map((edge: any) => {
        return {
          from: edge.from,
          to: edge.to,
        };
      });

      // Create Blueprint structure
      const blueprint: Blueprint = {
        nodes: blueprintNodes,
        edges: blueprintEdges,
      };

      return {
        name: `Mission Workflow ${Date.now()}`,
        description: 'Auto-generated workflow from AI response',
        category: 'generated',
        executionMode: 'workflow' as const,
        blueprint,
        isPublic: false,
      };
    } catch (error) {
      this.logger.error('Error parsing AI workflow response', { error });
      throw new ValidationError(`Failed to parse workflow: ${error instanceof Error ? error.message : 'Unknown error'}`, 'workflow');
    }
  }

  /**
   * Validate workflow structure using Blueprint format
   */
  static validateWorkflow(workflow: CreateWorkflowRequest): boolean {
    try {
      // Check basic structure
      if (!workflow.blueprint?.nodes || workflow.blueprint.nodes.length === 0) {
        throw new ValidationError('Workflow must have nodes', 'nodes');
      }

      if (!workflow.blueprint?.edges || workflow.blueprint.edges.length === 0) {
        throw new ValidationError('Workflow must have edges', 'edges');
      }

      // Check for required node types
      const hasStart = workflow.blueprint.nodes.some((node: any) => node.type === 'start');
      const hasEnd = workflow.blueprint.nodes.some((node: any) => node.type === 'end');

      if (!hasStart) {
        throw new ValidationError('Workflow must have a start node', 'nodes');
      }

      if (!hasEnd) {
        throw new ValidationError('Workflow must have an end node', 'nodes');
      }

      return true;
    } catch (error) {
      this.logger.error('Workflow validation failed', { error });
      return false;
    }
  }
}
