/**
 * WorkflowParsingService - AI response parsing for mission workflows
 * 
 * Handles parsing and validation of AI-generated workflow DSL responses.
 * Separated from orchestrator agent to follow separation of concerns pattern.
 */

import { Agent, CreateWorkflowRequest } from '@starships/protocol';
import { Logger } from '../utils/logger';

export class WorkflowParsingService {
  private static logger = Logger.getInstance();

  /**
   * Parse AI response and convert to WorkflowDSL
   * Moved from MissionOrchestratorAgent to follow separation of concerns
   */
  static parseAIResponse(aiResponse: string, missionId: string, agents: Agent[]): CreateWorkflowRequest {
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

      // Create node ID mapping for edges
      const nodeReferenceMap = new Map<string, string>();
      let nodeIndex = 0;

      // Process nodes and create IDs
      const processedNodes = parsed.nodes.map((node: any) => {
        let nodeRef: string;
        
        if (node.type === 'start') {
          nodeRef = 'start-node';
        } else if (node.type === 'end') {
          nodeRef = 'end-node';
        } else if (node.type === 'agent') {
          nodeRef = `agent-node-${++nodeIndex}`;
        } else {
          throw new Error(`Unknown node type: ${node.type}`);
        }

        nodeReferenceMap.set(nodeRef, nodeRef);

        return {
          type: node.type,
          name: node.name || '',
          description: node.description || '',
          parameters: node.parameters || {}
        };
      });

      // Process edges with proper node references
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