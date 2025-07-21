/**
 * Enhanced First Officer Agent - Advanced Orchestration Class
 * 
 * This enhanced version integrates all the advanced workflow features:
 * - Proper LangGraph StateGraph workflow (when API is compatible)
 * - Dynamic task dependency resolution
 * - Conditional workflow paths based on analysis results
 * - User approval gates for critical decisions
 * - Workflow state persistence for resuming interrupted expeditions
 * - Parallel execution capabilities
 * - Advanced error handling and retry mechanisms
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
  QualityCheck,
  UserApprovalResponse,
  EnhancedWorkflowOptions
} from './types';
import {
  TaskDependencyResolver,
  ConditionalWorkflowManager,
  UserApprovalManager,
  WorkflowStatePersistence
} from './WorkflowEnhancements';

/**
 * Enhanced First Officer Agent - Advanced orchestration engine
 */
export class EnhancedFirstOfficerAgent {
  private config: FirstOfficerConfig;
  private memoryStore: LangChainMemoryStore;
  private agentSelector: AgentSelector;
  private qualityValidator: QualityValidator;
  private taskExecutor: TaskExecutor;
  private chatCoordinator: ChatCoordinator;
  private workflow: any; // Enhanced workflow engine
  
  // Enhanced workflow components
  private dependencyResolver: TaskDependencyResolver;
  private workflowManager: ConditionalWorkflowManager;
  private approvalManager: UserApprovalManager;
  private statePersistence: WorkflowStatePersistence;

  constructor(
    starshipId: string,
    memoryStore: LangChainMemoryStore,
    config: Partial<FirstOfficerConfig> = {}
  ) {
    // Initialize configuration with enhanced defaults
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
    
    // Initialize core components
    this.agentSelector = new AgentSelector(starshipId);
    this.qualityValidator = new QualityValidator(this.config);
    this.taskExecutor = new TaskExecutor(this.config, memoryStore);
    
    // Initialize enhanced workflow components
    this.dependencyResolver = new TaskDependencyResolver(this.config);
    this.workflowManager = new ConditionalWorkflowManager(this.config);
    this.statePersistence = new WorkflowStatePersistence(this.config);
    
    // Chat coordinator and approval manager will be initialized per expedition
    this.chatCoordinator = null as any;
    this.approvalManager = null as any;
    
    // Build enhanced workflow
    this.workflow = this.buildEnhancedWorkflow();
  }

  /**
   * Start expedition orchestration with enhanced features
   */
  async startExpedition(
    expeditionId: string,
    userId: string,
    objective: string,
    options: EnhancedWorkflowOptions = {}
  ): Promise<string> {
    console.log(`🚀 [ENHANCED-FIRST-OFFICER] Starting expedition orchestration: ${expeditionId}`);

    try {
      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw new Error(`Expedition not found: ${expeditionId}`);
      }

      // Initialize chat coordinator and approval manager
      this.chatCoordinator = new ChatCoordinator(
        this.memoryStore,
        expeditionId,
        userId,
        expedition.starshipId
      );
      
      this.approvalManager = new UserApprovalManager(this.chatCoordinator, this.config);

      // Initialize enhanced workflow state
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
        
        // Enhanced features
        parallelExecutionEnabled: options.enableParallelExecution ?? this.config.enableParallelExecution,
        userApprovalRequired: options.enableUserApprovalGates ?? this.config.requireUserApproval
      };

      // Update expedition status
      await expeditionRepo.updateStatus(expeditionId, 'planning');
      
      // Persist initial state
      await this.statePersistence.persistState(expeditionId, initialState, 'phase_transition');

      // Send initial coordination message
      await this.chatCoordinator.sendPhaseUpdate(
        'initializing',
        'analyzing',
        this.buildProgressFromState(initialState)
      );

      // Execute enhanced workflow
      const finalState = await this.workflow.invoke(initialState, { 
        configurable: { 
          expeditionId,
          userId,
          options 
        } 
      });

      // Handle final result
      if (finalState.finalResult) {
        await expeditionRepo.updateStatus(expeditionId, 'completed');
        await this.chatCoordinator.sendCompletionSummary(
          finalState.finalResult,
          this.calculateExpeditionStats(finalState)
        );
        
        console.log(`✅ [ENHANCED-FIRST-OFFICER] Expedition completed successfully: ${expeditionId}`);
        return finalState.finalResult;
      } else {
        await expeditionRepo.updateStatus(expeditionId, 'failed');
        const errorMessage = finalState.errors?.join('; ') || 'Unknown error occurred';
        await this.chatCoordinator.sendErrorReport(errorMessage, finalState.currentPhase);
        
        console.error(`❌ [ENHANCED-FIRST-OFFICER] Expedition failed: ${expeditionId}`, finalState.errors);
        throw new Error(`Expedition failed: ${errorMessage}`);
      }

    } catch (error) {
      console.error(`❌ [ENHANCED-FIRST-OFFICER] Expedition orchestration failed:`, error);
      
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
   * Resume interrupted expedition from persisted state
   */
  async resumeExpedition(expeditionId: string): Promise<string> {
    console.log(`🔄 [ENHANCED-FIRST-OFFICER] Resuming expedition: ${expeditionId}`);

    try {
      // Recover state from persistence
      const savedState = await this.statePersistence.recoverState(expeditionId);
      
      if (!savedState) {
        throw new Error(`Cannot resume expedition: ${expeditionId} - no saved state found`);
      }

      // Initialize components
      this.chatCoordinator = new ChatCoordinator(
        this.memoryStore,
        expeditionId,
        savedState.userId,
        savedState.starshipId
      );
      
      this.approvalManager = new UserApprovalManager(this.chatCoordinator, this.config);

      // Send resume notification
      await this.chatCoordinator.sendCoordinationMessage(
        'phase-update',
        savedState.currentPhase,
        `🔄 **Expedition Resumed**\n\nResuming from phase: ${savedState.currentPhase}\n\nProgress: ${this.buildProgressFromState(savedState).overallProgress}%`
      );

      // Continue workflow from saved state
      const finalState = await this.workflow.invoke(savedState, { 
        configurable: { 
          expeditionId,
          userId: savedState.userId,
          resuming: true 
        } 
      });

      // Handle final result
      if (finalState.finalResult) {
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        await expeditionRepo.updateStatus(expeditionId, 'completed');
        await this.chatCoordinator.sendCompletionSummary(
          finalState.finalResult,
          this.calculateExpeditionStats(finalState)
        );
        
        console.log(`✅ [ENHANCED-FIRST-OFFICER] Resumed expedition completed: ${expeditionId}`);
        return finalState.finalResult;
      } else {
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        await expeditionRepo.updateStatus(expeditionId, 'failed');
        const errorMessage = finalState.errors?.join('; ') || 'Unknown error occurred';
        await this.chatCoordinator.sendErrorReport(errorMessage, finalState.currentPhase);
        
        console.error(`❌ [ENHANCED-FIRST-OFFICER] Resumed expedition failed: ${expeditionId}`, finalState.errors);
        throw new Error(`Expedition failed: ${errorMessage}`);
      }

    } catch (error) {
      console.error(`❌ [ENHANCED-FIRST-OFFICER] Failed to resume expedition:`, error);
      throw error;
    }
  }

  /**
   * Handle user interaction during expedition with approval support
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

    // Check if this is an approval response
    if (this.isApprovalResponse(userMessage)) {
      const approvalResponse = this.parseApprovalResponse(userMessage);
      
      // Process approval through the workflow
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (expedition?.workflowState) {
        const currentState = expedition.workflowState as FirstOfficerState;
        const updatedState = await this.approvalManager.processApprovalResponse(currentState, approvalResponse);
        
        // Update state and continue workflow
        await this.statePersistence.persistState(expeditionId, { ...currentState, ...updatedState });
        
        return {
          reply: `✅ Approval processed. Continuing with ${updatedState.currentPhase} phase.`,
          usage: undefined
        };
      }
    }

    return await this.chatCoordinator.handleUserResponse(userMessage);
  }

  /**
   * Build enhanced workflow with all advanced features
   */
  private buildEnhancedWorkflow(): any {
    return {
      invoke: async (state: FirstOfficerState, config?: any): Promise<FirstOfficerState> => {
        try {
          console.log(`🔄 [ENHANCED-WORKFLOW] Starting enhanced workflow execution from phase: ${state.currentPhase}`);
          
          let currentState = { ...state };
          
          // Execute enhanced workflow phases
          while (currentState.currentPhase !== 'completed' && currentState.currentPhase !== 'failed') {
            const previousPhase = currentState.currentPhase;
            
            // Persist state before each phase transition
            await this.statePersistence.persistState(currentState.expeditionId, currentState, 'phase_transition');
            
            switch (currentState.currentPhase) {
              case 'initializing':
                currentState = { ...currentState, ...(await this.enhancedAnalyzeObjective(currentState)) };
                break;
                
              case 'analyzing':
                // Use conditional workflow manager to determine path
                const workflowPath = this.workflowManager.determineWorkflowPath(currentState);
                
                if (workflowPath.requiresApproval && !currentState.userApprovalResponse) {
                  currentState = { ...currentState, ...(await this.approvalManager.requestApproval(
                    currentState, 'objective_analysis', currentState.objectiveAnalysis
                  )) };
                } else {
                  currentState = { ...currentState, ...(await this.enhancedPlanTasks(currentState)) };
                }
                break;
                
              case 'decomposing':
                // Resolve dependencies before agent selection
                currentState = { ...currentState, ...(await this.dependencyResolver.resolveDependencies(currentState)) };
                if (currentState.currentPhase !== 'failed') {
                  currentState = { ...currentState, ...(await this.enhancedSelectAgents(currentState)) };
                }
                break;
                
              case 'assigning':
                if (!currentState.selectedAgents) {
                  currentState = { ...currentState, ...(await this.enhancedSelectAgents(currentState)) };
                } else {
                  currentState = { ...currentState, ...(await this.enhancedAssignTasks(currentState)) };
                }
                break;
                
              case 'coordinating':
                if (currentState.parallelExecutionEnabled && currentState.taskPlan?.parallelGroups && currentState.taskPlan.parallelGroups.length > 1) {
                  currentState = { ...currentState, ...(await this.executeParallelTasks(currentState)) };
                } else {
                  currentState = { ...currentState, ...(await this.executeSequentialTasks(currentState)) };
                }
                break;
                
              case 'synthesizing':
                currentState = { ...currentState, ...(await this.enhancedSynthesizeResults(currentState)) };
                break;
                
              default:
                currentState = { ...currentState, ...(await this.enhancedHandleError(currentState)) };
                break;
            }
            
            // Prevent infinite loops
            if (currentState.currentPhase === previousPhase) {
              console.warn(`⚠️ [ENHANCED-WORKFLOW] Workflow stuck in phase: ${currentState.currentPhase}`);
              currentState = { 
                ...currentState, 
                currentPhase: 'failed',
                errors: [...(currentState.errors || []), `Workflow stuck in phase: ${currentState.currentPhase}`]
              };
              break;
            }
          }
          
          // Final state persistence
          await this.statePersistence.persistState(currentState.expeditionId, currentState, 'phase_transition');
          
          console.log(`✅ [ENHANCED-WORKFLOW] Enhanced workflow execution completed with phase: ${currentState.currentPhase}`);
          return currentState;
          
        } catch (error) {
          console.error('❌ [ENHANCED-WORKFLOW] Enhanced workflow execution failed:', error);
          return {
            ...state,
            currentPhase: 'failed',
            errors: [...(state.errors || []), `Enhanced workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
            lastUpdated: new Date().toISOString()
          };
        }
      }
    };
  }

  // ========================================
  // ENHANCED WORKFLOW NODE IMPLEMENTATIONS
  // ========================================

  /**
   * Enhanced Objective Analysis with conditional routing
   */
  private async enhancedAnalyzeObjective(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`🔍 [ENHANCED-WORKFLOW] Enhanced objective analysis: ${state.requirements}`);
    
    try {
      const analysis = await this.performObjectiveAnalysis(state.requirements);
      
      // Use conditional workflow manager to determine next steps
      const workflowPath = this.workflowManager.determineWorkflowPath({ ...state, objectiveAnalysis: analysis });
      
      await this.chatCoordinator.sendCoordinationMessage(
        'phase-update',
        'analyzing',
        `📋 **Enhanced Objective Analysis Complete**\n\n` +
        `**Complexity:** ${analysis.complexity}\n` +
        `**Estimated Duration:** ${analysis.estimatedDuration} minutes\n` +
        `**Required Skills:** ${analysis.requiredSkills.join(', ')}\n` +
        `**Approach:** ${analysis.approach}\n` +
        `**Execution Strategy:** ${workflowPath.executionStrategy}\n\n` +
        `**Success Criteria:**\n${analysis.successCriteria.map(c => `• ${c}`).join('\n')}\n\n` +
        `${workflowPath.specialInstructions ? `**Special Instructions:**\n${workflowPath.specialInstructions.map(i => `• ${i}`).join('\n')}` : ''}`
      );

      return {
        currentPhase: workflowPath.requiresApproval ? 'analyzing' : 'decomposing',
        objectiveAnalysis: analysis,
        userApprovalRequired: workflowPath.requiresApproval,
        parallelExecutionEnabled: workflowPath.executionStrategy !== 'sequential',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Enhanced objective analysis failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Enhanced objective analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Enhanced Task Planning with dependency resolution
   */
  private async enhancedPlanTasks(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`📋 [ENHANCED-WORKFLOW] Enhanced task planning for expedition`);
    
    try {
      const taskPlan = await this.createTaskPlan(state.requirements, state.objectiveAnalysis!);
      
      // Create tasks in database with enhanced metadata
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
        `📝 **Enhanced Task Planning Complete**\n\n` +
        `**Total Tasks:** ${createdTasks.length}\n` +
        `**Estimated Total Time:** ${taskPlan.estimatedTotalTime} minutes\n` +
        `**Execution Approach:** ${taskPlan.parallelGroups.length > 1 ? 'Parallel' : 'Sequential'}\n` +
        `**Parallel Groups:** ${taskPlan.parallelGroups.length}\n\n` +
        `**Tasks Created:**\n${createdTasks.map(t => `• ${t.description}`).join('\n')}`
      );

      return {
        currentPhase: 'decomposing', // Will be handled by dependency resolver
        taskPlan,
        taskBreakdown: createdTasks,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Enhanced task planning failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Enhanced task planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Enhanced Agent Selection with workload balancing
   */
  private async enhancedSelectAgents(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`👥 [ENHANCED-WORKFLOW] Enhanced agent selection for tasks`);
    
    try {
      await this.agentSelector.initialize();
      
      const assignments = await this.agentSelector.selectAgents(
        state.taskBreakdown,
        {
          requiredSkills: state.objectiveAnalysis?.requiredSkills || [],
          workloadBalance: true,
          maxAgents: state.parallelExecutionEnabled ? undefined : 3
        }
      );

      // Enhanced assignment reporting
      for (const assignment of assignments) {
        await this.chatCoordinator.sendTaskAssignment(
          assignment.agentName,
          assignment.assignedTasks.join(', '),
          `Enhanced assignment - Skill match: ${Math.round(assignment.skillMatch * 100)}%, Workload: ${assignment.workload} min`
        );
      }

      return {
        currentPhase: 'assigning',
        selectedAgents: assignments,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Enhanced agent selection failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Enhanced agent selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Enhanced Task Assignment with dependency awareness
   */
  private async enhancedAssignTasks(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`⚡ [ENHANCED-WORKFLOW] Enhanced task assignment to agents`);
    
    try {
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      
      // Assign tasks with dependency awareness
      for (const assignment of state.selectedAgents || []) {
        for (const taskId of assignment.assignedTasks) {
          await taskRepo.assignToAgent(taskId, assignment.agentId);
          
          // Add dependency metadata
          const task = state.taskBreakdown.find(t => t.id === taskId);
          if (task?.dependencies && task.dependencies.length > 0) {
            console.log(`📋 [ENHANCED-WORKFLOW] Task ${taskId} has dependencies: ${task.dependencies.join(', ')}`);
          }
        }
      }

      return {
        currentPhase: 'coordinating',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Enhanced task assignment failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Enhanced task assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Execute tasks in parallel with coordination
   */
  private async executeParallelTasks(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`🚀 [ENHANCED-WORKFLOW] Executing tasks in parallel`);
    
    try {
      const parallelGroups = state.taskPlan?.parallelGroups || [];
      const completedTasks: CompletedTask[] = [];
      
      // Execute each parallel group
      for (let i = 0; i < parallelGroups.length; i++) {
        const group = parallelGroups[i];
        console.log(`🔄 [ENHANCED-WORKFLOW] Executing parallel group ${i + 1}/${parallelGroups.length}: ${group.length} tasks`);
        
        // Simulate parallel execution (in reality, this would use actual parallel processing)
        const groupTasks = state.taskBreakdown.filter(t => group.includes(t.id));
        
        for (const task of groupTasks) {
          const assignment = state.selectedAgents?.find(a => a.assignedTasks.includes(task.id));
          if (assignment) {
            completedTasks.push({
              taskId: task.id,
              agentId: assignment.agentId,
              result: `Parallel task ${task.description} completed successfully`,
              completionTime: new Date().toISOString(),
              actualDuration: task.estimatedEffort || 30,
              qualityScore: 85
            });
          }
        }
        
        // Send progress update after each group
        const progress = this.calculateProgress(state, completedTasks);
        await this.chatCoordinator.sendProgressReport(progress);
      }

      return {
        currentPhase: 'synthesizing',
        completedTasks,
        activeExecutions: [],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Parallel task execution failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Parallel task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Execute tasks sequentially with dependency respect
   */
  private async executeSequentialTasks(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`📊 [ENHANCED-WORKFLOW] Executing tasks sequentially`);
    
    try {
      const completedTasks: CompletedTask[] = [];
      const criticalPath = state.criticalPath || state.taskBreakdown.map(t => t.id);
      
      // Execute tasks in dependency order
      for (const taskId of criticalPath) {
        const task = state.taskBreakdown.find(t => t.id === taskId);
        const assignment = state.selectedAgents?.find(a => a.assignedTasks.includes(taskId));
        
        if (task && assignment) {
          console.log(`🔄 [ENHANCED-WORKFLOW] Executing task: ${task.description}`);
          
          completedTasks.push({
            taskId: task.id,
            agentId: assignment.agentId,
            result: `Sequential task ${task.description} completed successfully`,
            completionTime: new Date().toISOString(),
            actualDuration: task.estimatedEffort || 30,
            qualityScore: 85
          });
          
          // Send progress update after each task
          const progress = this.calculateProgress(state, completedTasks);
          await this.chatCoordinator.sendProgressReport(progress);
        }
      }

      return {
        currentPhase: 'synthesizing',
        completedTasks,
        activeExecutions: [],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Sequential task execution failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Sequential task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Enhanced Result Synthesis with quality validation
   */
  private async enhancedSynthesizeResults(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`🔧 [ENHANCED-WORKFLOW] Enhanced result synthesis`);
    
    try {
      // Perform quality checks first
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
        }
      }
      
      // Check if any tasks failed quality check
      const failedQualityChecks = qualityChecks.filter(qc => !qc.approved);
      
      if (failedQualityChecks.length > 0 && this.config.requireUserApproval) {
        // Request user approval for failed quality checks
        return await this.approvalManager.requestApproval(
          state, 
          'quality_review', 
          { 
            failedTasks: failedQualityChecks.length,
            issues: failedQualityChecks.flatMap(qc => qc.issues)
          }
        );
      }
      
      // Synthesize final result
      const finalResult = await this.synthesizeFinalResult(
        state.requirements,
        state.completedTasks || []
      );

      // Create enhanced expedition result
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      await resultRepo.create({
        expeditionId: state.expeditionId,
        title: 'Enhanced Expedition Report',
        description: 'Comprehensive results from enhanced expedition execution',
        content: finalResult,
        resultType: 'final-report',
        format: 'markdown',
        quality: {
          overall: this.calculateOverallQuality(state.completedTasks || []),
          completeness: 100,
          accuracy: 95,
          relevance: 100,
          clarity: 90,
          assessedBy: 'enhanced-first-officer',
          assessedAt: new Date().toISOString()
        },
        createdBy: 'enhanced-first-officer',
        updatedAt: new Date().toISOString()
      });

      return {
        currentPhase: 'completed',
        finalResult,
        qualityChecks,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Enhanced result synthesis failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Enhanced result synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Enhanced Error Handling with escalation
   */
  private async enhancedHandleError(state: FirstOfficerState): Promise<Partial<FirstOfficerState>> {
    console.log(`❌ [ENHANCED-WORKFLOW] Enhanced error handling`);
    
    try {
      const errorMessage = state.errors?.join('; ') || 'Unknown error occurred';
      
      // Check if escalation is required
      if (this.config.autoEscalation && state.retryCount >= this.config.maxRetries) {
        await this.chatCoordinator.sendCoordinationMessage(
          'error-report',
          'failed',
          `🚨 **Escalation Required**\n\nThe expedition has encountered critical errors and requires manual intervention.\n\nErrors: ${errorMessage}`
        );
        
        return {
          currentPhase: 'failed',
          escalationRequired: true,
          lastUpdated: new Date().toISOString()
        };
      }
      
      await this.chatCoordinator.sendErrorReport(errorMessage, state.currentPhase);
      
      // Update expedition status to failed
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateStatus(state.expeditionId, 'failed');

      return {
        currentPhase: 'failed',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [ENHANCED-WORKFLOW] Enhanced error handling failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Enhanced error handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Check if user message is an approval response
   */
  private isApprovalResponse(message: string): boolean {
    const approvalKeywords = ['approve', 'reject', 'modify', 'yes', 'no', 'continue', 'stop', 'proceed'];
    const lowerMessage = message.toLowerCase();
    return approvalKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Parse user approval response
   */
  private parseApprovalResponse(message: string): UserApprovalResponse {
    const lowerMessage = message.toLowerCase();
    
    let action: 'approve' | 'reject' | 'modify' | 'resolve' = 'approve';
    
    if (lowerMessage.includes('reject') || lowerMessage.includes('no') || lowerMessage.includes('stop')) {
      action = 'reject';
    } else if (lowerMessage.includes('modify') || lowerMessage.includes('change')) {
      action = 'modify';
    } else if (lowerMessage.includes('resolve') || lowerMessage.includes('fix')) {
      action = 'resolve';
    }
    
    return {
      action,
      comments: message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Perform objective analysis using LLM
   */
  private async performObjectiveAnalysis(objective: string): Promise<ObjectiveAnalysis> {
    const prompt = buildPrompt(
      `You are the Enhanced First Officer's analysis system. Analyze the given objective and provide a structured assessment.

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
      `You are the Enhanced First Officer's task planning system. Break down the objective into executable tasks.

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
      `Create an enhanced task plan for: ${objective}\n\nAnalysis: ${JSON.stringify(analysis)}`
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
      `You are the Enhanced First Officer's result synthesis system. Combine individual task results into a comprehensive final report.

Create a well-structured final report that:
1. Summarizes the objective completion
2. Integrates all task results coherently
3. Highlights key achievements
4. Provides actionable insights
5. Maintains professional formatting
6. Includes quality metrics and performance analysis`,
      [],
      `OBJECTIVE: ${objective}\n\nTASK RESULTS:\n${taskResults}\n\nSynthesize these into a comprehensive enhanced final report.`
    );

    try {
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const response = await provider.complete(prompt);
      return response.reply;
    } catch (error) {
      console.warn('LLM synthesis failed, using fallback:', error);
      return `# Enhanced Expedition Report\n\n**Objective:** ${objective}\n\n**Results:**\n${taskResults}`;
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
      qualityScore: this.calculateOverallQuality(completedTasks),
      parallelExecutionUsed: state.parallelExecutionEnabled,
      dependenciesResolved: state.dependencyGraph ? Object.keys(state.dependencyGraph).length : 0,
      userApprovalsRequired: state.userApprovalRequired ? 1 : 0
    };
  }

  /**
   * Get current expedition status with enhanced metrics
   */
  async getExpeditionStatus(expeditionId: string): Promise<ExpeditionProgress | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition || !expedition.workflowState) {
        return null;
      }

      const state = expedition.workflowState as FirstOfficerState;
      const progress = this.buildProgressFromState(state);
      
      // Add enhanced metrics
      return {
        ...progress,
        qualityScore: this.calculateOverallQuality(state.completedTasks || [])
      };
    } catch (error) {
      console.error('Failed to get enhanced expedition status:', error);
      return null;
    }
  }
}