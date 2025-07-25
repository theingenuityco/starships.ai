import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
import { getLogger, Logger } from '../utils/logger';
import { VirtualFirstOfficer } from './VirtualFirstOfficer';
import { AgentService } from './AgentService';
import { TaskService } from './TaskService';
import { MessageService } from './MessageService';
import { 
  WorkflowPhase, 
  TaskStatus,
  ExpeditionTask,
  Agent 
} from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
// import { WorkflowStatePersistence } from './WorkflowStatePersistence';

interface MultiAgentWorkflowState {
  expeditionId: string;
  starshipId: string;
  userId: string;
  currentPhase: WorkflowPhase;
  objective: string;
  availableAgents?: Agent[];
  tasks?: ExpeditionTask[];
  taskAssignments?: Map<string, string>;
  executionResults?: Map<string, any>;
  parallelGroups?: string[][];
  dependencyGraph?: Map<string, string[]>;
  criticalPath?: string[];
  error?: string;
  retryCount: number;
  lastUpdated: string;
}

interface MultiAgentWorkflowConfig {
  maxRetries: number;
  enableParallelExecution: boolean;
  maxConcurrentTasks: number;
  taskTimeout: number;
  qualityThreshold: number;
}

export class MultiAgentCoordinationWorkflow {
  private logger: Logger;
  private config: MultiAgentWorkflowConfig;
  private vfo: VirtualFirstOfficer;
  private agentService: AgentService;
  private taskService: TaskService;
  private messageService: MessageService;
  private nodeHandlers: Map<string, (state: MultiAgentWorkflowState, config?: RunnableConfig) => Promise<Partial<MultiAgentWorkflowState>>>;
  private routingHandlers: Map<string, (state: MultiAgentWorkflowState) => string>;

  constructor(
    vfo: VirtualFirstOfficer,
    config?: Partial<MultiAgentWorkflowConfig>
  ) {
    this.logger = getLogger({ service: 'MultiAgentCoordinationWorkflow' });
    this.vfo = vfo;
    this.agentService = AgentService.getInstance();
    this.taskService = TaskService.getInstance();
    this.messageService = MessageService.getInstance();
    
    this.config = {
      maxRetries: 3,
      enableParallelExecution: true,
      maxConcurrentTasks: 5,
      taskTimeout: 300000,
      qualityThreshold: 70,
      ...config
    };

    this.nodeHandlers = new Map();
    this.routingHandlers = new Map();
    this.initializeHandlers();
  }

  private initializeHandlers(): void {
    this.nodeHandlers.set('analyze_objective', this.analyzeObjective.bind(this));
    this.nodeHandlers.set('discover_agents', this.discoverAgents.bind(this));
    this.nodeHandlers.set('decompose_tasks', this.decomposeTasks.bind(this));
    this.nodeHandlers.set('analyze_dependencies', this.analyzeDependencies.bind(this));
    this.nodeHandlers.set('assign_tasks', this.assignTasks.bind(this));
    this.nodeHandlers.set('execute_sequential', this.executeSequential.bind(this));
    this.nodeHandlers.set('execute_parallel', this.executeParallel.bind(this));
    this.nodeHandlers.set('monitor_progress', this.monitorProgress.bind(this));
    this.nodeHandlers.set('quality_check', this.qualityCheck.bind(this));
    this.nodeHandlers.set('synthesize_results', this.synthesizeResults.bind(this));
    this.nodeHandlers.set('handle_error', this.handleError.bind(this));
    this.nodeHandlers.set('retry_failed_tasks', this.retryFailedTasks.bind(this));

    this.routingHandlers.set('route_after_analysis', this.routeAfterAnalysis.bind(this));
    this.routingHandlers.set('route_after_discovery', this.routeAfterDiscovery.bind(this));
    this.routingHandlers.set('route_after_decomposition', this.routeAfterDecomposition.bind(this));
    this.routingHandlers.set('route_after_dependencies', this.routeAfterDependencies.bind(this));
    this.routingHandlers.set('route_after_assignment', this.routeAfterAssignment.bind(this));
    this.routingHandlers.set('route_after_execution', this.routeAfterExecution.bind(this));
    this.routingHandlers.set('route_after_monitoring', this.routeAfterMonitoring.bind(this));
    this.routingHandlers.set('route_after_quality', this.routeAfterQuality.bind(this));
    this.routingHandlers.set('route_after_error', this.routeAfterError.bind(this));
  }

  buildStateGraph(expeditionId: string): any {
    const workflow = new StateGraph<MultiAgentWorkflowState>({
      channels: this.defineStateChannels()
    }) as any;

    this.addWorkflowNodes(workflow);
    this.defineWorkflowEdges(workflow);

    return workflow.compile({
      checkpointer: new MemorySaver()
    });
  }

  private defineStateChannels() {
    return {
      expeditionId: null,
      starshipId: null,
      userId: null,
      currentPhase: null,
      objective: null,
      availableAgents: null,
      tasks: null,
      taskAssignments: null,
      executionResults: null,
      parallelGroups: null,
      dependencyGraph: null,
      criticalPath: null,
      error: null,
      retryCount: null,
      lastUpdated: null
    };
  }

  private addWorkflowNodes(workflow: StateGraph<MultiAgentWorkflowState>): void {
    workflow.addNode('analyze_objective', this.nodeHandlers.get('analyze_objective')!);
    workflow.addNode('discover_agents', this.nodeHandlers.get('discover_agents')!);
    workflow.addNode('decompose_tasks', this.nodeHandlers.get('decompose_tasks')!);
    workflow.addNode('analyze_dependencies', this.nodeHandlers.get('analyze_dependencies')!);
    workflow.addNode('assign_tasks', this.nodeHandlers.get('assign_tasks')!);
    workflow.addNode('execute_sequential', this.nodeHandlers.get('execute_sequential')!);
    workflow.addNode('execute_parallel', this.nodeHandlers.get('execute_parallel')!);
    workflow.addNode('monitor_progress', this.nodeHandlers.get('monitor_progress')!);
    workflow.addNode('quality_check', this.nodeHandlers.get('quality_check')!);
    workflow.addNode('synthesize_results', this.nodeHandlers.get('synthesize_results')!);
    workflow.addNode('handle_error', this.nodeHandlers.get('handle_error')!);
    workflow.addNode('retry_failed_tasks', this.nodeHandlers.get('retry_failed_tasks')!);
  }

  private defineWorkflowEdges(workflow: any): void {
    workflow.addEdge(START, 'analyze_objective');
    
    workflow.addConditionalEdges(
      'analyze_objective',
      this.routingHandlers.get('route_after_analysis')!,
      {
        'discover_agents': 'discover_agents',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'discover_agents',
      this.routingHandlers.get('route_after_discovery')!,
      {
        'decompose_tasks': 'decompose_tasks',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'decompose_tasks',
      this.routingHandlers.get('route_after_decomposition')!,
      {
        'analyze_dependencies': 'analyze_dependencies',
        'assign_tasks': 'assign_tasks',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'analyze_dependencies',
      this.routingHandlers.get('route_after_dependencies')!,
      {
        'assign_tasks': 'assign_tasks',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'assign_tasks',
      this.routingHandlers.get('route_after_assignment')!,
      {
        'execute_parallel': 'execute_parallel',
        'execute_sequential': 'execute_sequential',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'execute_sequential',
      this.routingHandlers.get('route_after_execution')!,
      {
        'monitor_progress': 'monitor_progress',
        'quality_check': 'quality_check',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'execute_parallel',
      this.routingHandlers.get('route_after_execution')!,
      {
        'monitor_progress': 'monitor_progress',
        'quality_check': 'quality_check',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'monitor_progress',
      this.routingHandlers.get('route_after_monitoring')!,
      {
        'execute_sequential': 'execute_sequential',
        'execute_parallel': 'execute_parallel',
        'quality_check': 'quality_check',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'quality_check',
      this.routingHandlers.get('route_after_quality')!,
      {
        'synthesize_results': 'synthesize_results',
        'retry_failed_tasks': 'retry_failed_tasks',
        'handle_error': 'handle_error'
      }
    );

    workflow.addConditionalEdges(
      'retry_failed_tasks',
      this.routingHandlers.get('route_after_error')!,
      {
        'execute_sequential': 'execute_sequential',
        'execute_parallel': 'execute_parallel',
        'synthesize_results': 'synthesize_results'
      }
    );

    workflow.addEdge('synthesize_results', END);
    workflow.addEdge('handle_error', END);
  }

  private async analyzeObjective(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      this.logger.debug('Analyzing expedition objective', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'analyzeObjective'
      }, {
        expeditionId: state.expeditionId,
        objective: state.objective
      });

      const analysis = await this.vfo.processMessage(
        `Analyze this objective and determine complexity: ${state.objective}`,
        state.userId
      );

      return {
        currentPhase: 'analyzing' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to analyze objective', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'analyzeObjective'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to analyze objective',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async discoverAgents(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      this.logger.debug('Discovering available agents', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'discoverAgents'
      }, {
        starshipId: state.starshipId
      });

      const agents = await this.agentService.getAvailableAgents(state.starshipId);

      return {
        availableAgents: agents,
        currentPhase: 'decomposing' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to discover agents', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'discoverAgents'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to discover agents',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async decomposeTasks(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      this.logger.debug('Decomposing objective into tasks', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'decomposeTasks'
      }, {
        expeditionId: state.expeditionId
      });

      const taskBreakdown = await this.vfo.processMessage(
        `Break down this objective into specific tasks: ${state.objective}`,
        state.userId
      );

      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const tasks = await taskRepo.findByExpedition(state.expeditionId);

      return {
        tasks,
        currentPhase: 'plan_tasks' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to decompose tasks', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'decomposeTasks'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to decompose tasks',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async analyzeDependencies(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      if (!state.tasks || state.tasks.length === 0) {
        return {
          dependencyGraph: new Map(),
          parallelGroups: [[]],
          criticalPath: []
        };
      }

      this.logger.debug('Analyzing task dependencies', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'analyzeDependencies'
      }, {
        taskCount: state.tasks.length
      });

      const dependencyGraph = new Map<string, string[]>();
      const parallelGroups: string[][] = [];
      
      state.tasks.forEach(task => {
        dependencyGraph.set(task.id, task.dependencies || []);
      });

      const criticalPath = this.findCriticalPath(state.tasks, dependencyGraph);
      const groups = this.groupTasksForParallelExecution(state.tasks, dependencyGraph);

      return {
        dependencyGraph,
        parallelGroups: groups,
        criticalPath,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to analyze dependencies', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'analyzeDependencies'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to analyze dependencies',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async assignTasks(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      if (!state.tasks || !state.availableAgents) {
        return {
          error: 'No tasks or agents available',
          currentPhase: 'failed' as WorkflowPhase
        };
      }

      this.logger.debug('Assigning tasks to agents', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'assignTasks'
      }, {
        taskCount: state.tasks.length,
        agentCount: state.availableAgents.length
      });

      const assignments = new Map<string, string>();
      
      for (const task of state.tasks) {
        const bestAgent = this.findBestAgentForTask(task, state.availableAgents);
        if (bestAgent) {
          assignments.set(task.id, bestAgent.id);
          
          await this.taskService.assignTask(state.userId, {
            taskId: task.id,
            agentId: bestAgent.id,
            expeditionId: state.expeditionId
          });
        }
      }

      return {
        taskAssignments: assignments,
        currentPhase: 'assigning' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to assign tasks', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'assignTasks'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to assign tasks',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async executeSequential(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      if (!state.tasks || !state.taskAssignments) {
        return {
          error: 'No tasks or assignments available',
          currentPhase: 'failed' as WorkflowPhase
        };
      }

      this.logger.debug('Executing tasks sequentially', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'executeSequential'
      }, {
        taskCount: state.tasks.length
      });

      const results = new Map<string, any>();
      
      for (const task of state.tasks) {
        const agentId = state.taskAssignments.get(task.id);
        if (agentId) {
          const result = await this.executeTask(task, agentId);
          results.set(task.id, result);
        }
      }

      return {
        executionResults: results,
        currentPhase: 'coordinating' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to execute tasks sequentially', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'executeSequential'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to execute tasks',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async executeParallel(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      if (!state.parallelGroups || !state.taskAssignments) {
        return {
          error: 'No parallel groups or assignments available',
          currentPhase: 'failed' as WorkflowPhase
        };
      }

      this.logger.debug('Executing tasks in parallel', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'executeParallel'
      }, {
        groupCount: state.parallelGroups.length
      });

      const results = new Map<string, any>();
      
      for (const group of state.parallelGroups) {
        const groupPromises = group.map(taskId => {
          const task = state.tasks?.find(t => t.id === taskId);
          const agentId = state.taskAssignments?.get(taskId);
          
          if (task && agentId) {
            return this.executeTask(task, agentId).then(result => {
              results.set(taskId, result);
            });
          }
          return Promise.resolve();
        });
        
        await Promise.all(groupPromises);
      }

      return {
        executionResults: results,
        currentPhase: 'coordinating' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to execute tasks in parallel', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'executeParallel'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to execute parallel tasks',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async monitorProgress(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      this.logger.debug('Monitoring task progress', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'monitorProgress'
      }, {
        expeditionId: state.expeditionId
      });

      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const tasks = await taskRepo.findByExpedition(state.expeditionId);
      
      const completedCount = tasks.filter((t: any) => t.status === 'completed').length;
      const inProgressCount = tasks.filter((t: any) => t.status === 'in_progress').length;
      
      if (inProgressCount > 0) {
        return {
          currentPhase: 'coordinating' as WorkflowPhase,
          lastUpdated: new Date().toISOString()
        };
      }

      return {
        currentPhase: 'synthesizing' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to monitor progress', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'monitorProgress'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to monitor progress',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async qualityCheck(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      if (!state.executionResults) {
        return {
          currentPhase: 'synthesizing' as WorkflowPhase
        };
      }

      this.logger.debug('Performing quality checks', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'qualityCheck'
      }, {
        resultCount: state.executionResults.size
      });

      let allPassed = true;
      for (const [taskId, result] of state.executionResults) {
        const qualityScore = await this.assessQuality(result);
        if (qualityScore < this.config.qualityThreshold) {
          allPassed = false;
          this.logger.warn('Task failed quality check', {
            service: 'MultiAgentCoordinationWorkflow',
            operation: 'qualityCheck'
          }, {
            taskId,
            qualityScore,
            threshold: this.config.qualityThreshold
          });
        }
      }

      return {
        currentPhase: allPassed ? 'synthesizing' as WorkflowPhase : 'coordinating' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to perform quality check', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'qualityCheck'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to perform quality check',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async synthesizeResults(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    try {
      this.logger.debug('Synthesizing final results', {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'synthesizeResults'
      }, {
        expeditionId: state.expeditionId
      });

      const synthesis = await this.vfo.processMessage(
        `Synthesize the results from all completed tasks for expedition ${state.expeditionId}`,
        state.userId
      );

      return {
        currentPhase: 'completed' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Failed to synthesize results', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'synthesizeResults'
      });

      return {
        error: error instanceof Error ? error.message : 'Failed to synthesize results',
        currentPhase: 'failed' as WorkflowPhase
      };
    }
  }

  private async handleError(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    this.logger.warn('Handling error in multi-agent workflow', {
      service: 'MultiAgentCoordinationWorkflow',
      operation: 'handleError'
    }, {
      error: state.error,
      retryCount: state.retryCount,
      expeditionId: state.expeditionId
    });

    return {
      retryCount: (state.retryCount || 0) + 1,
      lastUpdated: new Date().toISOString()
    };
  }

  private async retryFailedTasks(state: MultiAgentWorkflowState): Promise<Partial<MultiAgentWorkflowState>> {
    this.logger.info('Retrying failed tasks', {
      service: 'MultiAgentCoordinationWorkflow',
      operation: 'retryFailedTasks'
    }, {
      expeditionId: state.expeditionId
    });

    return {
      error: undefined,
      currentPhase: 'coordinating' as WorkflowPhase,
      lastUpdated: new Date().toISOString()
    };
  }

  private routeAfterAnalysis(state: MultiAgentWorkflowState): string {
    return state.error ? 'handle_error' : 'discover_agents';
  }

  private routeAfterDiscovery(state: MultiAgentWorkflowState): string {
    return state.error ? 'handle_error' : 'decompose_tasks';
  }

  private routeAfterDecomposition(state: MultiAgentWorkflowState): string {
    if (state.error) return 'handle_error';
    
    if (this.config.enableParallelExecution && state.tasks && state.tasks.length > 1) {
      return 'analyze_dependencies';
    }
    
    return 'assign_tasks';
  }

  private routeAfterDependencies(state: MultiAgentWorkflowState): string {
    return state.error ? 'handle_error' : 'assign_tasks';
  }

  private routeAfterAssignment(state: MultiAgentWorkflowState): string {
    if (state.error) return 'handle_error';
    
    if (this.config.enableParallelExecution && state.parallelGroups && state.parallelGroups.length > 1) {
      return 'execute_parallel';
    }
    
    return 'execute_sequential';
  }

  private routeAfterExecution(state: MultiAgentWorkflowState): string {
    if (state.error) return 'handle_error';
    
    return 'monitor_progress';
  }

  private routeAfterMonitoring(state: MultiAgentWorkflowState): string {
    if (state.error) return 'handle_error';
    
    if (state.currentPhase === 'coordinating') {
      return this.config.enableParallelExecution ? 'execute_parallel' : 'execute_sequential';
    }
    
    return 'quality_check';
  }

  private routeAfterQuality(state: MultiAgentWorkflowState): string {
    if (state.error) return 'handle_error';
    
    if (state.currentPhase === 'coordinating') {
      return 'retry_failed_tasks';
    }
    
    return 'synthesize_results';
  }

  private routeAfterError(state: MultiAgentWorkflowState): string {
    if (state.retryCount < this.config.maxRetries) {
      return this.config.enableParallelExecution ? 'execute_parallel' : 'execute_sequential';
    }
    
    return 'synthesize_results';
  }

  private findCriticalPath(tasks: ExpeditionTask[], dependencyGraph: Map<string, string[]>): string[] {
    const path: string[] = [];
    const visited = new Set<string>();
    
    const visit = (taskId: string): number => {
      if (visited.has(taskId)) return 0;
      visited.add(taskId);
      
      const task = tasks.find(t => t.id === taskId);
      if (!task) return 0;
      
      const dependencies = dependencyGraph.get(taskId) || [];
      let maxDepth = 0;
      
      for (const dep of dependencies) {
        maxDepth = Math.max(maxDepth, visit(dep));
      }
      
      if (!path.includes(taskId)) {
        path.unshift(taskId);
      }
      
      return maxDepth + 1;
    };
    
    tasks.forEach(task => visit(task.id));
    
    return path;
  }

  private groupTasksForParallelExecution(tasks: ExpeditionTask[], dependencyGraph: Map<string, string[]>): string[][] {
    const groups: string[][] = [];
    const assigned = new Set<string>();
    
    while (assigned.size < tasks.length) {
      const group: string[] = [];
      
      for (const task of tasks) {
        if (assigned.has(task.id)) continue;
        
        const dependencies = dependencyGraph.get(task.id) || [];
        const canExecute = dependencies.every(dep => assigned.has(dep));
        
        if (canExecute) {
          group.push(task.id);
        }
      }
      
      if (group.length === 0) break;
      
      groups.push(group);
      group.forEach(id => assigned.add(id));
    }
    
    return groups;
  }

  private findBestAgentForTask(task: ExpeditionTask, agents: Agent[]): Agent | null {
    let bestAgent: Agent | null = null;
    let bestScore = 0;
    
    for (const agent of agents) {
      const skillMatch = this.calculateSkillMatch(task.requiredSkills, agent.tags || []);
      
      if (skillMatch > bestScore) {
        bestScore = skillMatch;
        bestAgent = agent;
      }
    }
    
    return bestAgent;
  }

  private calculateSkillMatch(required: string[], available: string[]): number {
    if (required.length === 0) return 1;
    
    const matches = required.filter(skill => available.includes(skill)).length;
    return matches / required.length;
  }

  private async executeTask(task: ExpeditionTask, agentId: string): Promise<any> {
    try {
      await this.taskService.updateTaskStatus(task.id, 'in_progress' as TaskStatus);
      
      const result = await this.messageService.sendMessageToAgent(
        task.expeditionId,
        agentId,
        `Execute task: ${task.title}\nDescription: ${task.description}\nDeliverable: ${task.deliverable}`
      );
      
      await this.taskService.updateTaskStatus(task.id, 'completed' as TaskStatus);
      
      return result;
    } catch (error) {
      await this.taskService.updateTaskStatus(task.id, 'failed' as TaskStatus);
      throw error;
    }
  }

  private async assessQuality(result: any): Promise<number> {
    return Math.random() * 100;
  }

  async executeWorkflow(input: {
    expeditionId: string;
    starshipId: string;
    userId: string;
    objective: string;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      const graph = this.buildStateGraph(input.expeditionId);
      
      const initialState: MultiAgentWorkflowState = {
        ...input,
        currentPhase: 'initializing' as WorkflowPhase,
        retryCount: 0,
        lastUpdated: new Date().toISOString()
      };

      const result = await graph.invoke(initialState, {
        configurable: {
          thread_id: `multi-agent-${input.expeditionId}-${Date.now()}`
        }
      });

      return {
        success: result.currentPhase === 'completed',
        result: result.executionResults,
        error: result.error
      };
    } catch (error) {
      this.logger.error('Multi-agent workflow execution failed', error instanceof Error ? error : new Error(String(error)), {
        service: 'MultiAgentCoordinationWorkflow',
        operation: 'executeWorkflow'
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Workflow execution failed'
      };
    }
  }
}