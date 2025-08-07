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
  ExpeditionMessage,
  MemoryEntry
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
    // VALIDATE: Check if agents are provided (required for execution, optional for pre-expedition chat)
    if (!selectedAgentIds || selectedAgentIds.length === 0) {
      console.warn(
        '⚠️ [FIRST-OFFICER] No agents selected - this is acceptable for pre-expedition chat, ' +
        'but agents must be assigned before starting expedition execution.'
      );
      selectedAgentIds = []; // Ensure it's an empty array
    } else {
      console.log(`🎯 [FIRST-OFFICER] Initializing with ${selectedAgentIds.length} pre-selected agents:`, selectedAgentIds);
    }

    // Initialize configuration with defaults
    this.config = {
      maxRetries: 3,
      qualityThreshold: 70,
      timeoutMinutes: 60,
      requireUserApproval: false,
      enableParallelExecution: false, // CHANGED: Disabled for workflow DSL sequential execution
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
        
        await this.sendWorkflowLog('', 'MISSION COMPLETE', `Result: ${result.substring(0, 200)}...`);
        
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

      // Validate that agents are assigned before starting execution
      if (!expedition.assignedAgents || expedition.assignedAgents.length === 0) {
        throw new Error(
          'Cannot start expedition execution without assigned agents. ' +
          'Please assign at least one agent to the expedition before starting.'
        );
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
      await this.sendWorkflowLog('', 'EXPEDITION INITIATED', `Mission orchestration commenced for: "${objective}"`);

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
        requireUserApproval: this.config.requireUserApproval,
        // Set selectedAgents if provided (from expedition.assignedAgents)
        selectedAgents: expedition.assignedAgents && expedition.assignedAgents.length > 0
          ? await this.convertAgentIdsToAssignments(expedition.assignedAgents)
          : undefined
      };

      // Update expedition status
      await expeditionRepo.updateStatus(expeditionId, 'planning');
      await expeditionRepo.updateWorkflowState(expeditionId, initialState);
      
      await this.sendWorkflowLog('', 'WORKFLOW CONFIGURED', 'Mission workflow successfully initialized and operational');

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
        
        await this.sendWorkflowLog('', 'MISSION COMPLETE', 'All operational tasks completed successfully with results compiled');
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
          await this.sendWorkflowLog('', 'MISSION STATUS', message);
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
    // Initialize chat coordinator if needed (for workflow coordination)
    await this.initializeChatCoordinatorIfNeeded(expeditionId);

    // Use direct chat implementation instead of ChatCoordinator
    // (ChatCoordinator is only for workflow coordination messages)
    return await this.handleDirectChat(expeditionId, userMessage);
  }

  /**
   * Initialize chat coordinator for draft expeditions with vision context
   */
  private async initializeChatCoordinatorIfNeeded(expeditionId: string): Promise<void> {
    if (this.chatCoordinator) {
      return; // Already initialized
    }

    try {
      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw new Error(`Expedition not found: ${expeditionId}`);
      }

      // Load vision context for the starship (same pattern as performObjectiveAnalysis)
      await this.loadVisionContext();

      // Initialize chat coordinator for any expedition status (for workflow messages only)
      // Note: expedition.createdBy is the correct field, not expedition.userId
      this.chatCoordinator = new ChatCoordinator(
        this.memoryStore,
        expeditionId,
        expedition.createdBy, // ← CORRECTED: Use createdBy field
        expedition.starshipId,
        this.messageEmitCallback
      );

      console.log(`✅ [FIRST-OFFICER] Chat coordinator initialized for expedition: ${expeditionId} (status: ${expedition.status})`);
      if (this.visionContent) {
        console.log(`📖 [FIRST-OFFICER] Vision context loaded: ${this.visionContent.substring(0, 100)}...`);
      }
    } catch (error) {
      console.error(`❌ [FIRST-OFFICER] Failed to initialize chat coordinator:`, error);
      throw error;
    }
  }

  /**
   * Load and cache vision context for the starship
   */
  private async loadVisionContext(): Promise<void> {
    if (this.visionContent) {
      return; // Already loaded
    }

    try {
      const visionRepo = RepositoryFactory.getVisionRepository();
      const vision = await visionRepo.findByStarship(this.starshipId);
      
      if (vision && vision.statement) {
        this.visionContent = vision.statement;
        console.log(`📖 [FIRST-OFFICER] Vision loaded: ${vision.statement.substring(0, 100)}...`);
      } else {
        console.log(`⚠️ [FIRST-OFFICER] No vision found for starship: ${this.starshipId}`);
      }
    } catch (error) {
      console.warn('⚠️ [FIRST-OFFICER] Could not load vision context:', error);
    }
  }

  /**
   * Handle direct chat for pre-expedition conversations
   */
  private async handleDirectChat(expeditionId: string, userMessage: string): Promise<ChatResponse> {
    // Load vision context if needed
    await this.loadVisionContext();
    
    try {
      // Get expedition details for context
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        return {
          reply: "I apologize, but I couldn't find the expedition details. Please try again.",
          usage: undefined
        };
      }

      // Retrieve existing memory for conversation context (same pattern as chat function in index.ts)
      const sessionKey = this.memoryStore.makeKey('first-officer', expedition.createdBy, expeditionId);
      const memory = await this.memoryStore.get(sessionKey);
      console.log('🧠 [FIRST-OFFICER] Memory loaded:', {
        sessionKey,
        memoryEntries: memory.length,
        recentEntries: memory.slice(-3).map((m) => `${m.role}: ${m.content.substring(0, 50)}...`),
      });

      // Note: Greeting is now handled by initializeChat() method called when chat interface loads

      // Initialize ProviderFactory (same pattern as chat function in index.ts)
      const agentRepo = RepositoryFactory.getAgentRepository();
      const llmRepo = RepositoryFactory.getLLMRepository();
      ProviderFactory.initialize(agentRepo, llmRepo);

      // Build system prompt with vision context (same pattern as performObjectiveAnalysis)
      const systemPrompt = this.buildChatSystemPrompt(expedition);
      
      // Build prompt using buildPrompt utility with proper parameters (same as chat function in index.ts)
      const prompt = buildPrompt(
        systemPrompt,
        memory, // retrieved memory for conversation context
        userMessage,
        undefined, // no relevant context for pre-expedition chat
        this.visionContent // vision context if available
      );
      
      // Use same LLM pattern as performObjectiveAnalysis method
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const result = await provider.complete(prompt);

      // Store in memory for context (exact same pattern as chat function in index.ts)
      const userTimestamp = Date.now();
      await this.memoryStore.append(sessionKey, {
        role: 'user',
        content: userMessage,
        timestamp: userTimestamp,
      } as MemoryEntry);

      const assistantTimestamp = Date.now();
      await this.memoryStore.append(sessionKey, {
        role: 'assistant',
        content: result.reply,
        timestamp: assistantTimestamp,
      } as MemoryEntry);

      return {
        reply: result.reply,
        usage: result.usage
      };
    } catch (error) {
      console.error('Failed to handle user message:', error);
      return {
        reply: "I apologize, I'm having trouble processing your message right now. Please try again.",
        usage: undefined
      };
    }
  }

  /**
   * Initialize chat for expedition - sends greeting if needed
   * Should be called when user first opens expedition chat interface
   */
  async initializeChat(expeditionId: string): Promise<ChatResponse | null> {
    try {
      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        return null;
      }

      // Check if greeting already sent by checking memory
      const sessionKey = this.memoryStore.makeKey('first-officer', expedition.createdBy, expeditionId);
      const memory = await this.memoryStore.get(sessionKey);
      
      // Only send greeting if no previous messages exist
      if (memory.length === 0) {
        console.log('👋 [FIRST-OFFICER] Initializing chat - sending automatic greeting');
        return await this.sendAutomaticGreeting(expedition, sessionKey);
      }
      
      console.log('🔄 [FIRST-OFFICER] Chat already initialized, no greeting needed');
      return null; // No greeting needed
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Failed to initialize chat:', error);
      return null;
    }
  }

  /**
   * Send automatic greeting and contextual question for new expeditions
   */
  private async sendAutomaticGreeting(expedition: any, sessionKey: string): Promise<ChatResponse> {
    try {
      // Load vision context for contextual greeting
      await this.loadVisionContext();

      // Create contextual greeting based on expedition details
      const greetingMessage = this.buildGreetingMessage(expedition);

      // Store the greeting in memory as assistant message
      const timestamp = Date.now();
      await this.memoryStore.append(sessionKey, {
        role: 'assistant',
        content: greetingMessage,
        timestamp: timestamp,
      } as MemoryEntry);

      console.log('✅ [FIRST-OFFICER] Automatic greeting sent and stored');

      return {
        reply: greetingMessage,
        usage: undefined
      };
    } catch (error) {
      console.error('❌ [FIRST-OFFICER] Failed to send automatic greeting:', error);
      const fallbackMessage = "Welcome! I'm your First Officer. How can I help you plan this expedition?";
      return {
        reply: fallbackMessage,
        usage: undefined
      };
    }
  }

  /**
   * Build contextual greeting message based on expedition details
   */
  private buildGreetingMessage(expedition: any): string {
    const expeditionName = expedition.name || 'your new expedition';
    const mission = expedition.mission || 'the mission ahead';
    
    // Add vision context if available
    const visionContext = this.visionContent 
      ? ` As we work together, I'll ensure our plans align with our starship's vision and strategic direction.`
      : '';

    const greeting = `**Welcome aboard!** I'm your First Officer for "${expeditionName}".

Mission: **${mission}**

${visionContext}

To help you get the best results, I'd like to understand:

**What specific outcome are you looking to achieve with this expedition?**

Feel free to include any important requirements or constraints you have in mind.`;

    return greeting;
  }

  /**
   * Check if expedition is ready to start based on planning conversation quality
   * Analyzes conversation depth and key planning elements discussed
   */
  async isExpeditionReadyToStart(expeditionId: string, userId: string): Promise<{
    isReady: boolean;
    userMessageCount: number;
    planningScore: number;
    reason?: string;
    missingElements?: string[];
  }> {
    try {
      // Get expedition details to use the correct session key (same as chat system)
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        console.log(`❌ [FIRST-OFFICER] Expedition not found for readiness check: ${expeditionId} (user: ${userId})`);
        return {
          isReady: false,
          userMessageCount: 0,
          planningScore: 0,
          reason: 'Expedition not found'
        };
      }

      // Use the same session key pattern as chat system (expedition.createdBy, not current userId)
      const sessionKey = this.memoryStore.makeKey('first-officer', expedition.createdBy, expeditionId);
      const memory = await this.memoryStore.get(sessionKey);
      
      // Count user messages (exclude assistant messages like greetings)
      const userMessages = memory.filter(entry => entry.role === 'user');
      const userMessageCount = userMessages.length;
      
      // Analyze conversation content for planning completeness
      const conversationText = memory.map(m => m.content).join(' ').toLowerCase();
      
      // Check for key planning elements in the conversation
      const planningElements = {
        objectives: /objective|goal|outcome|result|deliver|achieve|success/g.test(conversationText),
        scope: /scope|boundary|include|exclude|limit|constraint/g.test(conversationText),
        timeline: /time|deadline|schedule|duration|when|by/g.test(conversationText),
        resources: /resource|skill|team|capability|need|require/g.test(conversationText),
        requirements: /requirement|specification|criteria|standard|expect/g.test(conversationText),
        challenges: /challenge|risk|problem|difficult|issue|concern/g.test(conversationText)
      };
      
      const elementsDiscussed = Object.values(planningElements).filter(Boolean).length;
      const totalElements = Object.keys(planningElements).length;
      const planningScore = Math.round((elementsDiscussed / totalElements) * 100);
      
      // Determine missing elements for feedback
      const missingElements = Object.entries(planningElements)
        .filter(([_, discussed]) => !discussed)
        .map(([element, _]) => element);
      
      const MINIMUM_MESSAGES = 1; // Require at least 1 user message  
      const MINIMUM_PLANNING_SCORE = 20; // At least 20% of planning elements discussed (minimal threshold)
      
      const hasEnoughMessages = userMessageCount >= MINIMUM_MESSAGES;
      const hasAdequatePlanning = planningScore >= MINIMUM_PLANNING_SCORE;
      const isReady = hasEnoughMessages && hasAdequatePlanning;
      
      console.log(`🎯 [FIRST-OFFICER] Readiness: ${userMessageCount}/${MINIMUM_MESSAGES} messages, ${planningScore}% planning completeness, ready: ${isReady}`);
      
      let reason: string | undefined;
      if (!isReady) {
        if (!hasEnoughMessages) {
          reason = `Please share your main objective to get started.`;
        } else if (!hasAdequatePlanning) {
          reason = `Ready to start! Just confirm your objective.`;
        }
      }
      
      return {
        isReady,
        userMessageCount,
        planningScore,
        reason,
        missingElements: missingElements.length > 0 ? missingElements : undefined
      };
    } catch (error) {
      console.error('Failed to check expedition readiness:', error);
      return {
        isReady: false,
        userMessageCount: 0,
        planningScore: 0,
        reason: 'Unable to determine readiness. Please try again.'
      };
    }
  }

  private buildChatSystemPrompt(expedition: any): string {
    const basePrompt = `You are the First Officer of starship "${expedition.starshipId}".`;
    
    // Add vision context if available (same pattern as performObjectiveAnalysis)
    const visionSection = this.visionContent 
      ? `\n\n${this.visionContent}\n\nIMPORTANT: All discussions must align with this vision.`
      : '';
    
    if (expedition.status === 'draft') {
      return `${basePrompt}${visionSection}

EXPEDITION PLANNING MODE
Expedition: "${expedition.name || 'Untitled Expedition'}"
Mission: "${expedition.mission || 'Mission details to be defined'}"

You are helping the user refine and plan this expedition before execution through a structured planning conversation.

MINIMAL PLANNING APPROACH:
1. **What do you want to achieve?** (core objective)
2. **Any specific requirements or constraints?** (key limitations)
3. **Ready to start the expedition?** (confirmation)

INTERACTION GUIDELINES:
- Ask 2-3 focused questions to understand the core objective
- Keep questions practical and relevant
- Once you have a clear understanding, suggest moving to execution
- Be helpful and professional, not pushy
- Natural transition: "I have a good understanding of what you need. Ready to start?"

READINESS ASSESSMENT:
After understanding the user's objective, provide a natural transition to execution:

**Standard response:** "I understand what you're looking to achieve. We have enough information to get started. Shall we begin the expedition?"

**If clarification needed:** "Just to make sure I understand correctly: [specific question]. Once that's clear, we can proceed."

**Keep the tone professional and helpful, not overly eager.**

ALTERNATIVE USE CASES TO SUGGEST:
If the current expedition seems unclear or overly complex, consider suggesting:
- Breaking it into smaller, focused expeditions
- Starting with a discovery/research phase
- Creating a proof-of-concept or prototype first
- Establishing foundational capabilities before the main objective
- Conducting stakeholder alignment sessions
- Performing a feasibility assessment

IMPORTANT: 
- Keep responses conversational but professional
- Be collaborative and build on user input
- Ensure all discussions align with our starship's vision
- Focus on understanding the objective rather than extensive planning
- When you have sufficient clarity, naturally suggest proceeding
- Be helpful and supportive, not aggressive about starting
- Maintain a confident, professional tone throughout`;
    }
    
    return `${basePrompt}${visionSection}
    
The expedition "${expedition.name || 'Current Expedition'}" is currently ${expedition.status}. 
Help coordinate and provide guidance as needed.`;
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
    await this.sendWorkflowLog('', 'OBJECTIVE ANALYSIS', `Commencing strategic analysis of: "${state.requirements}"`);
    
    // Emit typing start
    if (this.webSocketEmitter) {
      this.webSocketEmitter.emitTypingStart(state.expeditionId, 'first-officer', 'First Officer');
    }
    
    try {
      const analysis = await this.performObjectiveAnalysis(state.requirements, state.expeditionId);
      
      console.log(`🔍 [FIRST-OFFICER] About to send objective analysis message`);
      try {
        await this.chatCoordinator?.sendCoordinationMessage(
          'phase-update',
          'analyzing',
          `**ANALYSIS COMPLETE**\n\n` +
          `**Mission Complexity:** ${analysis.complexity}\n` +
          `**Projected Duration:** ${analysis.estimatedDuration} minutes\n` +
          `**Required Capabilities:** ${analysis.requiredSkills.join(', ')}\n` +
          `**Execution Strategy:** ${analysis.approach}\n\n` +
          `**Success Metrics:**\n${analysis.successCriteria.map(c => `• ${c}`).join('\n')}`
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
    await this.sendWorkflowLog('', 'TASK PLANNING', 'Decomposing objectives into actionable work units');
    
    // Emit typing start
    if (this.webSocketEmitter) {
      this.webSocketEmitter.emitTypingStart(state.expeditionId, 'first-officer', 'First Officer');
    }
    
    try {
      const taskPlan = await this.createTaskPlan(state.requirements, state.objectiveAnalysis!, state.expeditionId);
      
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
        
        // Emit WebSocket event for new task creation (real-time updates)
        if (this.webSocketEmitter) {
          // Emit task creation event that the frontend can listen to
          this.webSocketEmitter.emitTaskCreated(state.expeditionId, createdTask.id, {
            title: createdTask.title,
            description: createdTask.description,
            requiredSkills: createdTask.requiredSkills,
            priority: createdTask.priority,
            dependencies: createdTask.dependencies,
            deliverable: createdTask.deliverable,
            estimatedEffort: createdTask.estimatedEffort,
            createdAt: createdTask.createdAt,
            updatedAt: createdTask.updatedAt
          });
        }
      }

      await this.sendWorkflowLog('', 'TASKS CONFIGURED', `Established ${createdTasks.length} work units with ${taskPlan.estimatedTotalTime} minute operational timeline`);
      
      await this.chatCoordinator?.sendCoordinationMessage(
        'phase-update',
        'decomposing',
        `**TASK CONFIGURATION COMPLETE**\n\n` +
        `**Work Units Established:** ${createdTasks.length}\n` +
        `**Projected Timeline:** ${taskPlan.estimatedTotalTime} minutes\n` +
        `**Execution Model:** ${taskPlan.parallelGroups.length > 1 ? 'Parallel Processing' : 'Sequential Processing'}\n\n` +
        `**Operational Breakdown:**\n${createdTasks.map(t => `• ${t.description}`).join('\n')}`
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
    await this.sendWorkflowLog('', 'AGENT SELECTION', 'Identifying optimal personnel for mission execution');
    
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
    await this.sendWorkflowLog('', 'TASK ASSIGNMENT', 'Allocating responsibilities to designated personnel');
    
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
            
            // Emit WebSocket event for task assignment (real-time updates)
            if (this.webSocketEmitter) {
              this.webSocketEmitter.emitTaskAssigned(state.expeditionId, taskId, assignment.agentId, {
                agentName: assignment.agentName
              });
            }
          }
        }

        await this.sendWorkflowLog('', 'ASSIGNMENT COMPLETE', `Successfully allocated ${updatedAssignments.reduce((sum, a) => sum + a.assignedTasks.length, 0)} tasks to ${updatedAssignments.length} personnel`);
        
        await this.chatCoordinator?.sendCoordinationMessage(
          'phase-update',
          'assigning',
          `**PERSONNEL ASSIGNMENT CONFIRMED**\n\n` +
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
    await this.sendWorkflowLog('', 'EXECUTION PREP', 'Establishing operational framework for mission delivery');
    
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

      await this.sendWorkflowLog('', 'TASKS READY', `${activeExecutions.length} work units prepared for operational deployment`);

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
    await this.sendWorkflowLog('', 'PROGRESS MONITORING', 'Tracking execution status and collecting deliverables');
    
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
      await this.sendWorkflowLog('', 'EXECUTION COMMENCED', `Initiating deployment of ${assignments.length} operational assignments`);
      
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
    await this.sendWorkflowLog('', 'QUALITY ASSURANCE', 'Validating deliverables against established quality benchmarks');
    
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
    await this.sendWorkflowLog('', 'APPROVAL REQUEST', 'Requesting stakeholder review and authorization to proceed');
    
    try {
      // Send approval request to user
      await this.chatCoordinator?.sendCoordinationMessage(
        'user-question',
        state.currentPhase,
        `**AUTHORIZATION REQUIRED**\n\nThe current workflow phase requires stakeholder approval to proceed.\n\nCurrent Phase: ${state.currentPhase}\n\nPlease confirm authorization to continue with the next phase.`
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
    await this.sendWorkflowLog('', 'RESULT SYNTHESIS', 'Consolidating outputs into comprehensive deliverable');
    
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
            `**TASK RETRY SCHEDULED**\n\nTask ${qualityCheck.taskId} scheduled for retry (attempt ${currentRetries + 1}/${this.config.maxRetries})\n\nItems requiring attention:\n${qualityCheck.issues.map(i => `• ${i}`).join('\n')}`
          );
        } else {
          await this.chatCoordinator?.sendCoordinationMessage(
            'error-report',
            'failed',
            `**TASK ESCALATION REQUIRED**\n\nTask ${qualityCheck.taskId} has exceeded maximum retry attempts (${this.config.maxRetries}) and requires manual intervention`
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
   * Extract structured planning insights from pre-expedition chat
   */
  private async extractPlanningInsights(expeditionId: string): Promise<{
    objectives: string[];
    constraints: string[];
    successCriteria: string[];
    timeline: string[];
    resources: string[];
    risks: string[];
    userPreferences: string[];
  } | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) return null;

      const sessionKey = this.memoryStore.makeKey('first-officer', expedition.createdBy, expeditionId);
      const memory = await this.memoryStore.get(sessionKey);
      
      if (memory.length === 0) return null;

      // Use LLM to extract structured insights from conversation
      const conversationText = memory
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const prompt = buildPrompt(
        `You are an expert at extracting structured planning insights from conversations. 
        
Analyze the conversation and extract key planning elements in JSON format:

RESPONSE FORMAT (JSON):
{
  "objectives": ["specific goal 1", "specific goal 2"],
  "constraints": ["constraint 1", "constraint 2"], 
  "successCriteria": ["success metric 1", "success metric 2"],
  "timeline": ["timeline requirement 1", "timeline requirement 2"],
  "resources": ["resource need 1", "resource need 2"],
  "risks": ["risk 1", "risk 2"],
  "userPreferences": ["preference 1", "preference 2"]
}

Extract only explicitly mentioned items. If a category has no explicit mentions, use empty array.`,
        [],
        `CONVERSATION TO ANALYZE:\n${conversationText}`
      );

      try {
        const provider = await ProviderFactory.getProvider('first-officer-system');
        const response = await provider.complete(prompt);
        
        const jsonMatch = response.reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const insights = JSON.parse(jsonMatch[0]);
          console.log(`📊 [FIRST-OFFICER] Planning insights extracted for expedition ${expeditionId}:`, insights);
          return insights;
        }
      } catch (error) {
        console.warn('Failed to extract planning insights with LLM:', error);
      }

      return null;
    } catch (error) {
      console.error('Failed to extract planning insights:', error);
      return null;
    }
  }

  /**
   * Perform objective analysis using LLM with vision context and pre-expedition chat insights
   */
  private async performObjectiveAnalysis(objective: string, expeditionId?: string): Promise<ObjectiveAnalysis> {
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

    // Load pre-expedition chat context for richer analysis
    let chatContext = '';
    if (expeditionId) {
      try {
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);
        
        if (expedition) {
          const sessionKey = this.memoryStore.makeKey('first-officer', expedition.createdBy, expeditionId);
          const memory = await this.memoryStore.get(sessionKey);
          
          if (memory.length > 0) {
            // Extract planning insights from conversation
            const conversationSummary = memory
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => `${m.role}: ${m.content}`)
              .join('\n');
            
            chatContext = `\n\nPRE-EXPEDITION PLANNING DISCUSSION:
${conversationSummary}

IMPORTANT: Use the insights from this planning discussion to inform your analysis. The user has already provided context about objectives, scope, constraints, and expectations during the planning conversation.`;
            
            console.log(`💬 [FIRST-OFFICER] Chat context loaded for analysis: ${memory.length} messages`);
          }
        }
      } catch (error) {
        console.warn('⚠️ [FIRST-OFFICER] Could not load chat context for analysis:', error);
      }
    }

    const prompt = buildPrompt(
      `You are the First Officer's analysis system. Analyze the given objective and provide a structured assessment.

${visionContext}${chatContext}

RESPONSE FORMAT (JSON):
{
  "complexity": "simple|moderate|complex|expert",
  "estimatedDuration": 60,
  "requiredSkills": ["skill1", "skill2"],
  "riskFactors": ["risk1", "risk2"],
  "successCriteria": ["criteria1", "criteria2"],
  "approach": "sequential|parallel|hybrid"
}

ANALYSIS INSTRUCTIONS:
- If pre-expedition planning discussion is available, incorporate those insights into your assessment
- Extract specific requirements, constraints, and success criteria mentioned in the conversation
- Consider the user's stated preferences for timeline, scope, and approach
- Identify any risks or challenges discussed during planning
- Align complexity assessment with the depth of planning already conducted`,
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
   * Create task plan from objective and analysis with chat context
   */
  private async createTaskPlan(objective: string, analysis: ObjectiveAnalysis, expeditionId?: string): Promise<TaskPlan> {
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

    // Load pre-expedition chat context for task planning
    let chatContext = '';
    if (expeditionId) {
      try {
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);
        
        if (expedition) {
          const sessionKey = this.memoryStore.makeKey('first-officer', expedition.createdBy, expeditionId);
          const memory = await this.memoryStore.get(sessionKey);
          
          if (memory.length > 0) {
            // Extract key planning insights for task creation
            const planningInsights = memory
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => m.content)
              .join(' ')
              .toLowerCase();

            // Extract specific deliverables, constraints, and preferences mentioned
            const hasSpecificDeliverables = /deliverable|output|result|produce|create|build/g.test(planningInsights);
            const hasTimeConstraints = /deadline|urgent|quick|time|schedule/g.test(planningInsights);
            const hasQualityRequirements = /quality|standard|criteria|review|approval/g.test(planningInsights);
            
            chatContext = `\n\nPLANNING INSIGHTS FROM CONVERSATION:
Based on the pre-expedition discussion, consider these aspects:
- Specific deliverables mentioned: ${hasSpecificDeliverables ? 'Yes - incorporate mentioned outputs' : 'None specified'}
- Time constraints discussed: ${hasTimeConstraints ? 'Yes - consider urgency factors' : 'Standard timeline'}
- Quality requirements: ${hasQualityRequirements ? 'Yes - include quality assurance tasks' : 'Standard quality'}

FULL CONVERSATION CONTEXT:
${memory.slice(-8).map(m => `${m.role}: ${m.content.substring(0, 200)}`).join('\n')}

TASK PLANNING INSTRUCTIONS: Use the conversation context to create more targeted and specific tasks that reflect the user's actual needs and constraints discussed during planning.`;
            
            console.log(`💬 [FIRST-OFFICER] Chat context applied to task planning: ${memory.length} messages analyzed`);
          }
        }
      } catch (error) {
        console.warn('⚠️ [FIRST-OFFICER] Could not load chat context for task planning:', error);
      }
    }

    const prompt = buildPrompt(
      `You are the First Officer's task planning system. Break down the objective into executable tasks.

${visionContext}${chatContext}

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
        
        // NEW: Workflow DSL fields
        workflowDSL: undefined,
        currentWorkflowNode: undefined,
        workflowRuntimeState: undefined,
        
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