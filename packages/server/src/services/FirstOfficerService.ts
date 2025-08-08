/**
 * First Officer Service - Workflow Coordination Layer (Enhanced for 4-Phase Flow)
 * 
 * Manages First Officer Agent instances and coordinates expedition workflows.
 * Handles agent lifecycle, state persistence, and real-time communication.
 * 
 * Enhanced to support simplified 4-phase expedition flow:
 * Phase 1: Refine - Mission clarification and refinement  
 * Phase 2: Plan - Task breakdown and workflow generation
 * Phase 3: Execute - WorkflowDSL execution with user control
 * Phase 4: Result - Results synthesis and completion
 */

import { 
  FirstOfficerAgent, 
  LangChainMemoryStore, 
  ProviderFactory,
  createMCPEnabledFirstOfficerAgent,
  WebSocketEventEmitter
} from '@starships/agent-engine';
import { RepositoryFactory } from '@starships/models';
import {
  WorkflowPhase,
  ChatRequest,
  ChatResponse,
  ExpeditionPhase,
  ExpeditionStatus,
  phaseToStatus,
  statusToPhase
} from '@starships/protocol';
import { ExpeditionProgress } from '@starships/agent-engine';
import {
  ErrorFactory,
  NotFoundError,
  ValidationError,
  StandardError
} from '@starships/protocol/src/types/error-classes';
import { Logger } from '../utils/logger';
import { ContextBuilder } from './ContextBuilder';
import { SocketIOService } from './SocketIOService';

// Import 4-phase workflow components
import {
  createSimplified4PhaseWorkflow,
  Simplified4PhaseHandlers,
  Simplified4PhaseState,
  createInitial4PhaseState,
  is4PhaseExpedition,
  getNextPhase,
  DEFAULT_4PHASE_CONFIG
} from '@starships/agent-engine/src/first-officer/workflow/SimplifiedExpeditionWorkflow';

// Import WorkflowDSL integration service
import Workflow4PhaseIntegrationService from './Workflow4PhaseIntegrationService';

export class FirstOfficerService {
  private static instance: FirstOfficerService;
  private activeAgents: Map<string, FirstOfficerAgent> = new Map();
  private memoryStores: Map<string, LangChainMemoryStore> = new Map();
  private contextBuilder: ContextBuilder;
  private logger: Logger;
  private socketService: SocketIOService | null = null;
  
  // 4-Phase workflow management
  private active4PhaseWorkflows: Map<string, any> = new Map(); // expeditionId -> compiled workflow
  private workflow4PhaseStates: Map<string, Simplified4PhaseState> = new Map(); // expeditionId -> state
  private workflowIntegrationService: Workflow4PhaseIntegrationService;

  private constructor() {
    this.logger = Logger.getInstance();
    this.contextBuilder = new ContextBuilder();
    this.workflowIntegrationService = Workflow4PhaseIntegrationService.getInstance();
    // Note: SocketIOService will be accessed lazily when needed
  }

  /**
   * Get SocketIOService instance lazily
   */
  private getSocketService(): SocketIOService | null {
    if (!this.socketService) {
      try {
        this.socketService = SocketIOService.getInstance();
        this.logger.info('SocketIOService successfully connected');
      } catch (error) {
        this.logger.warn('SocketIOService not available', { error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    }
    return this.socketService;
  }

  static getInstance(): FirstOfficerService {
    if (!FirstOfficerService.instance) {
      FirstOfficerService.instance = new FirstOfficerService();
    }
    return FirstOfficerService.instance;
  }

  /**
   * Start expedition orchestration
   */
  async startExpedition(
    expeditionId: string,
    userId: string,
    objective: string
  ): Promise<string> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'startExpedition',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId, objective }
    };

    this.logger.info('Starting expedition orchestration', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation([
          { field: 'expeditionId', message: 'Expedition ID is required' }
        ], context);
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      if (!objective?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'objective', message: 'Expedition objective is required' }],
          context
        );
      }

      // Get expedition details
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw ErrorFactory.notFound(
          'Expedition',
          expeditionId,
          context
        );
      }

      // Initialize memory store for this expedition
      const memoryStore = new LangChainMemoryStore();
      this.memoryStores.set(expeditionId, memoryStore);

      // Create WebSocket message emission callback
      const messageEmitCallback = async (message: any) => {
        const socketSvc = this.getSocketService();
        if (socketSvc) {
          const expeditionRoom = `expedition:${expeditionId}`;
          const eventData = {
            expeditionId,
            message,
            timestamp: new Date().toISOString()
          };
          
          console.log(`📡 [FIRST-OFFICER-SERVICE] About to emit WebSocket event to room: ${expeditionRoom}`);
          console.log(`📡 [FIRST-OFFICER-SERVICE] Event data:`, JSON.stringify(eventData, null, 2));
          
          socketSvc.getIO().to(expeditionRoom).emit('message:sent', eventData);
          
          console.log(`✅ [FIRST-OFFICER-SERVICE] WebSocket event emitted successfully for First Officer message`);
        } else {
          console.warn(`⚠️ [FIRST-OFFICER-SERVICE] SocketIOService not available for message emission`);
        }
      };

      // Initialize ProviderFactory for LLM access
      const agentRepo = RepositoryFactory.getAgentRepository();
      const llmRepo = RepositoryFactory.getLLMRepository();
      ProviderFactory.initialize(agentRepo, llmRepo);

      // Create WebSocketEventEmitter with socket server
      const webSocketEmitter = new WebSocketEventEmitter();
      const socketSvc = this.getSocketService();
      if (socketSvc) {
        webSocketEmitter.setSocketServer(socketSvc.getIO());
      }

      // Create MCP-enabled First Officer Agent instance
      const firstOfficer = await await createMCPEnabledFirstOfficerAgent(
        expedition.starshipId,
        memoryStore,
        {
          maxRetries: 3,
          qualityThreshold: 70,
          timeoutMinutes: 60,
          requireUserApproval: false,
          enableParallelExecution: true,
          autoEscalation: true,
          mcpEnabled: true,
          mcpStarshipId: expedition.starshipId
        },
        expedition.assignedAgents, // Pass selected agents from expedition
        messageEmitCallback, // Pass WebSocket emission callback
        webSocketEmitter // Pass WebSocket event emitter for activity events
      );

      // Store active agent
      this.activeAgents.set(expeditionId, firstOfficer);

      // Emit expedition started event
      const socketSvcStart = this.getSocketService();
      if (socketSvcStart) {
        const expeditionRoom = `expedition:${expeditionId}`;
        socketSvcStart.getIO().to(expeditionRoom).emit('expedition:started' as any, {
          expeditionId,
          userId,
          objective,
          timestamp: new Date().toISOString(),
          assignedAgents: expedition.assignedAgents
        });
      }

      // Start orchestration with real-time updates
      const result = await firstOfficer.startExpedition(expeditionId, userId, objective);

      // Emit expedition completed event
      const socketSvcEnd = this.getSocketService();
      if (socketSvcEnd) {
        const expeditionRoom = `expedition:${expeditionId}`;
        socketSvcEnd.getIO().to(expeditionRoom).emit('expedition:completed' as any, {
          expeditionId,
          result: result.substring(0, 500), // Truncate for performance
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Expedition orchestration completed successfully', {
        ...context,
        metadata: { ...context.metadata, result: result.substring(0, 100) + '...' }
      });

      return result;

    } catch (error) {
      // Clean up on failure
      this.activeAgents.delete(expeditionId);
      this.memoryStores.delete(expeditionId);

      if (error instanceof StandardError) {
        this.logger.error('Failed to start expedition', context, error as StandardError);
        throw error;
      }

      const standardError = new StandardError(
        'EXPEDITION_WORKFLOW_FAILED',
        'Failed to start expedition orchestration',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to start expedition', context, error instanceof Error ? error : undefined);
      throw standardError;
    }
  }

  // ============================================================================
  // 4-PHASE EXPEDITION METHODS
  // ============================================================================

  /**
   * Start expedition with simplified 4-phase flow
   */
  async start4PhaseExpedition(
    expeditionId: string,
    userId: string,
    starshipId: string,
    originalMission: string,
    selectedAgents: string[],
    visionContext?: string
  ): Promise<{ 
    phase: ExpeditionPhase, 
    status: ExpeditionStatus, 
    message: string 
  }> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'start4PhaseExpedition',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId, starshipId, phase: 'refine' }
    };

    this.logger.info('Starting 4-phase expedition', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation([
          { field: 'expeditionId', message: 'Expedition ID is required' }
        ], context);
      }

      // Initialize 4-phase state
      const initialState = createInitial4PhaseState(
        expeditionId,
        userId,
        starshipId,
        originalMission,
        selectedAgents,
        visionContext
      );

      // Store state
      this.workflow4PhaseStates.set(expeditionId, initialState as Simplified4PhaseState);

      // Create 4-phase workflow handlers
      const handlers = this.create4PhaseHandlers(expeditionId);

      // Create and store compiled workflow
      const workflow = createSimplified4PhaseWorkflow(handlers, DEFAULT_4PHASE_CONFIG);
      this.active4PhaseWorkflows.set(expeditionId, workflow);

      // Update expedition in database
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.update(expeditionId, {
        status: 'refining',
        currentPhase: 'refine',
        phaseStartedAt: new Date().toISOString()
      });

      // Emit phase change event
      await this.emit4PhaseEvent(expeditionId, 'expedition:phase-changed', {
        fromPhase: null,
        toPhase: 'refine',
        phaseStartedAt: initialState.phaseStartedAt
      });

      this.logger.info('4-phase expedition started successfully', {
        ...context,
        metadata: { ...context.metadata, currentPhase: 'refine' }
      });

      return {
        phase: 'refine',
        status: 'refining',
        message: 'Expedition started in refinement phase. First Officer is ready to clarify your mission.'
      };

    } catch (error) {
      // Clean up on failure
      this.workflow4PhaseStates.delete(expeditionId);
      this.active4PhaseWorkflows.delete(expeditionId);

      if (error instanceof StandardError) {
        this.logger.error('Failed to start 4-phase expedition', context, error as StandardError);
        throw error;
      }

      const standardError = new StandardError(
        'EXPEDITION_4PHASE_START_FAILED',
        'Failed to start 4-phase expedition',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to start 4-phase expedition', context, error instanceof Error ? error : undefined);
      throw standardError;
    }
  }

  /**
   * Progress expedition to next phase
   */
  async progressPhase(
    expeditionId: string,
    userId: string,
    transitionData?: any
  ): Promise<{
    fromPhase: ExpeditionPhase,
    toPhase: ExpeditionPhase | null,
    success: boolean,
    message: string
  }> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'progressPhase',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId }
    };

    this.logger.info('Progressing expedition phase', context);

    try {
      // Get current state
      const currentState = this.workflow4PhaseStates.get(expeditionId);
      if (!currentState) {
        throw ErrorFactory.notFound('4PhaseWorkflow', expeditionId, context);
      }

      const currentPhase = currentState.currentPhase;
      const nextPhase = getNextPhase(currentPhase);

      if (!nextPhase) {
        return {
          fromPhase: currentPhase,
          toPhase: null,
          success: false,
          message: 'Expedition is already in final phase'
        };
      }

      // Get workflow
      const workflow = this.active4PhaseWorkflows.get(expeditionId);
      if (!workflow) {
        throw ErrorFactory.notFound('4PhaseWorkflowInstance', expeditionId, context);
      }

      // Update state for phase transition
      const updatedState = {
        ...currentState,
        currentPhase: nextPhase,
        expeditionStatus: phaseToStatus[nextPhase],
        phaseStartedAt: new Date().toISOString(),
        phaseCompletedAt: undefined,
        lastUpdated: new Date().toISOString(),
        ...transitionData
      };

      // Store updated state
      this.workflow4PhaseStates.set(expeditionId, updatedState);

      // Update database
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.update(expeditionId, {
        status: phaseToStatus[nextPhase],
        currentPhase: nextPhase,
        phaseStartedAt: updatedState.phaseStartedAt
      });

      // Emit phase change event
      await this.emit4PhaseEvent(expeditionId, 'expedition:phase-changed', {
        fromPhase: currentPhase,
        toPhase: nextPhase,
        phaseStartedAt: updatedState.phaseStartedAt,
        transitionData
      });

      this.logger.info('Phase progression completed', {
        ...context,
        metadata: { ...context.metadata, fromPhase: currentPhase, toPhase: nextPhase }
      });

      return {
        fromPhase: currentPhase,
        toPhase: nextPhase,
        success: true,
        message: `Expedition progressed from ${currentPhase} to ${nextPhase} phase`
      };

    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to progress phase', context, error as StandardError);
        throw error;
      }

      const standardError = new StandardError(
        'EXPEDITION_PHASE_PROGRESSION_FAILED',
        'Failed to progress expedition phase',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to progress phase', context, error instanceof Error ? error : undefined);
      throw standardError;
    }
  }

  /**
   * Approve plan and prepare for execution
   */
  async approvePlan(
    expeditionId: string,
    userId: string,
    approved: boolean,
    comments?: string
  ): Promise<{ 
    approved: boolean, 
    readyForExecution: boolean, 
    message: string 
  }> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'approvePlan',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId, approved }
    };

    this.logger.info('Processing plan approval', context);

    try {
      // Get current state
      const currentState = this.workflow4PhaseStates.get(expeditionId);
      if (!currentState || currentState.currentPhase !== 'plan') {
        throw ErrorFactory.validation([
          { field: 'phase', message: 'Expedition must be in planning phase for approval' }
        ], context);
      }

      // Update state with approval
      const updatedState = {
        ...currentState,
        userApprovedPlan: approved,
        planApprovedAt: approved ? new Date().toISOString() : undefined,
        userResponse: comments,
        lastUpdated: new Date().toISOString()
      };

      // Store updated state
      this.workflow4PhaseStates.set(expeditionId, updatedState);

      // Update database
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.update(expeditionId, {
        userApprovedPlan: approved,
        planApprovedAt: updatedState.planApprovedAt,
        userResponse: comments
      });

      // Emit plan approval event
      await this.emit4PhaseEvent(expeditionId, approved ? 'expedition:plan-approved' : 'expedition:plan-rejected', {
        approved,
        approvedAt: updatedState.planApprovedAt,
        userComments: comments
      });

      const message = approved 
        ? 'Plan approved successfully. Ready to start execution.'
        : 'Plan rejected. Please request modifications or create a new plan.';

      this.logger.info('Plan approval processed', {
        ...context,
        metadata: { ...context.metadata, readyForExecution: approved }
      });

      return {
        approved,
        readyForExecution: approved,
        message
      };

    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to approve plan', context, error as StandardError);
        throw error;
      }

      const standardError = new StandardError(
        'EXPEDITION_PLAN_APPROVAL_FAILED',
        'Failed to process plan approval',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to approve plan', context, error instanceof Error ? error : undefined);
      throw standardError;
    }
  }

  /**
   * Start execution phase (user-triggered)
   */
  async startExecution(
    expeditionId: string,
    userId: string,
    executionConfig?: any
  ): Promise<{ 
    executionStarted: boolean, 
    message: string,
    estimatedDuration?: number 
  }> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'startExecution',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId }
    };

    this.logger.info('Starting expedition execution', context);

    try {
      // Get current state
      const currentState = this.workflow4PhaseStates.get(expeditionId);
      if (!currentState) {
        throw ErrorFactory.notFound('4PhaseWorkflow', expeditionId, context);
      }

      if (currentState.currentPhase !== 'plan' || !currentState.userApprovedPlan) {
        throw ErrorFactory.validation([
          { field: 'phase', message: 'Plan must be approved before starting execution' }
        ], context);
      }

      // Progress to execute phase
      const result = await this.progressPhase(expeditionId, userId, {
        executionStartedAt: new Date().toISOString(),
        executionConfig
      });

      // Emit execution started event
      await this.emit4PhaseEvent(expeditionId, 'expedition:execution-started', {
        executionStartedAt: new Date().toISOString(),
        workflowDSL: currentState.workflowDSL,
        estimatedDuration: currentState.estimatedDuration
      });

      this.logger.info('Expedition execution started', {
        ...context,
        metadata: { ...context.metadata, phase: 'execute' }
      });

      return {
        executionStarted: true,
        message: 'Execution started successfully. Workflow is now running.',
        estimatedDuration: currentState.estimatedDuration
      };

    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to start execution', context, error as StandardError);
        throw error;
      }

      const standardError = new StandardError(
        'EXPEDITION_EXECUTION_START_FAILED',
        'Failed to start expedition execution',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to start execution', context, error instanceof Error ? error : undefined);
      throw standardError;
    }
  }

  /**
   * Get current 4-phase expedition state
   */
  async get4PhaseState(expeditionId: string): Promise<Simplified4PhaseState | null> {
    return this.workflow4PhaseStates.get(expeditionId) || null;
  }

  /**
   * Check if expedition is using 4-phase flow
   */
  is4PhaseExpedition(expeditionId: string): boolean {
    return this.workflow4PhaseStates.has(expeditionId);
  }

  // ============================================================================
  // 4-PHASE HELPER METHODS
  // ============================================================================

  /**
   * Create 4-phase workflow handlers for an expedition
   */
  private create4PhaseHandlers(expeditionId: string): Simplified4PhaseHandlers {
    return {
      // Core phase handlers - These will be implemented by specific handler classes
      refineMission: async (state) => {
        // TODO: Implement mission refinement logic
        // For now, return mock refined data
        return {
          refinedMission: state.originalMission + " (refined)",
          refinedRequirements: ["Requirement 1", "Requirement 2"],
          missionComplexity: 'moderate' as const,
          estimatedDuration: 120,
          currentPhase: 'plan' as const,
          expeditionStatus: 'planning' as const,
          lastUpdated: new Date().toISOString()
        };
      },

      planWorkflow: async (state) => {
        try {
          // Generate task breakdown using integration service
          const taskBreakdownResult = await this.workflowIntegrationService.generateTaskBreakdown(
            state.expeditionId,
            state.refinedMission,
            state.refinedRequirements,
            state.missionComplexity || 'moderate',
            Object.keys(state.planningContext?.selectedAgents || {})
          );

          // Generate WorkflowDSL using integration service
          const workflowResult = await this.workflowIntegrationService.generateWorkflowDSL(
            state.expeditionId,
            taskBreakdownResult.tasks,
            taskBreakdownResult.agentAssignments,
            state.refinedMission
          );

          return {
            taskBreakdown: taskBreakdownResult.tasks,
            agentAssignments: taskBreakdownResult.agentAssignments,
            dependencyGraph: taskBreakdownResult.dependencyGraph,
            workflowDSL: workflowResult.workflowDSL,
            workflowVisualization: workflowResult.visualization,
            planApprovalRequired: true,
            userApprovedPlan: false,
            lastUpdated: new Date().toISOString()
          };
        } catch (error) {
          // Handle error and provide fallback
          this.logger.error('Failed to generate plan workflow', {
            service: 'FirstOfficerService',
            operation: 'planWorkflow',
            expeditionId: state.expeditionId,
            error: error instanceof Error ? error.message : String(error)
          });
          
          return {
            errors: [...(state.errors || []), {
              phase: 'plan' as const,
              error: `Plan generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              timestamp: new Date().toISOString(),
              recoverable: true
            }],
            lastUpdated: new Date().toISOString()
          };
        }
      },

      executeWorkflow: async (state) => {
        try {
          // Check if workflow execution has been initialized
          if (!state.workflowRuntimeState && state.workflowDSL && state.userApprovedPlan) {
            // Initialize workflow execution
            const initResult = await this.workflowIntegrationService.initializeWorkflowExecution(
              state.expeditionId,
              state.workflowDSL,
              {
                userId: state.userId,
                expeditionId: state.expeditionId,
                selectedAgents: Object.keys(state.agentAssignments || {})
              }
            );

            // Update state with runtime information
            return {
              workflowRuntimeState: initResult.runtimeState,
              executionProgress: 10, // Started
              executionComplete: false,
              lastUpdated: new Date().toISOString()
            };
          }

          // If execution is already running, monitor progress
          if (state.workflowRuntimeState && !state.executionComplete) {
            const progress = await this.workflowIntegrationService.monitorWorkflowExecution(
              state.expeditionId,
              state.workflowRuntimeState.id
            );

            const isComplete = progress.progress >= 100;

            return {
              executionProgress: progress.progress,
              currentWorkflowNode: progress.currentNode,
              executionComplete: isComplete,
              executionSummary: isComplete ? "Workflow execution completed successfully" : undefined,
              agentOutputs: isComplete ? {} : state.agentOutputs, // TODO: Get actual agent outputs
              currentPhase: isComplete ? 'result' as const : state.currentPhase,
              expeditionStatus: isComplete ? 'completed' as const : state.expeditionStatus,
              lastUpdated: new Date().toISOString()
            };
          }

          // If execution is already complete, return current state
          return {
            lastUpdated: new Date().toISOString()
          };

        } catch (error) {
          this.logger.error('Failed to execute workflow', {
            service: 'FirstOfficerService',
            operation: 'executeWorkflow',
            expeditionId: state.expeditionId,
            error: error instanceof Error ? error.message : String(error)
          });

          return {
            errors: [...(state.errors || []), {
              phase: 'execute' as const,
              error: `Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              timestamp: new Date().toISOString(),
              recoverable: true
            }],
            executionComplete: false,
            lastUpdated: new Date().toISOString()
          };
        }
      },

      synthesizeResult: async (state) => {
        // TODO: Implement result synthesis logic
        // For now, return mock results
        return {
          finalResult: "Mock final result",
          expeditionSummary: "Mock expedition summary",
          qualityScore: 85,
          keyAchievements: ["Achievement 1", "Achievement 2"],
          lessonsLearned: ["Lesson 1", "Lesson 2"],
          deliverables: [],
          lastUpdated: new Date().toISOString()
        };
      },

      // Supporting handlers
      handleUserApproval: async (state) => {
        // User approval is handled by the service layer
        return {
          requiresUserInput: true,
          userPrompt: "Please review and approve the generated plan",
          lastUpdated: new Date().toISOString()
        };
      },

      handleError: async (state) => {
        // Error handling logic
        return {
          expeditionStatus: 'failed' as const,
          errors: [...(state.errors || []), {
            phase: state.currentPhase,
            error: "Expedition failed",
            timestamp: new Date().toISOString(),
            recoverable: false
          }],
          lastUpdated: new Date().toISOString()
        };
      },

      handlePause: async (state) => {
        // Pause handling logic
        return {
          expeditionStatus: 'paused' as const,
          lastUpdated: new Date().toISOString()
        };
      },

      // Chat support handlers
      refreshContext: async (state) => {
        // Context refresh logic for chat
        return {
          lastUpdated: new Date().toISOString()
        };
      },

      processMessage: async (state) => {
        // Message processing logic for refinement phase
        return {
          lastUpdated: new Date().toISOString()
        };
      }
    };
  }

  /**
   * Emit 4-phase specific WebSocket events
   */
  private async emit4PhaseEvent(
    expeditionId: string, 
    eventType: string, 
    data: any
  ): Promise<void> {
    const socketSvc = this.getSocketService();
    if (socketSvc) {
      const expeditionRoom = `expedition:${expeditionId}`;
      const eventData = {
        expeditionId,
        data,
        timestamp: new Date().toISOString()
      };

      this.logger.debug('Emitting 4-phase WebSocket event', {
        service: 'FirstOfficerService',
        operation: 'emit4PhaseEvent',
        metadata: { eventType, expeditionId, room: expeditionRoom }
      });

      socketSvc.getIO().to(expeditionRoom).emit(eventType as any, eventData);
    }
  }


  /**
   * Resume an interrupted expedition
   */
  async resumeExpedition(
    expeditionId: string,
    userId: string
  ): Promise<string> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'resumeExpedition',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId }
    };

    this.logger.info('Resuming expedition from checkpoint', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation([
          { field: 'expeditionId', message: 'Expedition ID is required' }
        ], context);
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      // Get the active First Officer agent
      const firstOfficer = this.activeAgents.get(expeditionId);
      
      if (!firstOfficer) {
        this.logger.warn('No active First Officer found, creating new instance', context);
        
        // Recreate the First Officer instance
        const expedition = await RepositoryFactory.getExpeditionRepository().findById(expeditionId);
        if (!expedition) {
          throw ErrorFactory.notFound('Expedition', expeditionId, context);
        }

        // Get or create memory store
        let memoryStore = this.memoryStores.get(expeditionId);
        if (!memoryStore) {
          memoryStore = new LangChainMemoryStore();
          this.memoryStores.set(expeditionId, memoryStore);
        }

        // Create WebSocket message emission callback
        const messageEmitCallback = async (message: any) => {
          const socketSvc = this.getSocketService();
          if (socketSvc) {
            const expeditionRoom = `expedition:${expeditionId}`;
            socketSvc.getIO().to(expeditionRoom).emit('message:sent', {
              expeditionId,
              message,
              timestamp: new Date().toISOString()
            });
          }
        };

        // Create WebSocketEventEmitter with socket server
        const webSocketEmitter = new WebSocketEventEmitter();
        const socketSvcEmitter = this.getSocketService();
        if (socketSvcEmitter) {
          webSocketEmitter.setSocketServer(socketSvcEmitter.getIO());
        }

        // Create MCP-enabled First Officer Agent instance
        const newFirstOfficer = await await createMCPEnabledFirstOfficerAgent(
          expedition.starshipId,
          memoryStore,
          {
            maxRetries: 3,
            qualityThreshold: 70,
            timeoutMinutes: 60,
            requireUserApproval: false,
            enableParallelExecution: false,
            autoEscalation: true,
            mcpEnabled: true,
            mcpStarshipId: expedition.starshipId
          },
          expedition.assignedAgents,
          messageEmitCallback,
          webSocketEmitter
        );

        this.activeAgents.set(expeditionId, newFirstOfficer);
        
        // Resume the expedition
        const result = await (newFirstOfficer as any).resumeExpedition(expeditionId, userId);
        
        this.logger.info('Expedition resumed successfully', {
          ...context,
          metadata: { ...context.metadata, fromCheckpoint: true }
        });
        
        return result;
      }
      
      // Use existing First Officer to resume
      const result = await (firstOfficer as any).resumeExpedition(expeditionId, userId);
      
      this.logger.info('Expedition resumed successfully', {
        ...context,
        metadata: { ...context.metadata, fromCheckpoint: true }
      });
      
      return result;
      
    } catch (error) {
      this.logger.error('Failed to resume expedition', context, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Pause expedition orchestration
   */
  async pauseExpedition(expeditionId: string): Promise<void> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'pauseExpedition',
      resource: 'expedition',
      resourceId: expeditionId
    };

    this.logger.info('Pausing expedition orchestration', context);

    try {
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      const firstOfficer = this.activeAgents.get(expeditionId);
      if (!firstOfficer) {
        throw ErrorFactory.notFound(
          'First Officer',
          expeditionId,
          context
        );
      }

      // Update expedition status
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateStatus(expeditionId, 'in-progress');

      this.logger.info('Expedition orchestration paused successfully', context);
    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to pause expedition', context, error as StandardError);
        throw error;
      }

      const standardError = new StandardError(
        'STATUS_UPDATE_FAILED',
        'Failed to pause expedition orchestration',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to pause expedition', context, error instanceof Error ? error : undefined);
      throw standardError;
    }
  }

  /**
   * Resume expedition orchestration (deprecated - use resumeExpedition with userId)
   */
  async resumeExpeditionDeprecated(expeditionId: string): Promise<void> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'resumeExpedition',
      resource: 'expedition',
      resourceId: expeditionId
    };

    this.logger.info('Resuming expedition orchestration', context);

    try {
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      const firstOfficer = this.activeAgents.get(expeditionId);
      if (!firstOfficer) {
        throw ErrorFactory.notFound(
          'First Officer',
          expeditionId,
          context
        );
      }

      // Update expedition status
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateStatus(expeditionId, 'in-progress');

      this.logger.info('Expedition orchestration resumed successfully', context);
    } catch (error) {
      if (error instanceof StandardError) {
        this.logger.error('Failed to resume expedition', context, error as StandardError);
        throw error;
      }

      const standardError = new StandardError(
        'STATUS_UPDATE_FAILED',
        'Failed to resume expedition orchestration',
        { originalError: error instanceof Error ? error.message : String(error) },
        context
      );

      this.logger.error('Failed to resume expedition', context, error instanceof Error ? error : undefined);
      throw standardError;
    }
  }

  /**
   * Cancel expedition orchestration
   */
  async cancelExpedition(expeditionId: string): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Cancelling expedition: ${expeditionId}`);

    const firstOfficer = this.activeAgents.get(expeditionId);
    if (firstOfficer) {
      // Clean up active agent and memory
      this.activeAgents.delete(expeditionId);
      this.memoryStores.delete(expeditionId);
    }

    // Update expedition status
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    await expeditionRepo.updateStatus(expeditionId, 'cancelled');

    console.log(`[FIRST-OFFICER-SERVICE] Expedition cancelled: ${expeditionId}`);
  }

  /**
   * Handle user message during expedition
   */
  async handleUserMessage(
    expeditionId: string,
    userId: string,
    message: string
  ): Promise<ChatResponse> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'handleUserMessage',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId, messageLength: message?.length }
    };

    this.logger.info('Handling user message for expedition', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      if (!message?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'message', message: 'Message content is required' }],
          context
        );
      }

      let firstOfficer = this.activeAgents.get(expeditionId);
      if (!firstOfficer) {
        // Create a FirstOfficerAgent for this expedition to handle chat
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);
        
        if (!expedition) {
          throw ErrorFactory.notFound(
            'Expedition',
            expeditionId,
            context
          );
        }

        // Create FirstOfficerAgent for chat handling
        const memoryStore = this.memoryStores.get(expeditionId) || new LangChainMemoryStore();
        this.memoryStores.set(expeditionId, memoryStore);
        
        // Create WebSocket message emission callback
        const messageEmitCallback = async (message: any) => {
          const socketSvc = this.getSocketService();
          if (socketSvc) {
            const expeditionRoom = `expedition:${expeditionId}`;
            const eventData = {
              expeditionId,
              message,
              timestamp: new Date().toISOString()
            };
            socketSvc.getIO().to(expeditionRoom).emit('message:sent', eventData);
          }
        };

        // Create WebSocketEventEmitter
        const webSocketEmitter = new WebSocketEventEmitter();
        const socketSvc = this.getSocketService();
        if (socketSvc) {
          webSocketEmitter.setSocketServer(socketSvc.getIO());
        }
        
        firstOfficer = await createMCPEnabledFirstOfficerAgent(
          expedition.starshipId,
          memoryStore,
          {
            maxRetries: 3,
            qualityThreshold: 70,
            timeoutMinutes: 60,
            requireUserApproval: false,
            enableParallelExecution: false,
            autoEscalation: true,
            mcpEnabled: true,
            mcpStarshipId: expedition.starshipId
          },
          expedition.assignedAgents || [],
          messageEmitCallback,
          webSocketEmitter
        );
        
        // Store the agent for reuse
        this.activeAgents.set(expeditionId, firstOfficer);
      }

      // Use FirstOfficerAgent to handle chat message
      try {
        // Get expedition to get starshipId
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);
        
        // Process message using the consolidated workflow's chat capabilities
        const response = await firstOfficer.handleUserMessage(expeditionId, message);

        this.logger.info('Successfully processed user message', {
          ...context,
          responseLength: response.reply.length
        });

        return response;
      } catch (chatError) {
        this.logger.error('Chat processing failed, falling back to simple response', context, chatError instanceof Error ? chatError : undefined);
        
        return {
          reply: 'I apologize, but I encountered an issue processing your message. Please try again.'
        };
      }
    } catch (error) {
      this.logger.error('Failed to handle user message', context, error instanceof Error ? error : undefined);
      
      return {
        reply: 'I encountered an error processing your message. Please try again.'
      };
    }
  }

  /**
   * Get expedition progress
   */
  async getExpeditionProgress(expeditionId: string): Promise<ExpeditionProgress | null> {
    const firstOfficer = this.activeAgents.get(expeditionId);
    if (!firstOfficer) {
      return null;
    }

    return await firstOfficer.getExpeditionStatus(expeditionId);
  }

  /**
   * Get active expeditions count
   */
  getActiveExpeditionsCount(): number {
    return this.activeAgents.size;
  }

  /**
   * Get active expedition IDs
   */
  getActiveExpeditionIds(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  /**
   * Check if expedition is active
   */
  isExpeditionActive(expeditionId: string): boolean {
    return this.activeAgents.has(expeditionId);
  }

  /**
   * Clean up completed expedition
   */
  async cleanupExpedition(expeditionId: string): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Cleaning up expedition: ${expeditionId}`);

    // Remove from active agents
    this.activeAgents.delete(expeditionId);
    
    // Clean up memory store
    const memoryStore = this.memoryStores.get(expeditionId);
    if (memoryStore) {
      // Memory cleanup would be handled by the store implementation
      this.memoryStores.delete(expeditionId);
    }

    console.log(`[FIRST-OFFICER-SERVICE] Expedition cleanup completed: ${expeditionId}`);
  }

  /**
   * Handle expedition status updates from First Officer
   */
  async handleStatusUpdate(
    expeditionId: string,
    phase: WorkflowPhase,
    progress: ExpeditionProgress
  ): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Status update for ${expeditionId}: ${phase}`);

    try {
      // TODO: Replace with new WorkflowDSL system in Phase 2
      // Update expedition workflow state - TEMPORARILY DISABLED
      // const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      // const expedition = await expeditionRepo.findById(expeditionId);
      
      console.log(`[FIRST-OFFICER-SERVICE] Status update handled: ${phase} (workflow state update disabled - will be replaced with WorkflowDSL system)`);
    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to handle status update:`, error);
    }
  }

  /**
   * Handle task completion from First Officer
   */
  async handleTaskCompletion(
    expeditionId: string,
    taskId: string,
    result: string,
    agentId: string
  ): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Task completed: ${taskId} in expedition: ${expeditionId}`);

    try {
      // Update task status
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      await taskRepo.update(taskId, {
        status: 'completed',
        result,
        updatedAt: new Date().toISOString()
      });

      // Get expedition details for user notification
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to handle task completion:`, error);
    }
  }

  /**
   * Handle expedition completion
   */
  async handleExpeditionCompletion(
    expeditionId: string,
    finalResult: string
  ): Promise<void> {
    console.log(`[FIRST-OFFICER-SERVICE] Expedition completed: ${expeditionId}`);

    try {
      // Update expedition status and result
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.update(expeditionId, {
        status: 'completed',
        result: finalResult,
        updatedAt: new Date().toISOString()
      });


      // Clean up resources
      await this.cleanupExpedition(expeditionId);
    } catch (error) {
      console.error(`[FIRST-OFFICER-SERVICE] Failed to handle expedition completion:`, error);
    }
  }

  /**
   * Calculate expedition duration
   */
  private calculateExpeditionDuration(expeditionId: string): number {
    // This would calculate the actual duration based on start/end times
    // For now, return a placeholder value
    return 0;
  }

  /**
   * Build complete expedition context with all details
   */
  private async buildCompleteExpeditionContext(expedition: any): Promise<any> {
    const agentRepo = RepositoryFactory.getAgentRepository();
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const resultRepo = RepositoryFactory.getExpeditionResultRepository();
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();

    // Fetch all tasks for the expedition first
    const allTasks = await taskRepo.findByExpedition(expedition.id);

    // Fetch agent details with their current tasks
    const assignedAgents = [];
    for (const agentId of (expedition.assignedAgents || [])) {
      try {
        const agent = await agentRepo.findById(agentId);
        if (agent) {
          // Get tasks assigned to this agent
          const agentTasks = allTasks.filter(task => task.assignedAgentId === agentId);
          const activeTasks = agentTasks.filter(t => t.status === 'in-progress' || t.status === 'assigned');
          const completedTasks = agentTasks.filter(t => t.status === 'completed');
          
          this.logger.debug('Found agent details with tasks', {
            service: 'FirstOfficerService',
            operation: 'buildCompleteExpeditionContext',
            agentId: agent.id,
            agentName: agent.name,
            agentCategory: agent.category,
            totalTasks: agentTasks.length,
            activeTasks: activeTasks.length,
            completedTasks: completedTasks.length
          });
          
          // Determine agent status based on active tasks
          let agentStatus: 'online' | 'offline' | 'busy' = 'online';
          if (activeTasks.length > 0) {
            agentStatus = 'busy';
          }
          
          assignedAgents.push({
            id: agent.id,
            name: agent.name,
            role: agent.category || 'general',
            status: agentStatus,
            currentTasks: activeTasks.map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              progress: 0  // ExpeditionTask doesn't have progress field
            })),
            completedTasksCount: completedTasks.length,
            totalTasksCount: agentTasks.length
          });
        } else {
          this.logger.warn('Agent not found in database', {
            service: 'FirstOfficerService',
            operation: 'buildCompleteExpeditionContext',
            agentId
          });
        }
      } catch (error) {
        this.logger.warn('Failed to fetch agent details', {
          service: 'FirstOfficerService',
          operation: 'buildCompleteExpeditionContext',
          agentId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Create enhanced task summaries with agent names
    const agentMap = new Map(assignedAgents.map(a => [a.id, a]));
    const taskSummaries = allTasks.map(task => {
      const assignedAgent = task.assignedAgentId ? agentMap.get(task.assignedAgentId) : null;
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedAgentId,
        assignedAgentName: assignedAgent?.name || 'Unassigned',
        priority: task.priority || 'medium',
        progress: 0,  // ExpeditionTask doesn't have progress field
        createdAt: task.createdAt,
        completedAt: task.status === 'completed' ? task.updatedAt : undefined
      };
    });

    // Fetch recent results
    const results = await resultRepo.findByExpedition(expedition.id);
    const resultSummaries = results.slice(0, 10).map(result => ({
      id: result.id,
      taskId: '',
      content: result.content,
      createdAt: result.createdAt,
      createdBy: result.createdBy
    }));

    // Fetch recent messages
    const messages = await messageRepo.getLatestMessages(expedition.id, 20);
    const messageSummaries = messages.map(msg => ({
      id: msg.id,
      sender: msg.agentId || msg.userId || 'system',
      content: msg.content,
      timestamp: msg.timestamp,
      type: msg.role === 'user' ? 'user' as const : msg.role === 'agent' ? 'agent' as const : 'system' as const
    }));

    // Calculate statistics
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const activeTasks = allTasks.filter(t => t.status === 'in-progress' || t.status === 'assigned').length;
    const failedTasks = allTasks.filter(t => t.status === 'failed').length;
    const blockedTasks = allTasks.filter(t => t.status === 'blocked').length;

    return {
      expeditionId: expedition.id,
      starshipId: expedition.starshipId,
      state: expedition.status || 'active',
      title: expedition.name || 'Expedition',
      objective: expedition.mission || 'Complete expedition tasks',
      createdAt: expedition.createdAt,
      assignedAgents,
      tasks: taskSummaries,
      results: resultSummaries,
      recentMessages: messageSummaries,
      statistics: {
        totalTasks: allTasks.length,
        completedTasks,
        activeTasks,
        failedTasks,
        blockedTasks,
        totalMessages: messages.length,
        averageCompletionTime: 0,
        agentsWorking: assignedAgents.filter(a => a.currentTasks && a.currentTasks.length > 0).length,
        totalAgents: assignedAgents.length
      }
    };
  }

  /**
   * Initialize chat for expedition - sends greeting if this is the first time
   * Should be called when user first opens expedition chat interface
   */
  async initializeChat(
    expeditionId: string,
    userId: string
  ): Promise<ChatResponse | null> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'initializeChat',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId }
    };

    this.logger.info('Initializing chat for expedition', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      // Get expedition to ensure it exists
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw ErrorFactory.notFound(
          'Expedition',
          expeditionId,
          context
        );
      }

      // Create or get existing FirstOfficerAgent
      let firstOfficer = this.activeAgents.get(expeditionId);
      
      if (!firstOfficer) {
        // Create FirstOfficerAgent for chat initialization
        const memoryStore = this.memoryStores.get(expeditionId) || new LangChainMemoryStore();
        this.memoryStores.set(expeditionId, memoryStore);
        
        // Create WebSocket message emission callback
        const messageEmitCallback = async (message: any) => {
          const socketSvc = this.getSocketService();
          if (socketSvc) {
            const expeditionRoom = `expedition:${expeditionId}`;
            const eventData = {
              expeditionId,
              message,
              timestamp: new Date().toISOString()
            };
            socketSvc.getIO().to(expeditionRoom).emit('message:sent', eventData);
          }
        };

        // Create WebSocketEventEmitter
        const webSocketEmitter = new WebSocketEventEmitter();
        const socketSvc = this.getSocketService();
        if (socketSvc) {
          webSocketEmitter.setSocketServer(socketSvc.getIO());
        }
        
        firstOfficer = await createMCPEnabledFirstOfficerAgent(
          expedition.starshipId,
          memoryStore,
          {
            maxRetries: 3,
            qualityThreshold: 70,
            timeoutMinutes: 60,
            requireUserApproval: false,
            enableParallelExecution: false,
            autoEscalation: true,
            mcpEnabled: true,
            mcpStarshipId: expedition.starshipId
          },
          expedition.assignedAgents || [],
          messageEmitCallback,
          webSocketEmitter
        );
        
        this.activeAgents.set(expeditionId, firstOfficer);
      }

      // Initialize chat (sends greeting if needed)
      const greetingResponse = await firstOfficer.initializeChat(expeditionId);

      if (greetingResponse) {
        this.logger.info('Chat initialized with greeting', {
          ...context,
          responseLength: greetingResponse.reply.length
        });
      } else {
        this.logger.info('Chat already initialized, no greeting sent', context);
      }

      return greetingResponse;
    } catch (error) {
      this.logger.error('Failed to initialize chat', context, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Check if expedition is ready to start based on user interaction count
   */
  async checkExpeditionReadiness(
    expeditionId: string,
    userId: string
  ): Promise<{
    isReady: boolean;
    userMessageCount: number;
    reason?: string;
  }> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'checkExpeditionReadiness',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId }
    };

    this.logger.info('Checking expedition readiness', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      // Get expedition to ensure it exists
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw ErrorFactory.notFound(
          'Expedition',
          expeditionId,
          context
        );
      }

      // Create or get existing FirstOfficerAgent
      let firstOfficer = this.activeAgents.get(expeditionId);
      
      if (!firstOfficer) {
        // Create MCP-enabled FirstOfficerAgent for readiness check
        const memoryStore = this.memoryStores.get(expeditionId) || new LangChainMemoryStore();
        this.memoryStores.set(expeditionId, memoryStore);
        
        firstOfficer = await createMCPEnabledFirstOfficerAgent(
          expedition.starshipId,
          memoryStore,
          {
            maxRetries: 3,
            qualityThreshold: 70,
            timeoutMinutes: 60,
            requireUserApproval: false,
            enableParallelExecution: false,
            autoEscalation: true,
            mcpEnabled: true,
            mcpStarshipId: expedition.starshipId
          },
          expedition.assignedAgents || [],
          undefined, // no message callback needed for readiness check
          undefined  // no websocket emitter needed
        );
        
        this.activeAgents.set(expeditionId, firstOfficer);
      }

      // Check readiness using FirstOfficerAgent
      const readinessResult = await firstOfficer.isExpeditionReadyToStart(expeditionId, userId);

      this.logger.info('Expedition readiness checked successfully', {
        ...context,
        isReady: readinessResult.isReady,
        userMessageCount: readinessResult.userMessageCount,
        reason: readinessResult.reason
      });

      return readinessResult;
    } catch (error) {
      this.logger.error('Failed to check expedition readiness', context, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get memory messages for expedition (includes greetings and chat history)
   */
  async getMemoryMessages(
    expeditionId: string,
    userId: string
  ): Promise<any[]> {
    const context = {
      service: 'FirstOfficerService',
      operation: 'getMemoryMessages',
      resource: 'expedition',
      resourceId: expeditionId,
      metadata: { userId }
    };

    this.logger.info('Getting memory messages for expedition', context);

    try {
      // Validate inputs
      if (!expeditionId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'expeditionId', message: 'Expedition ID is required' }],
          context
        );
      }

      if (!userId?.trim()) {
        throw ErrorFactory.validation(
          [{ field: 'userId', message: 'User ID is required' }],
          context
        );
      }

      // Get expedition to determine the correct user for memory lookup
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (!expedition) {
        throw ErrorFactory.notFound(
          'Expedition',
          expeditionId,
          context
        );
      }

      // Create memory store to access the session
      const memoryStore = new LangChainMemoryStore();
      const sessionKey = memoryStore.makeKey('first-officer', expedition.createdBy, expeditionId);
      
      this.logger.debug('Retrieving memory entries', { ...context, sessionKey });
      
      // Get memory entries
      const memoryEntries = await memoryStore.get(sessionKey);
      
      this.logger.info('Memory messages retrieved successfully', {
        ...context,
        entriesCount: memoryEntries.length
      });

      return memoryEntries;
    } catch (error) {
      this.logger.error('Failed to get memory messages', context, error instanceof Error ? error : undefined);
      throw error;
    }
  }

}
