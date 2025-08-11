/**
 * Workflow 4-Phase Integration Service
 * 
 * Integrates the simplified 4-phase expedition flow with the existing WorkflowDSL system.
 * Handles task breakdown generation, WorkflowDSL creation, and execution coordination.
 */

import { 
  WorkflowDSL,
  TaskBreakdown,
  WorkflowExecutionContext,
  WorkflowRuntimeState,
  WorkflowGenerationPreferences,
  WorkflowGenerationRequest,
  WorkflowGenerationResult
} from '@starships/protocol';
import { WorkflowGenerationService } from './WorkflowGenerationService';
import { WorkflowExecutionService } from './WorkflowExecutionService';
import { AgentService } from './AgentService';
import { RepositoryFactory } from '@starships/models';
import { Logger } from '../utils/logger';
import { Simplified4PhaseState } from '@starships/agent-engine/src/first-officer/workflow/SimplifiedExpeditionWorkflow';

/**
 * Enhanced task breakdown result for 4-phase flow
 */
export interface Enhanced4PhaseTaskBreakdown {
  tasks: TaskBreakdown[];
  agentAssignments: Record<string, string[]>; // agentId -> taskIds
  dependencyGraph: Record<string, string[]>; // taskId -> dependsOn
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  estimatedDuration: number; // minutes
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high';
    riskFactors: string[];
    mitigationStrategies: string[];
  };
}

/**
 * Workflow generation result for 4-phase flow
 */
export interface Enhanced4PhaseWorkflowResult {
  workflowDSL: WorkflowDSL;
  visualization: string;
  dependencyGraph: Record<string, string[]>;
  estimatedExecutionTime: number;
  successProbability: number;
  qualityScore: number;
}

/**
 * Main integration service
 */
export class Workflow4PhaseIntegrationService {
  private static instance: Workflow4PhaseIntegrationService;
  private logger = Logger.getInstance();
  private workflowGenerationService: WorkflowGenerationService;
  private workflowExecutionService: WorkflowExecutionService;
  private agentService: AgentService;

  private constructor() {
    this.workflowGenerationService = new WorkflowGenerationService();
    this.workflowExecutionService = WorkflowExecutionService.getInstance();
    this.agentService = AgentService.getInstance();
  }

  static getInstance(): Workflow4PhaseIntegrationService {
    if (!Workflow4PhaseIntegrationService.instance) {
      Workflow4PhaseIntegrationService.instance = new Workflow4PhaseIntegrationService();
    }
    return Workflow4PhaseIntegrationService.instance;
  }

  // ============================================================================
  // PHASE 2: PLAN - TASK BREAKDOWN AND WORKFLOW GENERATION
  // ============================================================================

  /**
   * Generate task breakdown from refined mission
   */
  async generateTaskBreakdown(
    expeditionId: string,
    refinedMission: string,
    requirements: string[],
    complexity: string,
    selectedAgents: string[]
  ): Promise<Enhanced4PhaseTaskBreakdown> {
    const context = {
      service: 'Workflow4PhaseIntegrationService',
      operation: 'generateTaskBreakdown',
      resource: 'expedition',
      resourceId: expeditionId
    };

    this.logger.info('Generating task breakdown for 4-phase expedition', context);

    try {
      // Get agent capabilities
      const agentCapabilities = await this.getAgentCapabilities(selectedAgents);

      // Break down mission into specific tasks
      const tasks = await this.createTasksFromMission(
        refinedMission,
        requirements,
        complexity,
        agentCapabilities
      );

      // Assign tasks to agents based on capabilities
      const agentAssignments = await this.assignTasksToAgents(
        tasks,
        agentCapabilities
      );

      // Build dependency graph
      const dependencyGraph = this.buildTaskDependencies(tasks);

      // Calculate duration and risk
      const estimatedDuration = this.calculateTotalDuration(tasks);
      const riskAssessment = this.assessTaskRisks(tasks, agentAssignments);

      this.logger.info('Task breakdown generated successfully', {
        ...context,
        metadata: {
          taskCount: tasks.length,
          agentCount: selectedAgents.length,
          estimatedDuration
        }
      });

      return {
        tasks,
        agentAssignments,
        dependencyGraph,
        complexity: complexity as any,
        estimatedDuration,
        riskAssessment
      };

    } catch (error) {
      this.logger.error('Failed to generate task breakdown', context, error instanceof Error ? error : undefined);
      throw new Error(`Task breakdown generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate WorkflowDSL from task breakdown
   */
  async generateWorkflowDSL(
    expeditionId: string,
    taskBreakdown: TaskBreakdown[],
    agentAssignments: Record<string, string[]>,
    refinedMission: string
  ): Promise<Enhanced4PhaseWorkflowResult> {
    const context = {
      service: 'Workflow4PhaseIntegrationService',
      operation: 'generateWorkflowDSL',
      resource: 'expedition',
      resourceId: expeditionId
    };

    this.logger.info('Generating WorkflowDSL for 4-phase expedition', context);

    try {
      // Convert agent assignments to selected agents format
      const selectedAgents = Object.values(agentAssignments).flat();
      
      // Create workflow generation request  
      const generationRequest = {
        expeditionId,
        objective: refinedMission,
        selectedAgents,
        taskBreakdown,
        agentAssignments,
        complexity: this.determineWorkflowComplexity(taskBreakdown.length),
        requirements: taskBreakdown.map(t => t.description),
        constraints: [], // No specific constraints for 4-phase flow
        preferences: {
          parallelExecution: true,
          errorRecovery: 'retry',
          userInteraction: 'minimal'
        } as WorkflowGenerationPreferences
      };

      // Generate workflow using existing service
      const generationResult = await this.workflowGenerationService.generateWorkflow(generationRequest);

      // Enhance with 4-phase specific data
      const dependencyGraph = this.extractDependencyGraph(generationResult.workflow);
      const estimatedExecutionTime = this.estimateExecutionTime(generationResult.workflow);
      const successProbability = this.calculateSuccessProbability(
        generationResult.workflow,
        taskBreakdown,
        agentAssignments
      );

      this.logger.info('WorkflowDSL generated successfully', {
        ...context,
        metadata: {
          nodeCount: generationResult.workflow.nodes.length,
          edgeCount: generationResult.workflow.edges.length,
          confidence: generationResult.confidence,
          estimatedExecutionTime
        }
      });

      return {
        workflowDSL: generationResult.workflow,
        visualization: generationResult.workflow.visualization || this.generateSimpleVisualization(generationResult.workflow),
        dependencyGraph,
        estimatedExecutionTime,
        successProbability,
        qualityScore: generationResult.confidence
      };

    } catch (error) {
      this.logger.error('Failed to generate WorkflowDSL', context, error instanceof Error ? error : undefined);
      throw new Error(`WorkflowDSL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================================================
  // PHASE 3: EXECUTE - WORKFLOW EXECUTION INTEGRATION
  // ============================================================================

  /**
   * Initialize workflow execution for approved plan
   */
  async initializeWorkflowExecution(
    expeditionId: string,
    approvedWorkflowDSL: WorkflowDSL,
    executionContext: any
  ): Promise<{
    runtimeState: WorkflowRuntimeState;
    executionId: string;
  }> {
    const context = {
      service: 'Workflow4PhaseIntegrationService',
      operation: 'initializeWorkflowExecution',
      resource: 'expedition',
      resourceId: expeditionId
    };

    this.logger.info('Initializing workflow execution for 4-phase expedition', context);

    try {
      // Create enhanced execution context for 4-phase flow
      const enhancedContext: WorkflowExecutionContext = {
        expeditionId,
        workflowId: approvedWorkflowDSL.id,
        userId: executionContext.userId,
        previousResults: new Map(),
        expeditionState: executionContext,
        services: {
          agentService: this.agentService,
          userPromptService: this.createUserPromptService(expeditionId),
          dataService: this.createDataService(expeditionId)
        }
      };

      // Execute workflow using existing service
      const runtimeState = await this.workflowExecutionService.executeWorkflow(
        approvedWorkflowDSL,
        enhancedContext
      );

      this.logger.info('Workflow execution initialized successfully', {
        ...context,
        metadata: {
          runtimeStateId: runtimeState.id,
          nodeCount: approvedWorkflowDSL.nodes.length
        }
      });

      return {
        runtimeState,
        executionId: runtimeState.id
      };

    } catch (error) {
      this.logger.error('Failed to initialize workflow execution', context, error instanceof Error ? error : undefined);
      throw new Error(`Workflow execution initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Monitor workflow execution progress
   */
  async monitorWorkflowExecution(
    expeditionId: string,
    executionId: string
  ): Promise<{
    progress: number;
    currentNode?: string;
    completedNodes: number;
    totalNodes: number;
    errors: any[];
    estimatedTimeRemaining: number;
  }> {
    const context = {
      service: 'Workflow4PhaseIntegrationService',
      operation: 'monitorWorkflowExecution',
      resource: 'expedition',
      resourceId: expeditionId
    };

    try {
      // TODO: Implement runtime state retrieval when available
      // For now, return mock data structure
      const runtimeState: any = {
        workflowDSL: null,
        nodeResults: new Map(),
        startTime: null,
        estimatedDuration: 0
      };

      // Calculate progress metrics
      const totalNodes = runtimeState.workflowDSL?.nodes.length || 0;
      const completedNodes = Array.from(runtimeState.nodeResults.keys()).length;
      const progress = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

      // Estimate remaining time based on current progress
      const estimatedTimeRemaining = this.estimateRemainingTime(
        runtimeState,
        progress
      );

      return {
        progress,
        currentNode: runtimeState.currentNodeId,
        completedNodes,
        totalNodes,
        errors: Array.from(runtimeState.errors || []),
        estimatedTimeRemaining
      };

    } catch (error) {
      this.logger.error('Failed to monitor workflow execution', context, error instanceof Error ? error : undefined);
      throw new Error(`Workflow execution monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get capabilities for selected agents
   */
  private async getAgentCapabilities(selectedAgents: string[]): Promise<Map<string, any>> {
    const capabilities = new Map();
    
    for (const agentId of selectedAgents) {
      try {
        const agent = await AgentService.getAgent(agentId);
        capabilities.set(agentId, {
          skills: agent?.tags || [], // Use tags as skills
          category: agent?.category || 'general',
          availability: 'available'
        });
      } catch (error) {
        this.logger.warn(`Failed to get capabilities for agent ${agentId}`, error instanceof Error ? error : undefined);
        capabilities.set(agentId, {
          skills: [],
          category: 'general',
          availability: 'unknown'
        });
      }
    }

    return capabilities;
  }

  /**
   * Create tasks from refined mission
   */
  private async createTasksFromMission(
    refinedMission: string,
    requirements: string[],
    complexity: string,
    agentCapabilities: Map<string, any>
  ): Promise<TaskBreakdown[]> {
    // For now, create a simple task breakdown
    // TODO: Implement AI-powered task generation
    
    const tasks: TaskBreakdown[] = [];
    
    // Create main execution task
    tasks.push({
      id: `task-main-${Date.now()}`,
      description: `Execute mission: ${refinedMission}`,
      requiredSkills: ['general'],
      assignedAgentId: Array.from(agentCapabilities.keys())[0], // Assign to first agent
      status: 'pending',
      result: undefined,
      deliverable: `Completed mission: ${refinedMission}`,
      dependencies: []
    });

    // Create tasks for each requirement
    requirements.forEach((requirement, index) => {
      tasks.push({
        id: `task-req-${index}-${Date.now()}`,
        description: `Address requirement: ${requirement}`,
        requiredSkills: ['analysis'],
        assignedAgentId: Array.from(agentCapabilities.keys())[index % agentCapabilities.size],
        status: 'pending',
        result: undefined,
        deliverable: `Requirement addressed: ${requirement}`,
        dependencies: index === 0 ? [] : [`task-req-${index - 1}-${Date.now()}`]
      });
    });

    return tasks;
  }

  /**
   * Assign tasks to agents based on capabilities
   */
  private async assignTasksToAgents(
    tasks: TaskBreakdown[],
    agentCapabilities: Map<string, any>
  ): Promise<Record<string, string[]>> {
    const assignments: Record<string, string[]> = {};

    // Initialize assignment arrays
    for (const agentId of agentCapabilities.keys()) {
      assignments[agentId] = [];
    }

    // Simple round-robin assignment for now
    // TODO: Implement intelligent assignment based on skills
    const agentIds = Array.from(agentCapabilities.keys());
    tasks.forEach((task, index) => {
      const assignedAgentId = agentIds[index % agentIds.length];
      assignments[assignedAgentId].push(task.id);
      task.assignedAgentId = assignedAgentId;
    });

    return assignments;
  }

  /**
   * Build task dependency graph
   */
  private buildTaskDependencies(tasks: TaskBreakdown[]): Record<string, string[]> {
    const dependencyGraph: Record<string, string[]> = {};

    tasks.forEach(task => {
      dependencyGraph[task.id] = task.dependencies;
    });

    return dependencyGraph;
  }

  /**
   * Calculate total estimated duration
   */
  private calculateTotalDuration(tasks: TaskBreakdown[]): number {
    // Simple estimation: 30 minutes per task
    // TODO: Implement intelligent duration estimation
    return tasks.length * 30;
  }

  /**
   * Assess task execution risks
   */
  private assessTaskRisks(
    tasks: TaskBreakdown[],
    agentAssignments: Record<string, string[]>
  ): {
    overallRisk: 'low' | 'medium' | 'high';
    riskFactors: string[];
    mitigationStrategies: string[];
  } {
    const riskFactors: string[] = [];
    const mitigationStrategies: string[] = [];

    // Assess based on task complexity
    if (tasks.length > 10) {
      riskFactors.push('High number of tasks may increase coordination complexity');
      mitigationStrategies.push('Break down complex tasks into smaller subtasks');
    }

    // Assess based on agent workload
    const maxTasksPerAgent = Math.max(...Object.values(agentAssignments).map(tasks => tasks.length));
    if (maxTasksPerAgent > 5) {
      riskFactors.push('Uneven agent workload distribution');
      mitigationStrategies.push('Balance task distribution across agents');
    }

    const overallRisk: 'low' | 'medium' | 'high' = 
      riskFactors.length === 0 ? 'low' :
      riskFactors.length <= 2 ? 'medium' : 'high';

    return {
      overallRisk,
      riskFactors,
      mitigationStrategies
    };
  }

  /**
   * Determine workflow complexity based on task count
   */
  private determineWorkflowComplexity(taskCount: number): any {
    if (taskCount <= 3) return 'simple';
    if (taskCount <= 7) return 'moderate';
    if (taskCount <= 15) return 'complex';
    return 'expert';
  }

  /**
   * Extract dependency graph from WorkflowDSL
   */
  private extractDependencyGraph(workflow: WorkflowDSL): Record<string, string[]> {
    const dependencies: Record<string, string[]> = {};

    workflow.nodes.forEach(node => {
      dependencies[node.id] = [];
    });

    workflow.edges.forEach(edge => {
      if (!dependencies[edge.to]) {
        dependencies[edge.to] = [];
      }
      dependencies[edge.to].push(edge.from);
    });

    return dependencies;
  }

  /**
   * Estimate workflow execution time
   */
  private estimateExecutionTime(workflow: WorkflowDSL): number {
    // Simple estimation: 15 minutes per node
    // TODO: Implement more sophisticated estimation
    return workflow.nodes.length * 15;
  }

  /**
   * Calculate workflow success probability
   */
  private calculateSuccessProbability(
    workflow: WorkflowDSL,
    tasks: TaskBreakdown[],
    agentAssignments: Record<string, string[]>
  ): number {
    // Simple calculation based on task complexity and agent availability
    // TODO: Implement more sophisticated probability calculation
    
    let baseScore = 85; // Start with 85% base success rate
    
    // Reduce score based on complexity
    if (workflow.nodes.length > 10) baseScore -= 10;
    if (workflow.nodes.length > 20) baseScore -= 15;
    
    // Reduce score based on agent workload
    const avgTasksPerAgent = tasks.length / Object.keys(agentAssignments).length;
    if (avgTasksPerAgent > 5) baseScore -= 10;
    
    return Math.max(baseScore, 50); // Minimum 50% probability
  }

  /**
   * Generate simple text visualization
   */
  private generateSimpleVisualization(workflow: WorkflowDSL): string {
    let visualization = "Workflow Execution Flow:\n\n";
    
    workflow.nodes.forEach((node, index) => {
      const dependencies = workflow.edges
        .filter(edge => edge.to === node.id)
        .map(edge => edge.from);
      
      visualization += `${index + 1}. ${node.name || node.id}\n`;
      if (dependencies.length > 0) {
        visualization += `   Dependencies: ${dependencies.join(', ')}\n`;
      }
      visualization += "\n";
    });
    
    return visualization;
  }

  /**
   * Create user prompt service for 4-phase flow
   */
  private createUserPromptService(expeditionId: string): any {
    // Return a mock service for now
    // TODO: Implement actual user prompt service
    return {
      promptUser: async (prompt: string) => {
        return `Mock response to: ${prompt}`;
      }
    };
  }

  /**
   * Create data service for 4-phase flow
   */
  private createDataService(expeditionId: string): any {
    // Return a mock service for now
    // TODO: Implement actual data service
    return {
      getData: async (key: string) => {
        return null;
      },
      setData: async (key: string, value: any) => {
        // Mock storage
      }
    };
  }

  /**
   * Estimate remaining execution time
   */
  private estimateRemainingTime(
    runtimeState: WorkflowRuntimeState,
    currentProgress: number
  ): number {
    // Simple estimation based on current progress
    if (currentProgress === 0) return 60; // Default to 60 minutes
    
    const elapsedTime = Date.now() - new Date(runtimeState.startTime || new Date()).getTime();
    const elapsedMinutes = elapsedTime / (1000 * 60);
    
    if (currentProgress >= 100) return 0;
    
    const estimatedTotal = elapsedMinutes * (100 / currentProgress);
    return Math.max(estimatedTotal - elapsedMinutes, 0);
  }
}

export default Workflow4PhaseIntegrationService;