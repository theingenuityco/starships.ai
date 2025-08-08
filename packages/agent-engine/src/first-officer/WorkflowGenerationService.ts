/**
 * Workflow Generation Service for FirstOfficer Agent
 * 
 * Creates workflow DSL from expedition data within the FirstOfficer context.
 * This is a lightweight version adapted for agent-engine usage.
 */

import {
  WorkflowDSL,
  WorkflowGenerationRequest,
  WorkflowGenerationResult,
  WorkflowDSLNode,
  WorkflowDSLEdge,
  TaskBreakdown,
  AgentAssignment
} from '@starships/protocol';
import { v4 as uuidv4 } from 'uuid';

export class WorkflowGenerationService {
  
  /**
   * Generate a workflow DSL from FirstOfficer state
   */
  async generateWorkflowFromState(
    expeditionId: string,
    taskBreakdown: TaskBreakdown[],
    selectedAgents: AgentAssignment[],
    objective: string,
    complexity: 'simple' | 'moderate' | 'complex' | 'advanced' = 'moderate'
  ): Promise<WorkflowGenerationResult> {
    const startTime = Date.now();
    
    try {
      const request: WorkflowGenerationRequest = {
        expeditionId,
        taskBreakdown,
        selectedAgents,
        objective,
        complexity,
        preferences: {
          maxNodes: 50,
          includeUserInteraction: true,
          allowConditionals: complexity !== 'simple',
          qualityGates: complexity !== 'simple'
        }
      };
      
      // Generate workflow from task breakdown and agent assignments
      const workflow = await this.createWorkflowFromTasks(request);
      
      // Add visualization
      workflow.visualization = this.generateVisualization(workflow);
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(workflow, request);
      
      const generationTime = Date.now() - startTime;
      
      return {
        workflow,
        confidence,
        suggestions: this.generateSuggestions(workflow, request),
        warnings: this.generateWarnings(workflow, request),
        metadata: {
          generationTime,
          llmModel: 'first-officer-workflow-generator',
          tokensUsed: this.estimateTokenUsage(request)
        }
      };
    } catch (error) {
      throw new Error(`Workflow generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create workflow from task breakdown
   */
  private async createWorkflowFromTasks(request: WorkflowGenerationRequest): Promise<WorkflowDSL> {
    const workflowId = uuidv4();
    const nodes: WorkflowDSLNode[] = [];
    const edges: WorkflowDSLEdge[] = [];

    // Create start node
    const startNodeId = uuidv4();
    nodes.push({
      id: startNodeId,
      type: 'start',
      name: 'Start Expedition',
      description: `Begin execution of: ${request.objective}`,
      parameters: {},
      position: { x: 0, y: 0 }
    });

    let currentX = 200;
    let previousNodeId = startNodeId;

    // Create agent nodes for each task
    for (let i = 0; i < request.taskBreakdown.length; i++) {
      const task = request.taskBreakdown[i];
      const assignedAgent = this.findBestAgentForTask(task, request.selectedAgents);
      
      const agentNodeId = uuidv4();
      nodes.push({
        id: agentNodeId,
        type: 'agent',
        name: `Execute: ${task.title || `Task ${i + 1}`}`,
        description: task.description || `Execute task ${i + 1}`,
        estimatedTime: task.estimatedTime || 30,
        parameters: {
          agentId: assignedAgent?.agentId || 'default',
          taskIds: [task.id || `task-${i + 1}`],
          instructions: task.description,
          expectedOutput: task.acceptanceCriteria || 'Task completion confirmation'
        },
        position: { x: currentX, y: 0 }
      });

      // Connect to previous node
      const edgeId = uuidv4();
      edges.push({
        id: edgeId,
        from: previousNodeId,
        to: agentNodeId,
        label: i === 0 ? 'Begin execution' : `After task ${i}`
      });

      previousNodeId = agentNodeId;
      currentX += 300;
    }

    // Add user approval node if complexity warrants it
    if (request.complexity && ['moderate', 'complex', 'advanced'].includes(request.complexity)) {
      const approvalNodeId = uuidv4();
      nodes.push({
        id: approvalNodeId,
        type: 'user_prompt',
        name: 'User Review Required',
        description: 'Review and approve task completion before proceeding',
        parameters: {
          promptText: 'Please review the completed tasks. Do you want to proceed to final output generation?',
          choices: [
            { id: 'approve', text: 'Approve & Continue', value: 'approved' },
            { id: 'revise', text: 'Request Revisions', value: 'revision_needed' }
          ],
          timeout: 60
        },
        position: { x: currentX, y: 0 }
      });

      // Connect from last agent node
      const approvalEdgeId = uuidv4();
      edges.push({
        id: approvalEdgeId,
        from: previousNodeId,
        to: approvalNodeId,
        label: 'Request approval'
      });

      previousNodeId = approvalNodeId;
      currentX += 250;
    }

    // Create output node
    const outputNodeId = uuidv4();
    nodes.push({
      id: outputNodeId,
      type: 'output',
      name: 'Generate Final Output',
      description: 'Compile and format expedition results',
      parameters: {
        template: 'expedition-summary',
        sources: nodes.filter(n => n.type === 'agent').map(n => n.id),
        format: 'markdown',
        title: `Expedition Results: ${request.objective}`
      },
      position: { x: currentX, y: 0 }
    });

    // Connect to output
    const outputEdgeId = uuidv4();
    edges.push({
      id: outputEdgeId,
      from: previousNodeId,
      to: outputNodeId,
      label: 'Generate output'
    });

    // Create end node
    const endNodeId = uuidv4();
    nodes.push({
      id: endNodeId,
      type: 'end',
      name: 'Complete Expedition',
      description: 'Expedition workflow completed successfully',
      parameters: {},
      position: { x: currentX + 250, y: 0 }
    });

    // Connect to end
    const endEdgeId = uuidv4();
    edges.push({
      id: endEdgeId,
      from: outputNodeId,
      to: endNodeId,
      label: 'Complete'
    });

    // Calculate estimated duration
    const totalEstimatedTime = nodes
      .filter(n => n.estimatedTime)
      .reduce((sum, n) => sum + (n.estimatedTime || 0), 0);

    return {
      id: workflowId,
      expeditionId: request.expeditionId,
      nodes,
      edges,
      visualization: '', // Will be filled by generateVisualization
      approvalStatus: 'pending',
      createdAt: new Date().toISOString(),
      metadata: {
        complexity: request.complexity || 'simple',
        estimatedDuration: totalEstimatedTime,
        createdBy: 'FirstOfficer-WorkflowGenerator',
        version: '1.0.0',
        tags: ['first-officer-generated'],
        description: `Generated workflow for: ${request.objective}`
      }
    };
  }

  /**
   * Find best agent for a task based on skills and availability
   */
  private findBestAgentForTask(task: any, agents: AgentAssignment[]): AgentAssignment | null {
    if (agents.length === 0) return null;

    // Simple algorithm: find agent with most matching skills or use first available
    let bestAgent = agents[0];
    let bestScore = 0;

    for (const agent of agents) {
      let score = 1; // Base score for being available
      
      // Score based on skill matching (if task has skills specified)
      if (task.skills && Array.isArray(task.skills)) {
        const matchingSkills = agent.skills?.filter(skill => 
          task.skills.some((req: string) => 
            skill.toLowerCase().includes(req.toLowerCase())
          )
        ) || [];
        score += matchingSkills.length * 2;
      }

      // Prefer agents with lighter workload
      const assignedTaskCount = agent.assignedTasks?.length || 0;
      if (assignedTaskCount === 0) score += 1;
      else if (assignedTaskCount < 3) score += 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  /**
   * Generate ASCII visualization of workflow
   */
  private generateVisualization(workflow: WorkflowDSL): string {
    const lines: string[] = [];
    lines.push('FirstOfficer Workflow:');
    lines.push('====================');
    lines.push('');

    // Simple linear visualization for now
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (startNode) {
      lines.push(`[START] ${startNode.name}`);
      lines.push('   |');
      lines.push('   v');
    }

    const agentNodes = workflow.nodes.filter(n => n.type === 'agent');
    agentNodes.forEach((node, index) => {
      lines.push(`[AGENT] ${node.name}`);
      if (index < agentNodes.length - 1 || workflow.nodes.some(n => n.type === 'user_prompt')) {
        lines.push('   |');
        lines.push('   v');
      }
    });

    const userPromptNode = workflow.nodes.find(n => n.type === 'user_prompt');
    if (userPromptNode) {
      lines.push(`[USER] ${userPromptNode.name}`);
      lines.push('   |');
      lines.push('   v');
    }

    const outputNode = workflow.nodes.find(n => n.type === 'output');
    if (outputNode) {
      lines.push(`[OUTPUT] ${outputNode.name}`);
      lines.push('   |');
      lines.push('   v');
    }

    const endNode = workflow.nodes.find(n => n.type === 'end');
    if (endNode) {
      lines.push(`[END] ${endNode.name}`);
    }

    return lines.join('\n');
  }

  /**
   * Calculate confidence score for generated workflow
   */
  private calculateConfidence(workflow: WorkflowDSL, request: WorkflowGenerationRequest): number {
    let confidence = 0.8; // Base confidence

    // Boost confidence if we have good task breakdown
    if (request.taskBreakdown.length > 0) {
      confidence += 0.1;
    }

    // Boost confidence if agents are well-matched
    if (request.selectedAgents.length >= request.taskBreakdown.length) {
      confidence += 0.05;
    }

    // Reduce confidence for complex workflows
    if (request.complexity === 'complex' || request.complexity === 'advanced') {
      confidence -= 0.1;
    }

    // Reduce confidence if validation finds issues
    if (workflow.nodes.length === 0) {
      confidence -= 0.3;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(workflow: WorkflowDSL, request: WorkflowGenerationRequest): string[] {
    const suggestions: string[] = [];

    if (request.taskBreakdown.length > 5) {
      suggestions.push('Consider breaking down complex tasks into smaller sub-tasks for better tracking');
    }

    if (workflow.nodes.filter(n => n.type === 'agent').length > 1) {
      suggestions.push('Consider adding quality gates between major phases');
    }

    if (!workflow.nodes.some(n => n.type === 'user_prompt')) {
      suggestions.push('Consider adding user interaction points for better control');
    }

    return suggestions;
  }

  /**
   * Generate potential warnings
   */
  private generateWarnings(workflow: WorkflowDSL, request: WorkflowGenerationRequest): string[] {
    const warnings: string[] = [];

    const totalEstimatedTime = workflow.nodes
      .filter(n => n.estimatedTime)
      .reduce((sum, n) => sum + (n.estimatedTime || 0), 0);

    if (totalEstimatedTime > 240) { // 4 hours
      warnings.push('Estimated execution time exceeds 4 hours - consider breaking into smaller workflows');
    }

    if (request.selectedAgents.length === 0) {
      warnings.push('No agents assigned - workflow may fail during execution');
    }

    if (request.taskBreakdown.length === 0) {
      warnings.push('No tasks defined - workflow will have minimal functionality');
    }

    return warnings;
  }

  /**
   * Estimate token usage for generation request
   */
  private estimateTokenUsage(request: WorkflowGenerationRequest): number {
    // Simple estimation based on request complexity
    let tokens = 100; // Base cost
    
    tokens += request.taskBreakdown.length * 50;
    tokens += request.selectedAgents.length * 25;
    tokens += request.objective.length / 4; // ~4 chars per token
    
    return Math.round(tokens);
  }
}