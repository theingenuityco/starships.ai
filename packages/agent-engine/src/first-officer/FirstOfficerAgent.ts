/**
 * First Officer Agent - Main Orchestration Class
 * 
 * Implements the core LangGraph workflow for expedition orchestration
 * with hierarchical coordination, parallel task execution, and quality control.
 */

// Note: LangGraph integration will be added when the dependency is available
// import { StateGraph, END, START } from '@langchain/langgraph';
import { 
  Expedition, 
  ExpeditionStatus, 
  TaskBreakdown, 
  WorkflowPhase,
  ChatRequest,
  ChatResponse
} from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { ProviderFactory } from '../llm/provider-factory';
import { buildPrompt } from '../prompt/builder';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import { AgentSelector } from './AgentSelector';
import { QualityValidator } from './QualityValidator';
import { TaskExecutor } from './TaskExecutor';
import { ChatCoordinator } from './ChatCoordinator';
import {
  FirstOfficerState,
  FirstOfficerConfig,
  WorkflowNodeResult,
  ObjectiveAnalysis,
  TaskPlan,
  AgentAssignment,
  CompletedTask,
  ExpeditionProgress
} from './types';

/**
 * First Officer Agent - Core orchestration engine
 */
export class FirstOfficerAgent {
  private config: FirstOfficerConfig;
  private memoryStore: LangChainMemoryStore;
  private agentSelector: AgentSelector;
  private qualityValidator: QualityValidator;
  private taskExecutor: TaskExecutor;
  private chatCoordinator: ChatCoordinator;
  private workflow: any; // Will be StateGraph<FirstOfficerState> when LangGraph is available

  constructor(
    starshipId: string,
    memoryStore: LangChainMemoryStore,
    config: Partial<FirstOfficerConfig> = {}
  ) {
    // Initialize configuration with defaults
    this.config = {
      maxRetries: 3,
      qualityThreshold: 70,
      timeoutMinutes: 60,
      requireUserApproval: false,
      enableParallelExecution: true,
      autoEscalation: true,
      ...config
    };

    this.memoryStore = memoryStore;
    
    // Initialize components
    this.agentSelector = new AgentSelector(starshipId);
    this.qualityValidator = new QualityValidator(this.config);
    this.taskExecutor = new TaskExecutor(this.config, memoryStore);
    
    // Chat coordinator will be initialized per expedition
    this.chatCoordinator = null as any;
    
    // Build LangGraph workflow
    this.workflow = this.buildWorkflow();
  }

  /**
   * Start expedition orchestration
   */
  async startExpedition(
    expeditionId: string,
    userId: string,
    objective: string
  ): Promise<string> {
    console.log(`🚀 [FIRST-OFFICER] Starting expedition orchestration: ${expeditionId}`);

    try {
      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw new Error(`Expedition not found: ${expeditionId}`);
      }

      // Initialize chat coordinator
      this.chatCoordinator = new ChatCoordinator(
        this.memoryStore,
        expeditionId,
        userId,
        expedition.starshipId
      );

      // Initialize workflow state
      const initialState: FirstOfficerState = {
        expeditionId,
        currentPhase: 'initializing',
        requirements: objective,
        taskBreakdown: [],
        agentAssignments: {},
        agentResults: {},
        userId,
        starshipId: expedition.starshipId,
        errors: [],
        retryCount: 0,
        lastUpdated: new Date().toISOString()
      };

      // Update expedition status
      await expeditionRepo.updateStatus(expeditionId, 'planning');
      await expeditionRepo.updateWorkflowState(expeditionId, initialState);

      // Send initial coordination message
      await this.chatCoordinator.sendPhaseUpdate(
        'initializing',
        'analyzing',
        this.buildProgressFromState(initialState)
      );

      // Execute workflow
      const finalState = await this.workflow.invoke(initialState);

      // Handle final result
      if (finalState.finalResult) {
        await expeditionRepo.updateStatus(expeditionId, 'completed');
        await this.chatCoordinator.sendCompletionSummary(
          finalState.finalResult,
          this.calculateExpeditionStats(finalState)
        );
        
        console.log(`✅ [FIRST-OFFICER] Expedition completed successfully: ${expeditionId}`);
        return finalState.finalResult;
      } else {
        await expeditionRepo.updateStatus(expeditionId, 'failed');
        const errorMessage = finalState.errors?.join('; ') || 'Unknown error occurred';
        await this.chatCoordinator.sendErrorReport(errorMessage, finalState.currentPhase);
        
        console.error(`❌ [FIRST-OFFICER] Expedition failed: ${expeditionId}`, finalState.errors);
        throw new Error(`Expedition failed: ${errorMessage}`);
      }

    } catch (error) {
      console.error(`❌ [FIRST-OFFICER] Expedition orchestration failed:`, error);
      
      // Update expedition status to failed
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateStatus(expeditionId, 'failed');
      
      if (this.chatCoordinator) {
        await this.chatCoordinator.sendErrorReport(
          error instanceof Error ? error.message : 'Unknown error',
          'failed'
        );
      }
      
      throw error;
    }
  }

  /**
   * Handle user interaction during expedition
   */
  async handleUserMessage(
    expeditionId: string,
    userMessage: string
  ): Promise<ChatResponse> {
    if (!this.chatCoordinator) {
      return {
        reply: "No active expedition found. Please start an expedition first.",
        usage: undefined
      };
    }

    return await this.chatCoordinator.handleUserResponse(userMessage);
  }

  /**
   * Build workflow (simplified implementation until LangGraph is available)
   */
  private buildWorkflow(): any {
    // Simplified workflow implementation
    return {
      invoke: async (state: FirstOfficerState): Promise<FirstOfficerState> => {
        try {
          // Execute workflow steps sequentially
          let currentState = await this.analyzeObjective(state);
          if (currentState.currentPhase === 'failed') return currentState;
          
          currentState = await this.planTasks(currentState);
          if (currentState.currentPhase === 'failed') return currentState;
          
          currentState = await this.selectAgents(currentState);
          if (currentState.currentPhase === 'failed') return currentState;
          
          currentState = await this.assignTasks(currentState);
          if (currentState.currentPhase === 'failed') return currentState;
          
          currentState = await this.monitorProgress(currentState);
          if (currentState.currentPhase === 'failed') return currentState;
          
          currentState = await this.synthesizeResults(currentState);
          return currentState;
        } catch (error) {
          return {
            ...state,
            currentPhase: 'failed',
            errors: [...(state.errors || []), `Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
            lastUpdated: new Date().toISOString()
          };
        }
      }
    };
  }

  /**
   * Workflow Node: Analyze Objective
   */
  private async analyzeObjective(state: FirstOfficerState): Promise<FirstOfficerState> {
    console.log(`🔍 [FIRST-OFFICER] Analyzing objective: ${state.requirements}`);
    
    try {
      state.currentPhase = 'analyzing';
      
      const analysis = await this.performObjectiveAnalysis(state.requirements);
      
      await this.chatCoordinator.sendCoordinationMessage(
        'phase-update',
        'analyzing',
        `📋 **Objective Analysis Complete**\n\n` +
        `**Complexity:** ${analysis.complexity}\n` +
        `**Estimated Duration:** ${analysis.estimatedDuration} minutes\n` +
        `**Required Skills:** ${analysis.requiredSkills.join(', ')}\n` +
        `**Approach:** ${analysis.approach}\n\n` +
        `**Success Criteria:**\n${analysis.successCriteria.map(c => `• ${c}`).join('\n')}`
      );

      return {
        ...state,
        currentPhase: 'decomposing',
        objectiveAnalysis: analysis,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Objective analysis failed:', error);
      return {
        ...state,
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Objective analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Plan Tasks
   */
  private async planTasks(state: FirstOfficerState): Promise<FirstOfficerState> {
    console.log(`📋 [FIRST-OFFICER] Planning tasks for expedition`);
    
    try {
      state.currentPhase = 'decomposing';
      
      const taskPlan = await this.createTaskPlan(state.requirements, state.objectiveAnalysis!);
      
      // Create tasks in database
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const createdTasks: TaskBreakdown[] = [];
      
      for (const task of taskPlan.tasks) {
        const createdTask = await taskRepo.create({
          expeditionId: state.expeditionId,
          title: task.description.substring(0, 100),
          description: task.description,
          requiredSkills: task.requiredSkills,
          status: 'pending',
          priority: 'medium',
          dependencies: task.dependencies,
          deliverable: task.deliverable,
          estimatedEffort: task.estimatedEffort,
          updatedAt: new Date().toISOString()
        });
        
        createdTasks.push({
          ...task,
          id: createdTask.id
        });
      }

      await this.chatCoordinator.sendCoordinationMessage(
        'phase-update',
        'decomposing',
        `📝 **Task Planning Complete**\n\n` +
        `**Total Tasks:** ${createdTasks.length}\n` +
        `**Estimated Total Time:** ${taskPlan.estimatedTotalTime} minutes\n` +
        `**Execution Approach:** ${taskPlan.parallelGroups.length > 1 ? 'Parallel' : 'Sequential'}\n\n` +
        `**Tasks Created:**\n${createdTasks.map(t => `• ${t.description}`).join('\n')}`
      );

      return {
        ...state,
        currentPhase: 'assigning',
        taskPlan,
        taskBreakdown: createdTasks,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Task planning failed:', error);
      return {
        ...state,
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Task planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Select Agents
   */
  private async selectAgents(state: FirstOfficerState): Promise<FirstOfficerState> {
    console.log(`👥 [FIRST-OFFICER] Selecting agents for tasks`);
    
    try {
      state.currentPhase = 'assigning';
      
      await this.agentSelector.initialize();
      
      const assignments = await this.agentSelector.selectAgents(
        state.taskBreakdown,
        {
          requiredSkills: state.objectiveAnalysis?.requiredSkills || [],
          workloadBalance: true
        }
      );

      for (const assignment of assignments) {
        await this.chatCoordinator.sendTaskAssignment(
          assignment.agentName,
          assignment.assignedTasks.join(', '),
          `Tasks assigned based on skill match: ${Math.round(assignment.skillMatch * 100)}%`
        );
      }

      return {
        ...state,
        currentPhase: 'coordinating',
        selectedAgents: assignments,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Agent selection failed:', error);
      return {
        ...state,
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Agent selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Assign Tasks
   */
  private async assignTasks(state: FirstOfficerState): Promise<FirstOfficerState> {
    console.log(`⚡ [FIRST-OFFICER] Assigning tasks to agents`);
    
    try {
      // Assign tasks in database
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      
      for (const assignment of state.selectedAgents || []) {
        for (const taskId of assignment.assignedTasks) {
          await taskRepo.assignToAgent(taskId, assignment.agentId);
        }
      }

      return {
        ...state,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Task assignment failed:', error);
      return {
        ...state,
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Task assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Monitor Progress
   */
  private async monitorProgress(state: FirstOfficerState): Promise<FirstOfficerState> {
    console.log(`📊 [FIRST-OFFICER] Monitoring task execution progress`);
    
    try {
      // Start task execution
      const completionObservable = await this.taskExecutor.executeTasks(
        state.taskBreakdown,
        state.selectedAgents || [],
        state.expeditionId,
        state.userId,
        {
          parallelExecution: this.config.enableParallelExecution,
          timeout: this.config.timeoutMinutes,
          retryLimit: this.config.maxRetries,
          qualityThreshold: this.config.qualityThreshold
        }
      );

      // Collect completed tasks
      const completedTasks: CompletedTask[] = [];
      
      return new Promise((resolve) => {
        completionObservable.subscribe({
          next: async (completedTask: CompletedTask) => {
            console.log(`✅ [FIRST-OFFICER] Task completed: ${completedTask.taskId}`);
            completedTasks.push(completedTask);
            
            // Validate quality
            const task = state.taskBreakdown.find(t => t.id === completedTask.taskId);
            if (task) {
              const qualityCheck = await this.qualityValidator.validateTaskResult(
                task,
                completedTask.result,
                completedTask.agentId
              );
              
              await this.chatCoordinator.sendQualityReview(
                task.description,
                qualityCheck.score,
                qualityCheck.approved,
                qualityCheck.issues
              );
              
              if (!qualityCheck.approved && this.qualityValidator.shouldRetryTask(task.id)) {
                console.log(`🔄 [FIRST-OFFICER] Task needs retry: ${task.id}`);
                // Retry logic would be handled here
              }
            }
            
            // Send progress update
            const progress = this.calculateProgress(state, completedTasks);
            await this.chatCoordinator.sendProgressReport(progress);
            
            // Check if all tasks completed
            if (completedTasks.length >= state.taskBreakdown.length) {
              resolve({
                ...state,
                currentPhase: 'synthesizing',
                completedTasks,
                lastUpdated: new Date().toISOString()
              });
            }
          },
          error: (error: any) => {
            console.error('❌ [FIRST-OFFICER] Task execution error:', error);
            resolve({
              ...state,
              currentPhase: 'failed',
              errors: [...(state.errors || []), `Task execution failed: ${error.message}`],
              lastUpdated: new Date().toISOString()
            });
          }
        });
      });
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Progress monitoring failed:', error);
      return {
        ...state,
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Progress monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Synthesize Results
   */
  private async synthesizeResults(state: FirstOfficerState): Promise<FirstOfficerState> {
    console.log(`🔧 [FIRST-OFFICER] Synthesizing expedition results`);
    
    try {
      state.currentPhase = 'synthesizing';
      
      const finalResult = await this.synthesizeFinalResult(
        state.requirements,
        state.completedTasks || []
      );

      // Create expedition result
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      await resultRepo.create({
        expeditionId: state.expeditionId,
        title: 'Final Expedition Report',
        description: 'Comprehensive results from expedition execution',
        content: finalResult,
        resultType: 'final-report',
        format: 'markdown',
        quality: {
          overall: this.calculateOverallQuality(state.completedTasks || []),
          completeness: 100,
          accuracy: 95,
          relevance: 100,
          clarity: 90,
          assessedBy: 'first-officer',
          assessedAt: new Date().toISOString()
        },
        createdBy: 'first-officer',
        updatedAt: new Date().toISOString()
      });

      return {
        ...state,
        currentPhase: 'completed',
        finalResult,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Result synthesis failed:', error);
      return {
        ...state,
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Result synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Perform objective analysis using LLM
   */
  private async performObjectiveAnalysis(objective: string): Promise<ObjectiveAnalysis> {
    const prompt = buildPrompt(
      `You are the First Officer's analysis system. Analyze the given objective and provide a structured assessment.

RESPONSE FORMAT (JSON):
{
  "complexity": "simple|moderate|complex|expert",
  "estimatedDuration": 60,
  "requiredSkills": ["skill1", "skill2"],
  "riskFactors": ["risk1", "risk2"],
  "successCriteria": ["criteria1", "criteria2"],
  "approach": "sequential|parallel|hybrid"
}`,
      [],
      `Analyze this expedition objective: ${objective}`
    );

    try {
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const response = await provider.complete(prompt);
      
      const jsonMatch = response.reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('LLM analysis failed, using fallback:', error);
    }

    // Fallback analysis
    return {
      complexity: 'moderate',
      estimatedDuration: 60,
      requiredSkills: ['general'],
      riskFactors: ['complexity', 'time constraints'],
      successCriteria: ['complete objective', 'meet quality standards'],
      approach: 'hybrid'
    };
  }

  /**
   * Create task plan from objective and analysis
   */
  private async createTaskPlan(objective: string, analysis: ObjectiveAnalysis): Promise<TaskPlan> {
    const prompt = buildPrompt(
      `You are the First Officer's task planning system. Break down the objective into executable tasks.

RESPONSE FORMAT (JSON):
{
  "tasks": [
    {
      "id": "task-1",
      "description": "Task description",
      "requiredSkills": ["skill1"],
      "deliverable": "Expected output",
      "dependencies": [],
      "estimatedEffort": 30
    }
  ],
  "dependencies": {"task-1": []},
  "criticalPath": ["task-1"],
  "parallelGroups": [["task-1"]],
  "estimatedTotalTime": 60
}`,
      [],
      `Create a task plan for: ${objective}\n\nAnalysis: ${JSON.stringify(analysis)}`
    );

    try {
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const response = await provider.complete(prompt);
      
      const jsonMatch = response.reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('LLM task planning failed, using fallback:', error);
    }

    // Fallback task plan
    return {
      tasks: [{
        id: 'task-1',
        description: objective,
        requiredSkills: analysis.requiredSkills,
        assignedAgentId: undefined,
        status: 'pending',
        deliverable: 'Complete the objective',
        dependencies: [],
        estimatedEffort: analysis.estimatedDuration
      }],
      dependencies: {},
      criticalPath: ['task-1'],
      parallelGroups: [['task-1']],
      estimatedTotalTime: analysis.estimatedDuration
    };
  }

  /**
   * Synthesize final result from completed tasks
   */
  private async synthesizeFinalResult(objective: string, completedTasks: CompletedTask[]): Promise<string> {
    const taskResults = completedTasks.map(task => 
      `**Task ${task.taskId}:**\n${task.result}`
    ).join('\n\n');

    const prompt = buildPrompt(
      `You are the First Officer's result synthesis system. Combine individual task results into a comprehensive final report.

Create a well-structured final report that:
1. Summarizes the objective completion
2. Integrates all task results coherently
3. Highlights key achievements
4. Provides actionable insights
5. Maintains professional formatting`,
      [],
      `OBJECTIVE: ${objective}\n\nTASK RESULTS:\n${taskResults}\n\nSynthesize these into a comprehensive final report.`
    );

    try {
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const response = await provider.complete(prompt);
      return response.reply;
    } catch (error) {
      console.warn('LLM synthesis failed, using fallback:', error);
      return `# Expedition Report\n\n**Objective:** ${objective}\n\n**Results:**\n${taskResults}`;
    }
  }

  /**
   * Build progress from current state
   */
  private buildProgressFromState(state: FirstOfficerState): ExpeditionProgress {
    const totalTasks = state.taskBreakdown.length;
    const completedTasks = state.completedTasks?.length || 0;
    const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      expeditionId: state.expeditionId,
      currentPhase: state.currentPhase,
      overallProgress,
      tasksCompleted: completedTasks,
      tasksTotal: totalTasks,
      estimatedTimeRemaining: Math.max(0, (totalTasks - completedTasks) * 30),
      qualityScore: this.calculateOverallQuality(state.completedTasks || []),
      issues: state.errors || []
    };
  }

  /**
   * Calculate progress during execution
   */
  private calculateProgress(state: FirstOfficerState, completedTasks: CompletedTask[]): ExpeditionProgress {
    const totalTasks = state.taskBreakdown.length;
    const overallProgress = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

    return {
      expeditionId: state.expeditionId,
      currentPhase: state.currentPhase,
      overallProgress,
      tasksCompleted: completedTasks.length,
      tasksTotal: totalTasks,
      estimatedTimeRemaining: Math.max(0, (totalTasks - completedTasks.length) * 30),
      qualityScore: this.calculateOverallQuality(completedTasks),
      issues: state.errors || []
    };
  }

  /**
   * Calculate overall quality score
   */
  private calculateOverallQuality(completedTasks: CompletedTask[]): number {
    if (completedTasks.length === 0) return 0;
    
    const totalQuality = completedTasks.reduce((sum, task) => 
      sum + (task.qualityScore || 75), 0
    );
    
    return Math.round(totalQuality / completedTasks.length);
  }

  /**
   * Calculate expedition statistics
   */
  private calculateExpeditionStats(state: FirstOfficerState) {
    const completedTasks = state.completedTasks || [];
    const totalDuration = completedTasks.reduce((sum, task) => sum + task.actualDuration, 0);
    
    return {
      totalTasks: state.taskBreakdown.length,
      completedTasks: completedTasks.length,
      duration: totalDuration,
      qualityScore: this.calculateOverallQuality(completedTasks)
    };
  }

  /**
   * Get current expedition status
   */
  async getExpeditionStatus(expeditionId: string): Promise<ExpeditionProgress | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition || !expedition.workflowState) {
        return null;
      }

      const state = expedition.workflowState as FirstOfficerState;
      return this.buildProgressFromState(state);
    } catch (error) {
      console.error('Failed to get expedition status:', error);
      return null;
    }
  }
}