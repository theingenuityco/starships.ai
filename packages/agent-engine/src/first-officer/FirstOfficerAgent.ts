/**
 * First Officer Agent - Main Orchestration Class
 * 
 * Implements the core LangGraph workflow for expedition orchestration
 * with hierarchical coordination, parallel task execution, and quality control.
 */

import { RunnableConfig } from '@langchain/core/runnables';
import { CompiledStateGraph } from '@langchain/langgraph';
import { firstValueFrom } from 'rxjs';
import { ignoreElements } from 'rxjs/operators';
import { 
  ExpeditionStatus, 
  TaskBreakdown, 
  WorkflowPhase,
  ChatResponse,
  LLMProvider,
  ExpeditionMessage
} from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { ProviderFactory } from '../llm/provider-factory';
import { buildPrompt } from '../prompt/builder';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import { AgentSelector } from './AgentSelector';
import { QualityValidator } from './QualityValidator';
import { TaskExecutor } from './TaskExecutor';
import { ChatCoordinator } from './ChatCoordinator';
import { StatePersistence } from './StatePersistence';
import {
  FirstOfficerState,
  FirstOfficerConfig,
  ObjectiveAnalysis,
  TaskPlan,
  AgentAssignment,
  CompletedTask,
  ExpeditionProgress,
  TaskExecution,
  QualityCheck
} from './types';
import {
  createExpeditionWorkflow,
  ExpeditionState,
  convertToExpeditionState,
  convertFromExpeditionState,
  WorkflowNodeHandlers,
  ExpeditionWorkflowConfig
} from './workflow/ExpeditionWorkflow';
import { WebSocketEventEmitter } from './parallel/WebSocketEventEmitter';

/**
 * First Officer Agent - Core orchestration engine
 */
export class FirstOfficerAgent {
  private config: FirstOfficerConfig;
  private memoryStore: LangChainMemoryStore;
  private agentSelector: AgentSelector;
  private qualityValidator: QualityValidator;
  private taskExecutor: TaskExecutor;
  private chatCoordinator: ChatCoordinator | null;
  private workflow: any; // CompiledStateGraph from LangGraph
  private nodeHandlers: WorkflowNodeHandlers;
  private messageEmitCallback?: (message: ExpeditionMessage) => Promise<void>;
  private starshipId: string;
  private statePersistence: StatePersistence;
  private webSocketEmitter: WebSocketEventEmitter;
  private model: LLMProvider | null = null;
  private visionContent: string | undefined;

  constructor(
    starshipId: string,
    memoryStore: LangChainMemoryStore,
    config: Partial<FirstOfficerConfig> = {},
    selectedAgentIds: string[], // REQUIRED: No longer optional
    messageEmitCallback?: (message: ExpeditionMessage) => Promise<void>, // Optional WebSocket emission callback
    webSocketEmitter?: WebSocketEventEmitter
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
    this.messageEmitCallback = messageEmitCallback;
    this.starshipId = starshipId;
    this.webSocketEmitter = webSocketEmitter || new WebSocketEventEmitter();
    
    // Initialize components with REQUIRED agents
    this.agentSelector = new AgentSelector(starshipId, selectedAgentIds);
    this.qualityValidator = new QualityValidator(this.config);
    this.taskExecutor = new TaskExecutor(this.config, memoryStore, this.webSocketEmitter);
    this.statePersistence = new StatePersistence();
    
    // Chat coordinator will be initialized per expedition
    this.chatCoordinator = null;
    
    // Create node handlers for the workflow
    this.nodeHandlers = {
      analyzeObjective: this.analyzeObjectiveNode.bind(this),
      planTasks: this.planTasksNode.bind(this),
      selectAgents: this.selectAgentsNode.bind(this),
      assignTasks: this.assignTasksNode.bind(this),
      executeTasks: this.executeTasksNode.bind(this),
      monitorProgress: this.monitorProgressNode.bind(this),
      qualityCheck: this.qualityCheckNode.bind(this),
      synthesizeResults: this.synthesizeResultsNode.bind(this),
      userApproval: this.userApprovalNode.bind(this),
      handleError: this.handleErrorNode.bind(this),
      retryTask: this.retryTaskNode.bind(this),
      
      // Chat-oriented node handlers
      refreshContext: this.refreshContextNode.bind(this),
      semanticSearch: this.semanticSearchNode.bind(this),
      processMessage: this.processMessageNode.bind(this)
    };
    
    // Build LangGraph workflow with Neo4j checkpointer for persistent state
    const workflowConfig: ExpeditionWorkflowConfig = {
      usePersistentCheckpointer: true, // Use Neo4j for persistent checkpoints
      requireUserApproval: this.config.requireUserApproval
    };
    
    this.workflow = createExpeditionWorkflow(this.nodeHandlers, workflowConfig);
  }

  /**
   * Creates consistent RunnableConfig for all workflow invocations
   */
  private createWorkflowConfig(expeditionId: string): RunnableConfig {
    return {
      recursionLimit: 50,
      configurable: {
        thread_id: expeditionId
      }
    };
  }

  /**
   * Initialize the LLM model (must be called before using model)
   */
  private async initializeModel(): Promise<void> {
    if (this.model) return; // Already initialized
    
    // Create a model config for the First Officer
    const modelConfig = {
      id: 'first-officer-model',
      name: this.config.model || 'gpt-4o',
      provider: (this.config.provider || 'openai') as 'openai' | 'anthropic',
      temperature: this.config.temperature || 0.3,
      maxTokens: 4096,
      createdAt: new Date().toISOString()
    };
    
    // Create LangChain provider and model
    const { LangChainProvider } = await import('../llm/langchain-provider');
    const provider = new LangChainProvider(modelConfig);
    
    // Create the model directly from the provider's internal method
    this.model = provider;
  }

  /**
   * Resume expedition from checkpoint if available
   */
  async resumeExpedition(
    expeditionId: string,
    userId: string
  ): Promise<string> {
    console.log(`🔄 [FIRST-OFFICER] Attempting to resume expedition: ${expeditionId}`);
    
    try {
      // Try to recover state from LangGraph checkpoint
      const config = this.createWorkflowConfig(expeditionId);
      const checkpoint = await this.workflow.getState(config);
      
      if (checkpoint && checkpoint.values) {
        console.log(`✅ [FIRST-OFFICER] Recovered state from LangGraph checkpoint, phase: ${checkpoint.values.currentPhase}`);
        
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
          expedition.starshipId,
          this.messageEmitCallback
        );

        await this.sendWorkflowLog('🔄', 'RESUMING EXPEDITION', `Resuming from phase: ${checkpoint.values.currentPhase}`);
        
        // Resume workflow from checkpoint with streaming
        let resumeFinalState: ExpeditionState | undefined;
        
        // Emit workflow resume event
        await this.webSocketEmitter.emit('workflow:resume', {
          expeditionId,
          timestamp: new Date().toISOString(),
          phase: checkpoint.values.currentPhase,
          fromCheckpoint: true
        });
        
        // Use streamEvents for real-time workflow visualization during resume with fallback
        
        try {
          const eventStream = this.workflow.streamEvents(null, { ...config, version: "v2" });
          
          for await (const event of eventStream) {
          // Emit comprehensive workflow events via WebSocket for real-time monitoring
          if (event.event === 'on_node_start') {
            await this.webSocketEmitter.emit('workflow:node:start', {
              expeditionId,
              node: event.name,
              timestamp: new Date().toISOString(),
              resumed: true,
              phase: checkpoint.values.currentPhase
            });
          }
          
          if (event.event === 'on_node_end') {
            await this.webSocketEmitter.emit('workflow:node:complete', {
              expeditionId,
              node: event.name,
              timestamp: new Date().toISOString(),
              data: event.data,
              resumed: true,
              phase: (event.data as any)?.currentPhase || checkpoint.values.currentPhase
            });
            
            // Emit phase change events for resumed workflows
            if ((event.data as any)?.currentPhase && (event.data as any).currentPhase !== checkpoint.values.currentPhase) {
              await this.webSocketEmitter.emit('workflow:phase:change', {
                expeditionId,
                fromPhase: checkpoint.values.currentPhase,
                toPhase: (event.data as any).currentPhase,
                timestamp: new Date().toISOString(),
                resumed: true
              });
            }
          }
          
          if (event.event === 'on_node_error') {
            await this.webSocketEmitter.emit('workflow:node:error', {
              expeditionId,
              node: event.name,
              error: event.data,
              timestamp: new Date().toISOString(),
              resumed: true,
              phase: checkpoint.values.currentPhase
            });
          }
          
          if (event.event === 'on_workflow_end') {
            resumeFinalState = event.data as ExpeditionState;
            await this.webSocketEmitter.emit('workflow:complete', {
              expeditionId,
              timestamp: new Date().toISOString(),
              finalResult: resumeFinalState.finalResult,
              phase: resumeFinalState.currentPhase,
              resumed: true
            });
          }
        }
        
        // Fallback if streaming doesn't provide final result
        if (!resumeFinalState) {
          resumeFinalState = await this.workflow.invoke(null, config);
        }
        
        } catch (streamError) {
          console.warn('[FIRST-OFFICER] StreamEvents failed during resume, falling back to regular invoke:', streamError);
          await this.webSocketEmitter.emit('workflow:fallback', {
            expeditionId,
            timestamp: new Date().toISOString(),
            reason: 'resume_streaming_failed',
            error: streamError instanceof Error ? streamError.message : String(streamError)
          });
          
          // Fallback to regular workflow execution  
          resumeFinalState = await this.workflow.invoke(null, config);
        }
        
        const result = resumeFinalState?.finalResult || 'Expedition resumed and completed successfully';
        
        await this.sendWorkflowLog('✅', 'EXPEDITION COMPLETE', `Result: ${result.substring(0, 200)}...`);
        
        // Update expedition status
        await expeditionRepo.updateStatus(expeditionId, 'completed' as ExpeditionStatus);
        
        return result;
      } else {
        console.log('⚠️ [FIRST-OFFICER] No checkpoint found, starting fresh');
        // No checkpoint found, fall back to starting fresh
        const expedition = await RepositoryFactory.getExpeditionRepository().findById(expeditionId);
        if (!expedition) {
          throw new Error(`Expedition not found: ${expeditionId}`);
        }
        return this.startExpedition(expeditionId, userId, expedition.mission);
      }
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Failed to resume expedition:', error);
      throw error;
    }
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
        expedition.starshipId,
        this.messageEmitCallback
      );

      // Now we can send workflow logs
      await this.sendWorkflowLog('🚀', 'EXPEDITION START', `Initializing expedition orchestration for: "${objective}"`);

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
      
      await this.sendWorkflowLog('📋', 'WORKFLOW SETUP', 'Expedition workflow initialized and ready for execution');

      // Send initial coordination message
      console.log(`🚀 [FIRST-OFFICER] About to send initial phase update message`);
      console.log(`🚀 [FIRST-OFFICER] ChatCoordinator initialized:`, !!this.chatCoordinator);
      console.log(`🚀 [FIRST-OFFICER] MessageEmitCallback provided:`, !!this.messageEmitCallback);
      
      try {
        await this.chatCoordinator?.sendPhaseUpdate(
          'initializing',
          'analyzing',
          this.buildProgressFromState(initialState)
        );
        console.log(`✅ [FIRST-OFFICER] Initial phase update sent successfully`);
      } catch (error) {
        console.error(`❌ [FIRST-OFFICER] Failed to send initial phase update:`, error);
      }

      // Convert to ExpeditionState for LangGraph
      const workflowState = convertToExpeditionState(initialState, this.config.requireUserApproval);
      
      // Execute workflow with streaming for real-time updates
      const config = this.createWorkflowConfig(expeditionId);
      let result: ExpeditionState | undefined;
      
      // Emit workflow start event
      await this.webSocketEmitter.emit('workflow:start', {
        expeditionId,
        timestamp: new Date().toISOString(),
        phase: workflowState.currentPhase,
        requirements: workflowState.requirements
      });
      
      // Use streamEvents for real-time workflow visualization with fallback
      let finalState: ExpeditionState | undefined;
      
      try {
        const eventStream = this.workflow.streamEvents(workflowState, { ...config, version: "v2" });
        
        for await (const event of eventStream) {
        // Emit comprehensive workflow events via WebSocket for real-time monitoring
        if (event.event === 'on_node_start') {
          await this.webSocketEmitter.emit('workflow:node:start', {
            expeditionId,
            node: event.name,
            timestamp: new Date().toISOString(),
            phase: workflowState.currentPhase
          });
        }
        
        if (event.event === 'on_node_end') {
          await this.webSocketEmitter.emit('workflow:node:complete', {
            expeditionId,
            node: event.name,
            timestamp: new Date().toISOString(),
            data: event.data,
            phase: event.data?.currentPhase || workflowState.currentPhase
          });
          
          // Also emit state change events for UI updates
          if (event.data?.currentPhase && event.data.currentPhase !== workflowState.currentPhase) {
            await this.webSocketEmitter.emit('workflow:phase:change', {
              expeditionId,
              fromPhase: workflowState.currentPhase,
              toPhase: event.data.currentPhase,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        if (event.event === 'on_node_error') {
          await this.webSocketEmitter.emit('workflow:node:error', {
            expeditionId,
            node: event.name,
            error: event.data,
            timestamp: new Date().toISOString(),
            phase: workflowState.currentPhase
          });
        }
        
        if (event.event === 'on_checkpoint_save') {
          await this.webSocketEmitter.emit('workflow:checkpoint:save', {
            expeditionId,
            timestamp: new Date().toISOString(),
            checkpoint: event.data
          });
        }
        
        // Capture the final result
        if (event.event === 'on_workflow_end') {
          finalState = event.data as ExpeditionState;
          await this.webSocketEmitter.emit('workflow:complete', {
            expeditionId,
            timestamp: new Date().toISOString(),
            finalResult: finalState.finalResult,
            phase: finalState.currentPhase
          });
        }
      }
      
      // Fallback if streaming doesn't provide final result
      if (!finalState) {
        finalState = await this.workflow.invoke(workflowState, config);
      }
      
      result = finalState;
      
      } catch (streamError) {
        console.warn('[FIRST-OFFICER] StreamEvents failed, falling back to regular invoke:', streamError);
        await this.webSocketEmitter.emit('workflow:fallback', {
          expeditionId,
          timestamp: new Date().toISOString(),
          reason: 'streaming_failed',
          error: streamError instanceof Error ? streamError.message : String(streamError)
        });
        
        // Fallback to regular workflow execution
        result = await this.workflow.invoke(workflowState, config);
        
        await this.webSocketEmitter.emit('workflow:complete', {
          expeditionId,
          timestamp: new Date().toISOString(),
          finalResult: result?.finalResult || 'Unknown result',
          phase: result?.currentPhase || 'completed'
        });
      }
      
      // Handle final result - no conversion needed
      if (result?.finalResult) {
        await expeditionRepo.updateStatus(expeditionId, 'completed');
        await this.chatCoordinator?.sendCompletionSummary(
          result.finalResult,
          this.calculateExpeditionStats(result)
        );
        
        await this.sendWorkflowLog('✅', 'EXPEDITION COMPLETE', 'All tasks completed successfully and results synthesized');
        console.log(`✅ [FIRST-OFFICER] Expedition completed successfully: ${expeditionId}`);
        return result.finalResult;
      } else {
        // Check if tasks actually failed
        const hasFailedTasks = result?.completedTasks?.some((task: CompletedTask) => 
          task.result.toLowerCase().includes('failed') || task.result.toLowerCase().includes('error')
        );
        
        if (hasFailedTasks) {
          await expeditionRepo.updateStatus(expeditionId, 'failed');
          const errorMessage = result?.errors?.join('; ') || 'Task execution failed';
          await this.sendWorkflowLog('❌', 'EXPEDITION FAILED', `Task execution failed: ${errorMessage}`);
          await this.chatCoordinator?.sendErrorReport(errorMessage, result?.currentPhase || 'analyzing');
          
          console.error(`❌ [FIRST-OFFICER] Expedition failed due to task failures: ${expeditionId}`, result?.errors);
          throw new Error(`Expedition failed: ${errorMessage}`);
        } else {
          // No task failures, just workflow completion without final result
          await expeditionRepo.updateStatus(expeditionId, 'completed');
          const message = 'Workflow completed but no final result synthesized.';
          await this.sendWorkflowLog('⚠️', 'EXPEDITION COMPLETED', message);
          await this.chatCoordinator?.sendCoordinationMessage('phase-update', 'waiting_for_approval', message);
          
          console.warn(`⚠️ [FIRST-OFFICER] Expedition completed without final result: ${expeditionId}`);
          return message;
        }
      }

    } catch (error) {
      console.error(`❌ [FIRST-OFFICER] Expedition orchestration failed:`, error);
      
      // Check if it's a workflow initialization error vs actual task failure
      const isInitializationError = error instanceof Error && (
        error.message.includes('Property values can only be of primitive types') ||
        error.message.includes('serialization') ||
        error.message.includes('workflow') ||
        error.message.includes('initialization')
      );
      
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      
      if (isInitializationError) {
        // For workflow initialization errors, mark as failed
        console.log(`⚠️ [FIRST-OFFICER] Workflow initialization error, marking expedition as failed`);
        await expeditionRepo.updateStatus(expeditionId, 'failed');
      } else {
        // Only fail expedition for actual execution failures
        console.log(`❌ [FIRST-OFFICER] Actual execution failure, setting expedition to failed state`);
        await expeditionRepo.updateStatus(expeditionId, 'failed');
      }
      
      if (this.chatCoordinator) {
        await this.chatCoordinator?.sendErrorReport(
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



  // ========================================
  // WORKFLOW NODE IMPLEMENTATIONS
  // ========================================

  /**
   * Send workflow coordination log to chat interface
   */
  private async sendWorkflowLog(emoji: string, phase: string, message: string): Promise<void> {
    const logMessage = `${emoji} **${phase}**: ${message}`;
    console.log(`[FIRST-OFFICER] ${logMessage}`);
    
    if (this.chatCoordinator) {
      try {
        await this.chatCoordinator?.sendCoordinationMessage(
          'phase-update',
          'coordinating',
          logMessage
        );
      } catch (error) {
        console.error(`❌ [FIRST-OFFICER] Failed to send workflow log:`, error);
      }
    }
  }

  /**
   * Workflow Node: Analyze Objective
   */
  private async analyzeObjectiveNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('🔍', 'ANALYZING OBJECTIVE', `Starting analysis of: "${state.requirements}"`);
    
    // Emit typing start
    if (this.webSocketEmitter) {
      this.webSocketEmitter.emitTypingStart(state.expeditionId, 'first-officer', 'First Officer');
    }
    
    try {
      const analysis = await this.performObjectiveAnalysis(state.requirements);
      
      console.log(`🔍 [FIRST-OFFICER] About to send objective analysis message`);
      try {
        await this.chatCoordinator?.sendCoordinationMessage(
          'phase-update',
          'analyzing',
          `📋 **Objective Analysis Complete**\n\n` +
          `**Complexity:** ${analysis.complexity}\n` +
          `**Estimated Duration:** ${analysis.estimatedDuration} minutes\n` +
          `**Required Skills:** ${analysis.requiredSkills.join(', ')}\n` +
          `**Approach:** ${analysis.approach}\n\n` +
          `**Success Criteria:**\n${analysis.successCriteria.map(c => `• ${c}`).join('\n')}`
        );
        console.log(`✅ [FIRST-OFFICER] Objective analysis message sent successfully`);
        
        // Stop typing indicator
        if (this.webSocketEmitter) {
          this.webSocketEmitter.emitTypingStop(state.expeditionId, 'first-officer');
        }
      } catch (error) {
        console.error(`❌ [FIRST-OFFICER] Failed to send objective analysis message:`, error);
      }

      const updatedState = {
        currentPhase: 'decomposing' as WorkflowPhase,
        objectiveAnalysis: analysis,
        lastUpdated: new Date().toISOString()
      };

      // Manual persistence no longer needed - LangGraph checkpointing handles this automatically
      // Legacy code kept for debugging if needed:
      // await this.statePersistence.persistState(state.expeditionId, { ...state, ...updatedState });

      return updatedState;
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
  private async planTasksNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('📋', 'PLANNING TASKS', 'Breaking down objectives into executable tasks');
    
    // Emit typing start
    if (this.webSocketEmitter) {
      this.webSocketEmitter.emitTypingStart(state.expeditionId, 'first-officer', 'First Officer');
    }
    
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

      await this.sendWorkflowLog('📝', 'TASKS CREATED', `Generated ${createdTasks.length} tasks with ${taskPlan.estimatedTotalTime}min estimated time`);
      
      await this.chatCoordinator?.sendCoordinationMessage(
        'phase-update',
        'decomposing',
        `📝 **Task Planning Complete**\n\n` +
        `**Total Tasks:** ${createdTasks.length}\n` +
        `**Estimated Total Time:** ${taskPlan.estimatedTotalTime} minutes\n` +
        `**Execution Approach:** ${taskPlan.parallelGroups.length > 1 ? 'Parallel' : 'Sequential'}\n\n` +
        `**Tasks Created:**\n${createdTasks.map(t => `• ${t.description}`).join('\n')}`
      );
      
      // Stop typing indicator
      if (this.webSocketEmitter) {
        this.webSocketEmitter.emitTypingStop(state.expeditionId, 'first-officer');
      }

      const planState = {
        ...state,
        currentPhase: 'assigning' as const,
        taskPlan,
        taskBreakdown: createdTasks,
        lastUpdated: new Date().toISOString()
      };

      // Manual persistence no longer needed - LangGraph checkpointing handles this automatically
      // Legacy code kept for debugging if needed:
      // await this.statePersistence.persistState(state.expeditionId, convertFromExpeditionState(planState));

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
  private async selectAgentsNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('👥', 'SELECTING AGENTS', 'Identifying optimal agents for task execution');
    
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
        await this.chatCoordinator?.sendTaskAssignment(
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
  private async assignTasksNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('⚡', 'ASSIGNING TASKS', 'Distributing tasks to selected agents');
    
    try {
      // If we have pre-selected agents but no task assignments yet, assign tasks to them
      if (state.selectedAgents && state.selectedAgents.some(a => a.assignedTasks.length === 0)) {
        await this.sendWorkflowLog('🎯', 'TASK ASSIGNMENT', 'Assigning tasks to pre-selected agents');
        
        // Use AgentSelector to assign tasks to pre-selected agents
        const updatedAssignments = await this.assignTasksToSelectedAgents(state.taskBreakdown, state.selectedAgents);
        
        // Update database with task assignments
        const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
        for (const assignment of updatedAssignments) {
          for (const taskId of assignment.assignedTasks) {
            await taskRepo.assignToAgent(taskId, assignment.agentId);
          }
        }

        await this.sendWorkflowLog('✅', 'TASKS ASSIGNED', `Successfully assigned ${updatedAssignments.reduce((sum, a) => sum + a.assignedTasks.length, 0)} tasks to ${updatedAssignments.length} agents`);
        
        await this.chatCoordinator?.sendCoordinationMessage(
          'phase-update',
          'assigning',
          `🎯 **Pre-selected Agents Assigned**\n\n` +
          `Successfully assigned tasks to ${updatedAssignments.length} pre-selected agents:\n` +
          updatedAssignments.map((a: AgentAssignment) => `• ${a.agentName}: ${a.assignedTasks.length} tasks`).join('\n')
        );

        const assignState = {
          ...state,
          currentPhase: 'coordinating' as const,
          selectedAgents: updatedAssignments,
          lastUpdated: new Date().toISOString()
        };

        // Manual persistence no longer needed - LangGraph checkpointing handles this automatically

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

        const assignState2 = {
          ...state,
          currentPhase: 'coordinating' as const,
          lastUpdated: new Date().toISOString()
        };

        // Manual persistence no longer needed - LangGraph checkpointing handles this automatically

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
  private async executeTasksNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('🚀', 'PREPARING EXECUTION', 'Setting up task execution framework');
    
    try {
      // Prepare active executions for monitoring phase
      const activeExecutions: TaskExecution[] = [];
      
      for (const task of state.taskBreakdown) {
        const assignment = state.selectedAgents?.find(a => a.assignedTasks.includes(task.id));
        if (assignment) {
          activeExecutions.push({
            taskId: task.id,
            agentId: assignment.agentId,
            status: 'pending', // Start as pending
            startTime: new Date().toISOString(),
            progress: 0,
            intermediateResults: [],
            issues: []
          });
        }
      }

      await this.sendWorkflowLog('📋', 'TASKS PREPARED', `${activeExecutions.length} tasks ready for execution with real agents`);

      // Move to monitoring phase where actual execution happens
      return {
        currentPhase: 'coordinating',
        activeExecutions,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Task execution preparation failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Task execution preparation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Workflow Node: Monitor Progress
   */
  private async monitorProgressNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('📊', 'MONITORING PROGRESS', 'Tracking task execution and collecting results');
    
    try {
      // Initialize task executor with our expeditionId and userId
      const expeditionId = state.expeditionId;
      const userId = this.chatCoordinator?.getUserId() || '';
      
      // Prepare task assignments for the executor
      const assignments: AgentAssignment[] = [];
      for (const task of state.taskBreakdown) {
        const assignment = state.selectedAgents?.find(a => a.assignedTasks.includes(task.id));
        if (assignment) {
          assignments.push(assignment);
        }
      }

      // Execute tasks using the TaskExecutor
      await this.sendWorkflowLog('⚡', 'EXECUTING TASKS', `Starting execution of ${assignments.length} tasks with real agents`);
      
      // Small delay to ensure WebSocket connections are ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const taskExecutionOptions = {
        parallelExecution: false, // Sequential execution as per plan
        timeout: this.config.timeoutMinutes * 60 * 1000,
        retryLimit: this.config.maxRetries
      };

      // Start task execution - returns an Observable
      const completionObservable = await this.taskExecutor.executeTasks(
        state.taskBreakdown,
        assignments,
        expeditionId,
        userId,
        taskExecutionOptions
      );

      // Collect completed tasks as they come in
      const completedTasks: CompletedTask[] = [];
      let lastProgress = 0;

      // Subscribe to completion events with progress tracking
      const subscription = completionObservable.subscribe({
        next: (completedTask) => {
          completedTasks.push(completedTask);
          // Send progress update
          const progress = Math.round((completedTasks.length / state.taskBreakdown.length) * 100);
          if (progress > lastProgress) {
            lastProgress = progress;
            this.chatCoordinator?.sendProgressReport({
              expeditionId: state.expeditionId,
              currentPhase: state.currentPhase,
              tasksTotal: state.taskBreakdown.length,
              tasksCompleted: completedTasks.length,
              overallProgress: progress,
              estimatedTimeRemaining: 0,
              qualityScore: 0,
              issues: []
            }).catch(err => console.error('Failed to send progress:', err));
          }
        },
        error: (error) => {
          console.error('❌ [FIRST-OFFICER] Task execution error:', error);
        },
        complete: () => {
          console.log('✅ [FIRST-OFFICER] All tasks completed');
        }
      });

      // Wait for all tasks to complete using proper RxJS pattern
      try {
        await firstValueFrom(completionObservable.pipe(
          ignoreElements() // Only wait for completion/error without collecting values
        ));
      } catch (error) {
        console.error('❌ [FIRST-OFFICER] Task execution failed:', error);
        throw error;
      } finally {
        subscription.unsubscribe();
      }

      // Send final progress update
      const finalProgress = this.calculateProgress(state, completedTasks);
      await this.chatCoordinator?.sendProgressReport(finalProgress);

      return {
        currentPhase: 'synthesizing',
        completedTasks: completedTasks || [],
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
  private async qualityCheckNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('🔍', 'QUALITY REVIEW', 'Validating task results and ensuring quality standards');
    
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
          
          await this.chatCoordinator?.sendQualityReview(
            task.description,
            qualityCheck.score,
            qualityCheck.approved,
            qualityCheck.issues
          );
        }
      }

      const qualityState = {
        ...state,
        qualityChecks,
        lastUpdated: new Date().toISOString()
      };

      // Manual persistence no longer needed - LangGraph checkpointing handles this automatically

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
  private async userApprovalNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('👤', 'USER APPROVAL', 'Requesting user review and approval of results');
    
    try {
      // Send approval request to user
      await this.chatCoordinator?.sendCoordinationMessage(
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
  private async synthesizeResultsNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    await this.sendWorkflowLog('🔧', 'SYNTHESIZING RESULTS', 'Combining agent outputs into final deliverable');
    
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

      const finalState = {
        ...state,
        currentPhase: 'completed' as const,
        finalResult,
        lastUpdated: new Date().toISOString()
      };

      // Manual persistence no longer needed - LangGraph checkpointing handles this automatically

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
  private async handleErrorNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    console.log(`❌ [FIRST-OFFICER] Handling workflow error`);
    
    try {
      const errorMessage = state.errors?.join('; ') || 'Unknown error occurred';
      
      await this.chatCoordinator?.sendErrorReport(errorMessage, state.currentPhase);
      
      // Check if the error is due to task failures or just workflow issues
      const isTaskFailure = state.completedTasks?.some((task: CompletedTask) => 
        task.result.toLowerCase().includes('failed') || 
        task.result.toLowerCase().includes('error')
      ) || state.errors?.some((err: string) => 
        err.toLowerCase().includes('task failed') || 
        err.toLowerCase().includes('execution failed')
      );
      
      // Only fail the expedition if actual tasks failed
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      if (isTaskFailure) {
        console.log(`❌ [FIRST-OFFICER] Task execution failed, updating expedition status to failed`);
        await expeditionRepo.updateStatus(state.expeditionId, 'failed');
      } else {
        console.log(`⚠️ [FIRST-OFFICER] Workflow error occurred but no task failures, marking expedition as completed`);
        await expeditionRepo.updateStatus(state.expeditionId, 'completed');
      }

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
  private async retryTaskNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    console.log(`🔄 [FIRST-OFFICER] Retrying failed tasks`);
    
    try {
      const retryAttempts = { ...(state.retryAttempts || {}) };
      
      // Find tasks that need retry
      const tasksToRetry = state.qualityChecks?.filter(qc => !qc.approved) || [];
      
      for (const qualityCheck of tasksToRetry) {
        const currentRetries = retryAttempts[qualityCheck.taskId] || 0;
        
        if (currentRetries < this.config.maxRetries) {
          retryAttempts[qualityCheck.taskId] = currentRetries + 1;
          
          await this.chatCoordinator?.sendCoordinationMessage(
            'phase-update',
            'coordinating',
            `🔄 **Retrying Task**\n\nTask ${qualityCheck.taskId} will be retried (attempt ${currentRetries + 1}/${this.config.maxRetries})\n\nIssues to address:\n${qualityCheck.issues.map(i => `• ${i}`).join('\n')}`
          );
        } else {
          await this.chatCoordinator?.sendCoordinationMessage(
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
   * Perform objective analysis using LLM with vision context
   */
  private async performObjectiveAnalysis(objective: string): Promise<ObjectiveAnalysis> {
    // Load vision context for alignment
    let visionContext = '';
    try {
      const visionRepo = RepositoryFactory.getVisionRepository();
      const vision = await visionRepo.findByStarship(this.starshipId);
      
      if (vision && vision.statement) {
        visionContext = `\n\nSTARSHIP VISION:\n${vision.statement}\n\nIMPORTANT: All work must align with this vision. Consider how this objective supports and advances our vision.`;
        console.log(`📖 [FIRST-OFFICER] Vision loaded for analysis: ${vision.statement.substring(0, 100)}...`);
      }
    } catch (error) {
      console.warn('⚠️ [FIRST-OFFICER] Could not load vision for analysis:', error);
    }

    const prompt = buildPrompt(
      `You are the First Officer's analysis system. Analyze the given objective and provide a structured assessment.

${visionContext}

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
    // Load vision context for task planning
    let visionContext = '';
    try {
      const visionRepo = RepositoryFactory.getVisionRepository();
      const vision = await visionRepo.findByStarship(this.starshipId);
      
      if (vision && vision.statement) {
        visionContext = `\n\nSTARSHIP VISION:\n${vision.statement}\n\nENSURE: All tasks must directly contribute to advancing this vision.`;
      }
    } catch (error) {
      console.warn('⚠️ [FIRST-OFFICER] Could not load vision for task planning:', error);
    }

    const prompt = buildPrompt(
      `You are the First Officer's task planning system. Break down the objective into executable tasks.

${visionContext}

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
  private calculateExpeditionStats(state: FirstOfficerState | ExpeditionState) {
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

  // ========================================
  // CHAT WORKFLOW NODE HANDLERS
  // ========================================

  /**
   * Refresh Context Node - Builds context for chat interactions
   */
  private async refreshContextNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    try {
      console.log(`🔄 [CHAT] Refreshing context for expedition: ${state.expeditionId}`);
      
      // Build context from expedition history and current state
      const context = {
        expeditionId: state.expeditionId,
        currentPhase: state.currentPhase,
        requirements: state.requirements,
        taskBreakdown: state.taskBreakdown,
        completedTasks: state.completedTasks,
        agentResults: state.agentResults,
        timestamp: new Date().toISOString()
      };

      return {
        context,
        currentPhase: 'analyzing' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [CHAT] Context refresh failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Context refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Semantic Search Node - Performs context-aware search
   */
  private async semanticSearchNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    try {
      console.log(`🔍 [CHAT] Performing semantic search for message: ${state.userMessage?.substring(0, 100)}...`);
      
      // Simulate semantic search results based on user message and context
      const searchResults = [
        {
          type: 'task_result',
          content: `Related task results for: ${state.userMessage}`,
          relevance: 0.9,
          source: 'expedition_history'
        },
        {
          type: 'agent_response',
          content: 'Previous agent responses on similar topics',
          relevance: 0.7,
          source: 'agent_memory'
        }
      ];

      return {
        semanticSearchResults: searchResults,
        currentPhase: 'analyzing' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [CHAT] Semantic search failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Semantic search failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Process Message Node - Generates response to user message
   */
  private async processMessageNode(state: ExpeditionState): Promise<Partial<ExpeditionState>> {
    try {
      console.log(`💬 [CHAT] Processing user message: ${state.userMessage}`);
      
      if (!this.model) {
        throw new Error('No LLM provider configured for chat processing');
      }

      // Build prompt for chat response
      const chatPrompt = `
You are the First Officer AI assistant for expedition ${state.expeditionId}.

Current Context:
- Phase: ${state.currentPhase}
- Requirements: ${state.requirements || 'Not specified'}
- Completed Tasks: ${state.completedTasks?.length || 0}
- Search Results: ${JSON.stringify(state.semanticSearchResults, null, 2)}

User Message: ${state.userMessage}

Provide a helpful, contextual response based on the expedition status and user's question.
`;

      const response = await this.model.complete({
        messages: [{ role: 'user', content: chatPrompt }]
      });
      const agentResponse = response.reply;

      return {
        agentResponse,
        finalResult: agentResponse, // For chat interactions, response is the final result
        currentPhase: 'completed' as WorkflowPhase,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ [CHAT] Message processing failed:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Message processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Process a chat message using the consolidated workflow
   */
  async processChatMessage(request: {
    expeditionId: string;
    starshipId: string;
    userId: string;
    userMessage: string;
  }): Promise<string> {
    try {
      console.log(`💬 [FIRST-OFFICER] Processing chat message for expedition: ${request.expeditionId}`);

      // Create ExpeditionState for chat workflow
      const chatState: ExpeditionState = {
        expeditionId: request.expeditionId,
        userId: request.userId,
        starshipId: request.starshipId,
        requireUserApproval: false,
        currentPhase: 'analyzing',
        requirements: '',
        objectiveAnalysis: undefined,
        taskPlan: undefined,
        taskBreakdown: [],
        selectedAgents: undefined,
        agentAssignments: {},
        activeExecutions: undefined,
        completedTasks: undefined,
        agentResults: {},
        qualityChecks: undefined,
        errors: [],
        retryCount: 0,
        retryAttempts: undefined,
        finalResult: undefined,
        lastUpdated: new Date().toISOString(),
        messages: [],
        
        // Chat-specific fields
        userMessage: request.userMessage,
        context: undefined,
        agentResponse: undefined,
        semanticSearchResults: undefined
      };

      // Execute workflow with streaming disabled for chat
      const config = this.createWorkflowConfig(request.expeditionId);
      const result = await this.workflow.invoke(chatState, config);

      return result.agentResponse || result.finalResult || 'I received your message but encountered an issue generating a response.';
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Chat message processing failed:', error);
      return `I apologize, but I encountered an error while processing your message: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}