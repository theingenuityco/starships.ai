/**
 * WorkflowParsingService - AI response parsing for mission workflows
 *
 * Handles parsing and validation of AI-generated workflow DSL responses.
 * Separated from orchestrator agent to follow separation of concerns pattern.
 */

import type { CreateWorkflowRequest, AgentModel } from '@starships/protocol';
import type { Blueprint } from '@starships/autopilot';
import { Logger } from '../utils/logger';

export class WorkflowParsingService {
  private static logger = Logger.getInstance();

  /**
   * Parse AI response and convert to CreateWorkflowRequest with Blueprint
   * Migrated from legacy format to autopilot Blueprint pattern
   */
  static parseAIResponse(
    aiResponse: string,
    missionId: string,
    agents: AgentModel[]
  ): CreateWorkflowRequest {
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
      const agentIds = agents.map((a) => a.id);
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
      throw new Error(
        `Failed to parse workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate workflow structure using Blueprint format
   */
  static validateWorkflow(workflow: CreateWorkflowRequest): boolean {
    try {
      // Check basic structure
      if (!workflow.blueprint?.nodes || workflow.blueprint.nodes.length === 0) {
        throw new Error('Workflow must have nodes');
      }

      if (!workflow.blueprint?.edges || workflow.blueprint.edges.length === 0) {
        throw new Error('Workflow must have edges');
      }

      // Check for required node types
      const hasStart = workflow.blueprint.nodes.some((node: any) => node.type === 'start');
      const hasEnd = workflow.blueprint.nodes.some((node: any) => node.type === 'end');

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
