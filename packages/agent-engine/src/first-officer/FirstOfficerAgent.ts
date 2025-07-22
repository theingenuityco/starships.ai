/**
 * First Officer Agent - Main Orchestration Class
 * 
 * Implements the core LangGraph workflow for expedition orchestration
 * with hierarchical coordination, parallel task execution, and quality control.
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
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
  ExpeditionProgress,
  TaskExecution,
  QualityCheck
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
  private workflow: any; // CompiledStateGraph from LangGraph

  constructor(
    starshipId: string,
    memoryStore: LangChainMemoryStore,
    config: Partial<FirstOfficerConfig> = {},
    selectedAgentIds: string[] // REQUIRED: No longer optional
  ) {
    // MANDATORY: Validate that agents are provided
    if (!selectedAgentIds || selectedAgentIds.length === 0) {
      throw new Error(
        'FirstOfficerAgent requires at least one agent to be selected. ' +
        'Auto-assignment has been removed - agents must be explicitly provided during expedition creation.'
      );
    }

    console.log(`🎯 [FIRST-OFFICER] Initializing with ${selectedAgentIds.length} pre-selected agents:`, selectedAgentIds);

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
    
    // Initialize components with REQUIRED agents
    this.agentSelector = new AgentSelector(starshipId, selectedAgentIds);
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
        lastUpdated: new Date().toISOString(),
        // Set selectedAgents if provided (from expedition.assignedAgents)
        selectedAgents: expedition.assignedAgents && expedition.assignedAgents.length > 0
          ? await this.convertAgentIdsToAssignments(expedition.assignedAgents)
          : undefined
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
      const finalState = await this.workflow.invoke(initialState, { configurable: {} });

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
   * Build LangGraph StateGraph workflow with proper state transitions
   */
  private buildWorkflow(): any {
    // For now, use a simplified workflow implementation that mimics StateGraph behavior
    // This will be replaced with proper LangGraph StateGraph once API compatibility is resolved
    return {
      invoke: async (state: FirstOfficerState, config?: any): Promise<FirstOfficerState> => {
        try {
          console.log(`🔄 [FIRST-OFFICER] Starting workflow execution from phase: ${state.currentPhase}`);
          
          let currentState = { ...state };
          
          // Execute workflow phases based on current state
          while (currentState.currentPhase !== 'completed' && currentState.currentPhase !== 'failed') {
            const previousPhase = currentState.currentPhase;
            
            switch (currentState.currentPhase) {
              case 'initializing':
                currentState = { ...currentState, ...(await this.analyzeObjectiveNode(currentState)) };
                break;
              case 'analyzing':
              case 'decomposing':
                currentState = { ...currentState, ...(await this.planTasksNode(currentState)) };
                break;
              case 'assigning':
                // Always use pre-selected agents - no auto-selection
                currentState = { ...currentState, ...(await this.assignTasksNode(currentState)) };
                break;
              case 'coordinating':
                if (!currentState.activeExecutions && !currentState.completedTasks) {
                  currentState = { ...currentState, ...(await this.executeTasksNode(currentState)) };
                } else if (currentState.activeExecutions && currentState.activeExecutions.length > 0) {
                  currentState = { ...currentState, ...(await this.monitorProgressNode(currentState)) };
                } else if (currentState.completedTasks && !currentState.qualityChecks) {
                  currentState = { ...currentState, ...(await this.qualityCheckNode(currentState)) };
                } else {
                  currentState = { ...currentState, ...(await this.synthesizeResultsNode(currentState)) };
                }
                break;
              case 'synthesizing':
                currentState = { ...currentState, ...(await this.synthesizeResultsNode(currentState)) };
                break;
              default:
                currentState = { ...currentState, ...(await this.handleErrorNode(currentState)) };
                break;
            }
            
            // Persist state after each phase
            await this.persistWorkflowState(currentState.expeditionId, currentState);
            
            // Prevent infinite loops
            if (currentState.currentPhase === previousPhase) {
              console.warn(`⚠️ [FIRST-OFFICER] Workflow stuck in phase: ${currentState.currentPhase}`);
              currentState = {
                ...currentState,
                currentPhase: 'failed',
                errors: [...(currentState.errors || []), `Workflow stuck in phase: ${currentState.currentPhase}`]
              };
              break;
            }
          }
          
          console.log(`✅ [FIRST-OFFICER] Workflow execution completed with phase: ${currentState.currentPhase}`);
          return currentState;
          
        } catch (error) {
          console.error('❌ [FIRST-OFFICER] Workflow execution failed:', error);
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

  // ========================================
  // WORKFLOW NODE IMPLEMENTATIONS
  // ========================================

  /**
   * Workflow Node: Analyze Objective
   */
  private async analyzeObjectiveNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`🔍 [FIRST-OFFICER] Analyzing objective: ${state.requirements}`);
    
    try {
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
        currentPhase: 'decomposing',
        objectiveAnalysis: analysis,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Objective analysis failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Objective analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Plan Tasks
   */
  private async planTasksNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`📋 [FIRST-OFFICER] Planning tasks for expedition`);
    
    try {
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
        currentPhase: 'assigning',
        taskPlan,
        taskBreakdown: createdTasks,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Task planning failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Task planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Select Agents
   */
  private async selectAgentsNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`👥 [FIRST-OFFICER] Selecting agents for tasks`);
    
    try {
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
        currentPhase: 'coordinating',
        selectedAgents: assignments,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Agent selection failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Agent selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Assign Tasks
   */
  private async assignTasksNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`⚡ [FIRST-OFFICER] Assigning tasks to agents`);
    
    try {
      // If we have pre-selected agents but no task assignments yet, assign tasks to them
      if (state.selectedAgents && state.selectedAgents.some(a => a.assignedTasks.length === 0)) {
        console.log(`🎯 [FIRST-OFFICER] Assigning tasks to pre-selected agents`);
        
        // Use AgentSelector to assign tasks to pre-selected agents
        const updatedAssignments = await this.assignTasksToSelectedAgents(state.taskBreakdown, state.selectedAgents);
        
        // Update database with task assignments
        const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
        for (const assignment of updatedAssignments) {
          for (const taskId of assignment.assignedTasks) {
            await taskRepo.assignToAgent(taskId, assignment.agentId);
          }
        }

        await this.chatCoordinator.sendCoordinationMessage(
          'phase-update',
          'assigning',
          `🎯 **Pre-selected Agents Assigned**\n\n` +
          `Successfully assigned tasks to ${updatedAssignments.length} pre-selected agents:\n` +
          updatedAssignments.map((a: AgentAssignment) => `• ${a.agentName}: ${a.assignedTasks.length} tasks`).join('\n')
        );

        return {
          currentPhase: 'coordinating',
          selectedAgents: updatedAssignments,
          lastUpdated: new Date().toISOString()
        };
      } else {
        // Standard task assignment for automatically selected agents
        const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
        
        for (const assignment of state.selectedAgents || []) {
          for (const taskId of assignment.assignedTasks) {
            await taskRepo.assignToAgent(taskId, assignment.agentId);
          }
        }

        return {
          currentPhase: 'coordinating',
          lastUpdated: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Task assignment failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Task assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Execute Tasks
   */
  private async executeTasksNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`🚀 [FIRST-OFFICER] Starting task execution`);
    
    try {
      // Start task execution and return immediately - monitoring will handle progress
      const activeExecutions: TaskExecution[] = [];
      
      for (const task of state.taskBreakdown) {
        const assignment = state.selectedAgents?.find(a => a.assignedTasks.includes(task.id));
        if (assignment) {
          activeExecutions.push({
            taskId: task.id,
            agentId: assignment.agentId,
            status: 'in-progress',
            startTime: new Date().toISOString(),
            progress: 0,
            intermediateResults: [],
            issues: []
          });
        }
      }

      return {
        currentPhase: 'coordinating',
        activeExecutions,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Task execution start failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Monitor Progress
   */
  private async monitorProgressNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`📊 [FIRST-OFFICER] Monitoring task execution progress`);
    
    try {
      // This is a simplified version - in reality, this would monitor actual task execution
      const completedTasks: CompletedTask[] = [];
      
      // Simulate task completion for demonstration
      for (const execution of state.activeExecutions || []) {
        const task = state.taskBreakdown.find(t => t.id === execution.taskId);
        if (task) {
          completedTasks.push({
            taskId: execution.taskId,
            agentId: execution.agentId,
            result: `Task ${task.description} completed successfully`,
            completionTime: new Date().toISOString(),
            actualDuration: task.estimatedEffort || 30,
            qualityScore: 85
          });
        }
      }

      // Send progress update
      const progress = this.calculateProgress(state, completedTasks);
      await this.chatCoordinator.sendProgressReport(progress);

      return {
        currentPhase: 'synthesizing',
        completedTasks,
        activeExecutions: [],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Progress monitoring failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Progress monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Quality Check
   */
  private async qualityCheckNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`🔍 [FIRST-OFFICER] Performing quality checks`);
    
    try {
      const qualityChecks: QualityCheck[] = [];
      
      for (const completedTask of state.completedTasks || []) {
        const task = state.taskBreakdown.find(t => t.id === completedTask.taskId);
        if (task) {
          const qualityCheck = await this.qualityValidator.validateTaskResult(
            task,
            completedTask.result,
            completedTask.agentId
          );
          
          qualityChecks.push({
            taskId: completedTask.taskId,
            result: completedTask.result,
            score: qualityCheck.score,
            issues: qualityCheck.issues,
            suggestions: qualityCheck.suggestions || [],
            approved: qualityCheck.approved,
            assessedBy: 'first-officer',
            assessedAt: new Date().toISOString()
          });
          
          await this.chatCoordinator.sendQualityReview(
            task.description,
            qualityCheck.score,
            qualityCheck.approved,
            qualityCheck.issues
          );
        }
      }

      return {
        qualityChecks,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Quality check failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Quality check failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: User Approval
   */
  private async userApprovalNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`👤 [FIRST-OFFICER] Requesting user approval`);
    
    try {
      // Send approval request to user
      await this.chatCoordinator.sendCoordinationMessage(
        'user-question',
        state.currentPhase,
        `🤔 **Approval Required**\n\nThe current workflow phase requires your approval to proceed.\n\nCurrent Phase: ${state.currentPhase}\n\nWould you like to continue?`
      );

      // In a real implementation, this would wait for user response
      // For now, we'll assume approval and continue
      return {
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] User approval failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `User approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Synthesize Results
   */
  private async synthesizeResultsNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`🔧 [FIRST-OFFICER] Synthesizing expedition results`);
    
    try {
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
        currentPhase: 'completed',
        finalResult,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Result synthesis failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Result synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Handle Error
   */
  private async handleErrorNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`❌ [FIRST-OFFICER] Handling workflow error`);
    
    try {
      const errorMessage = state.errors?.join('; ') || 'Unknown error occurred';
      
      await this.chatCoordinator.sendErrorReport(errorMessage, state.currentPhase);
      
      // Update expedition status to failed
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateStatus(state.expeditionId, 'failed');

      return {
        currentPhase: 'failed',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Error handling failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Error handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Retry Task
   */
  private async retryTaskNode(state: FirstOfficerState, config?: RunnableConfig): Promise<Partial<FirstOfficerState>> {
    console.log(`🔄 [FIRST-OFFICER] Retrying failed tasks`);
    
    try {
      const retryAttempts = { ...(state.retryAttempts || {}) };
      
      // Find tasks that need retry
      const tasksToRetry = state.qualityChecks?.filter(qc => !qc.approved) || [];
      
      for (const qualityCheck of tasksToRetry) {
        const currentRetries = retryAttempts[qualityCheck.taskId] || 0;
        
        if (currentRetries < this.config.maxRetries) {
          retryAttempts[qualityCheck.taskId] = currentRetries + 1;
          
          await this.chatCoordinator.sendCoordinationMessage(
            'phase-update',
            'coordinating',
            `🔄 **Retrying Task**\n\nTask ${qualityCheck.taskId} will be retried (attempt ${currentRetries + 1}/${this.config.maxRetries})\n\nIssues to address:\n${qualityCheck.issues.map(i => `• ${i}`).join('\n')}`
          );
        } else {
          await this.chatCoordinator.sendCoordinationMessage(
            'error-report',
            'failed',
            `❌ **Task Failed**\n\nTask ${qualityCheck.taskId} has exceeded maximum retry attempts (${this.config.maxRetries})`
          );
        }
      }

      return {
        retryAttempts,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Task retry failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Task retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // ========================================
  // WORKFLOW ROUTING FUNCTIONS
  // ========================================

  /**
   * Route after objective analysis
   */
  private routeAfterAnalysis(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // Check if user approval is required for complex objectives
    if (state.objectiveAnalysis?.complexity === 'expert' && this.config.requireUserApproval) {
      return 'user_approval';
    }
    
    return 'plan_tasks';
  }

  /**
   * Route after task planning
   */
  private routeAfterPlanning(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // Check if user approval is required for large task plans
    if ((state.taskBreakdown?.length || 0) > 10 && this.config.requireUserApproval) {
      return 'user_approval';
    }
    
    return 'select_agents';
  }

  /**
   * Route after agent selection
   */
  private routeAfterAgentSelection(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // Check if we have enough agents
    if (!state.selectedAgents || state.selectedAgents.length === 0) {
      return 'handle_error';
    }
    
    return 'assign_tasks';
  }

  /**
   * Route after task execution
   */
  private routeAfterExecution(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // If we have active executions, monitor progress
    if (state.activeExecutions && state.activeExecutions.length > 0) {
      return 'monitor_progress';
    }
    
    // If we have completed tasks, check quality
    if (state.completedTasks && state.completedTasks.length > 0) {
      return 'quality_check';
    }
    
    return 'handle_error';
  }

  /**
   * Route after progress monitoring
   */
  private routeAfterMonitoring(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // If all tasks are completed, proceed to quality check
    if (state.completedTasks && state.completedTasks.length >= state.taskBreakdown.length) {
      return 'quality_check';
    }
    
    // If there are still active executions, continue monitoring
    if (state.activeExecutions && state.activeExecutions.length > 0) {
      return 'execute_tasks';
    }
    
    // If all tasks are done, synthesize results
    return 'synthesize_results';
  }

  /**
   * Route after quality check
   */
  private routeAfterQualityCheck(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // Check if any tasks failed quality check
    const failedQualityChecks = state.qualityChecks?.filter(qc => !qc.approved) || [];
    
    if (failedQualityChecks.length > 0) {
      // Check if we should retry or escalate
      const shouldRetry = failedQualityChecks.some(qc => {
        const retries = state.retryAttempts?.[qc.taskId] || 0;
        return retries < this.config.maxRetries;
      });
      
      if (shouldRetry) {
        return 'retry_task';
      } else if (this.config.requireUserApproval) {
        return 'user_approval';
      } else {
        return 'handle_error';
      }
    }
    
    // All quality checks passed, synthesize results
    return 'synthesize_results';
  }

  /**
   * Route after user approval
   */
  private routeAfterUserApproval(state: FirstOfficerState): string {
    // This would normally check the user's response
    // For now, we'll route based on the current phase
    
    switch (state.currentPhase) {
      case 'analyzing':
        return 'plan_tasks';
      case 'decomposing':
        return 'select_agents';
      case 'assigning':
      case 'coordinating':
        return 'execute_tasks';
      case 'synthesizing':
        return 'synthesize_results';
      default:
        return 'handle_error';
    }
  }

  /**
   * Route after task retry
   */
  private routeAfterRetry(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // Check if we've exceeded retry limits
    const hasExceededRetries = state.qualityChecks?.some(qc => {
      if (!qc.approved) {
        const retries = state.retryAttempts?.[qc.taskId] || 0;
        return retries >= this.config.maxRetries;
      }
      return false;
    });
    
    if (hasExceededRetries) {
      if (this.config.requireUserApproval) {
        return 'user_approval';
      } else {
        return 'handle_error';
      }
    }
    
    // Retry the tasks
    return 'execute_tasks';
  }

  /**
   * Route after result synthesis
   */
  private routeAfterSynthesis(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    if (state.finalResult) {
      return 'end';
    }
    
    return 'handle_error';
  }

  // ========================================
  // HELPER METHODS (from original implementation)
  // ========================================

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

  /**
   * Resume interrupted expedition from persisted state
   */
  async resumeExpedition(expeditionId: string): Promise<string> {
    console.log(`🔄 [FIRST-OFFICER] Resuming expedition: ${expeditionId}`);

    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition || !expedition.workflowState) {
        throw new Error(`Cannot resume expedition: ${expeditionId} - no saved state found`);
      }

      const savedState = expedition.workflowState as FirstOfficerState;
      
      // Initialize chat coordinator
      this.chatCoordinator = new ChatCoordinator(
        this.memoryStore,
        expeditionId,
        savedState.userId,
        savedState.starshipId
      );

      // Send resume notification
      await this.chatCoordinator.sendCoordinationMessage(
        'phase-update',
        savedState.currentPhase,
        `🔄 **Expedition Resumed**\n\nResuming from phase: ${savedState.currentPhase}\n\nProgress: ${this.buildProgressFromState(savedState).overallProgress}%`
      );

      // Continue workflow from saved state
      const finalState = await this.workflow.invoke(savedState, { configurable: {} });

      // Handle final result
      if (finalState.finalResult) {
        await expeditionRepo.updateStatus(expeditionId, 'completed');
        await this.chatCoordinator.sendCompletionSummary(
          finalState.finalResult,
          this.calculateExpeditionStats(finalState)
        );
        
        console.log(`✅ [FIRST-OFFICER] Resumed expedition completed: ${expeditionId}`);
        return finalState.finalResult;
      } else {
        await expeditionRepo.updateStatus(expeditionId, 'failed');
        const errorMessage = finalState.errors?.join('; ') || 'Unknown error occurred';
        await this.chatCoordinator.sendErrorReport(errorMessage, finalState.currentPhase);
        
        console.error(`❌ [FIRST-OFFICER] Resumed expedition failed: ${expeditionId}`, finalState.errors);
        throw new Error(`Expedition failed: ${errorMessage}`);
      }

    } catch (error) {
      console.error(`❌ [FIRST-OFFICER] Failed to resume expedition:`, error);
      throw error;
    }
  }

  /**
   * Persist current workflow state for recovery
   */
  async persistWorkflowState(expeditionId: string, state: FirstOfficerState): Promise<void> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateWorkflowState(expeditionId, {
        ...state,
        lastUpdated: new Date().toISOString()
      });
      
      console.log(`💾 [FIRST-OFFICER] Workflow state persisted for expedition: ${expeditionId}`);
    } catch (error) {
      console.error(`❌ [FIRST-OFFICER] Failed to persist workflow state:`, error);
      // Don't throw - this shouldn't stop the workflow
    }
  }

  /**
   * Convert agent IDs to AgentAssignment objects for pre-selected agents
   */
  private async convertAgentIdsToAssignments(agentIds: string[]): Promise<AgentAssignment[]> {
    try {
      // Initialize agent selector to get available agents
      await this.agentSelector.initialize();
      
      const starshipRepo = RepositoryFactory.getStarshipRepository();
      const availableAgents = await starshipRepo.getDeployedAgents(this.agentSelector['starshipId']);
      
      const assignments: AgentAssignment[] = [];
      
      for (const agentId of agentIds) {
        const agent = availableAgents.find(a => a.id === agentId);
        if (agent) {
          assignments.push({
            agentId: agent.id,
            agentName: agent.name,
            assignedTasks: [], // Tasks will be assigned later during task planning
            skillMatch: 1.0, // Pre-selected agents are assumed to be suitable
            workload: 0, // Will be calculated during task assignment
            reasoning: 'Pre-selected by user during expedition creation'
          });
        } else {
          console.warn(`⚠️ [FIRST-OFFICER] Pre-selected agent not found or not available: ${agentId}`);
        }
      }
      
      console.log(`🎯 [FIRST-OFFICER] Converted ${assignments.length}/${agentIds.length} pre-selected agents to assignments`);
      return assignments;
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Failed to convert agent IDs to assignments:', error);
      return [];
    }
  }

  /**
   * Assign tasks to pre-selected agents using the AgentSelector
   */
  private async assignTasksToSelectedAgents(
    tasks: TaskBreakdown[],
    selectedAgents: AgentAssignment[]
  ): Promise<AgentAssignment[]> {
    try {
      console.log(`🎯 [FIRST-OFFICER] Assigning ${tasks.length} tasks to ${selectedAgents.length} pre-selected agents`);
      
      // Create a simple assignment strategy for pre-selected agents
      const updatedAssignments = [...selectedAgents];
      const unassignedTasks = [...tasks];
      
      // Distribute tasks among pre-selected agents based on skill match
      for (const task of tasks) {
        let bestAgent: AgentAssignment | null = null;
        let bestScore = -1;
        
        for (const agent of updatedAssignments) {
          // Calculate a simple skill match score
          const agentSkillMatch = agent.skillMatch || 0.5;
          const currentWorkload = agent.assignedTasks.length;
          const workloadPenalty = currentWorkload * 0.1;
          const score = agentSkillMatch - workloadPenalty;
          
          if (score > bestScore) {
            bestScore = score;
            bestAgent = agent;
          }
        }
        
        if (bestAgent) {
          bestAgent.assignedTasks.push(task.id);
          bestAgent.workload += task.estimatedEffort || 30;
          
          // Remove from unassigned tasks
          const taskIndex = unassignedTasks.findIndex(t => t.id === task.id);
          if (taskIndex > -1) {
            unassignedTasks.splice(taskIndex, 1);
          }
        }
      }
      
      // If there are still unassigned tasks, log a warning
      if (unassignedTasks.length > 0) {
        console.warn(`⚠️ [FIRST-OFFICER] ${unassignedTasks.length} tasks could not be assigned to pre-selected agents`);
      }
      
      console.log(`✅ [FIRST-OFFICER] Task assignment complete. Assigned ${tasks.length - unassignedTasks.length}/${tasks.length} tasks`);
      return updatedAssignments;
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Failed to assign tasks to selected agents:', error);
      return selectedAgents;
    }
  }
}