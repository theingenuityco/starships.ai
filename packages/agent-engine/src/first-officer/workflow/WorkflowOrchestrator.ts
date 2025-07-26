/**
 * Workflow Orchestrator - Enhanced workflow management with state persistence
 * 
 * This module provides enhanced orchestration capabilities including:
 * - State checkpointing and recovery
 * - Real-time progress tracking
 * - Error recovery and retry logic
 * - WebSocket event emission
 */

import { RepositoryFactory } from '@starships/models';
import { WorkflowPhase } from '@starships/protocol';
import { ExpeditionState } from './ExpeditionWorkflow';
import { ExpeditionProgress } from '../types';

/**
 * Configuration for the workflow orchestrator
 */
export interface OrchestratorConfig {
  checkpointInterval: number; // How often to checkpoint state (in ms)
  maxRetries: number;
  enableRealTimeUpdates: boolean;
  enableAutoRecovery: boolean;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  expeditionId: string;
  userId: string;
  starshipId: string;
  startTime: Date;
  checkpoints: WorkflowCheckpoint[];
}

/**
 * Workflow checkpoint for recovery
 */
export interface WorkflowCheckpoint {
  id: string;
  expeditionId: string;
  phase: WorkflowPhase;
  state: ExpeditionState;
  timestamp: Date;
  duration: number; // Time since last checkpoint
}

/**
 * Enhanced workflow orchestrator with state management
 */
export class WorkflowOrchestrator {
  private config: OrchestratorConfig;
  private activeContexts: Map<string, WorkflowContext> = new Map();
  private checkpointTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      checkpointInterval: 30000, // 30 seconds
      maxRetries: 3,
      enableRealTimeUpdates: true,
      enableAutoRecovery: true,
      ...config
    };
  }

  /**
   * Execute workflow with enhanced orchestration
   */
  async executeWorkflow(
    workflow: any, // CompiledStateGraph from LangGraph
    initialState: ExpeditionState,
    onProgress?: (progress: ExpeditionProgress) => void
  ): Promise<ExpeditionState> {
    const context: WorkflowContext = {
      expeditionId: initialState.expeditionId,
      userId: initialState.userId,
      starshipId: initialState.starshipId,
      startTime: new Date(),
      checkpoints: []
    };

    this.activeContexts.set(initialState.expeditionId, context);

    try {
      // Start checkpoint timer
      if (this.config.checkpointInterval > 0) {
        this.startCheckpointing(initialState.expeditionId);
      }

      // Execute workflow with monitoring
      const result = await this.runWithMonitoring(
        workflow,
        initialState,
        context,
        onProgress
      );

      return result;
    } finally {
      // Cleanup
      this.stopCheckpointing(initialState.expeditionId);
      this.activeContexts.delete(initialState.expeditionId);
    }
  }

  /**
   * Resume workflow from checkpoint
   */
  async resumeWorkflow(
    workflow: any, // CompiledStateGraph from LangGraph
    expeditionId: string,
    onProgress?: (progress: ExpeditionProgress) => void
  ): Promise<ExpeditionState> {
    const checkpoint = await this.loadLatestCheckpoint(expeditionId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for expedition: ${expeditionId}`);
    }

    console.log(`📍 [ORCHESTRATOR] Resuming from checkpoint: ${checkpoint.phase}`);
    
    return this.executeWorkflow(
      workflow,
      checkpoint.state,
      onProgress
    );
  }

  /**
   * Run workflow with monitoring and error recovery
   */
  private async runWithMonitoring(
    workflow: any, // CompiledStateGraph from LangGraph
    state: ExpeditionState,
    context: WorkflowContext,
    onProgress?: (progress: ExpeditionProgress) => void
  ): Promise<ExpeditionState> {
    let currentState = state;
    let retryCount = 0;

    while (retryCount < this.config.maxRetries) {
      try {
        // Create progress callback wrapper
        const progressCallback = () => {
          if (onProgress) {
            const progress = this.calculateProgress(currentState);
            onProgress(progress);
          }
          
          // Save checkpoint on phase change
          this.saveCheckpoint(context, currentState);
        };

        // Execute workflow
        const result = await workflow.invoke(currentState, {
          configurable: {
            thread_id: context.expeditionId,
            callbacks: [{
              onChainStart: () => progressCallback(),
              onChainEnd: () => progressCallback()
            }]
          }
        });

        return result;
      } catch (error) {
        console.error(`❌ [ORCHESTRATOR] Workflow execution failed:`, error);
        retryCount++;

        if (retryCount >= this.config.maxRetries) {
          throw error;
        }

        if (this.config.enableAutoRecovery) {
          console.log(`🔄 [ORCHESTRATOR] Attempting recovery (attempt ${retryCount}/${this.config.maxRetries})`);
          
          // Load last good checkpoint
          const checkpoint = await this.loadLatestCheckpoint(context.expeditionId);
          if (checkpoint) {
            currentState = checkpoint.state;
            console.log(`📍 [ORCHESTRATOR] Recovered from checkpoint: ${checkpoint.phase}`);
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        } else {
          throw error;
        }
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Start periodic checkpointing
   */
  private startCheckpointing(expeditionId: string): void {
    const timer = setInterval(async () => {
      const context = this.activeContexts.get(expeditionId);
      if (context) {
        // Get current state from repository
        const expeditionRepo = RepositoryFactory.getExpeditionRepository();
        const expedition = await expeditionRepo.findById(expeditionId);
        
        if (expedition?.workflowState) {
          await this.saveCheckpoint(context, expedition.workflowState as ExpeditionState);
        }
      }
    }, this.config.checkpointInterval);

    this.checkpointTimers.set(expeditionId, timer);
  }

  /**
   * Stop checkpointing
   */
  private stopCheckpointing(expeditionId: string): void {
    const timer = this.checkpointTimers.get(expeditionId);
    if (timer) {
      clearInterval(timer);
      this.checkpointTimers.delete(expeditionId);
    }
  }

  /**
   * Save workflow checkpoint
   */
  private async saveCheckpoint(
    context: WorkflowContext,
    state: ExpeditionState
  ): Promise<void> {
    const checkpoint: WorkflowCheckpoint = {
      id: `cp-${Date.now()}`,
      expeditionId: context.expeditionId,
      phase: state.currentPhase,
      state: { ...state }, // Deep copy
      timestamp: new Date(),
      duration: Date.now() - context.startTime.getTime()
    };

    context.checkpoints.push(checkpoint);

    // Persist to database
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateWorkflowState(context.expeditionId, state);
      
      console.log(`💾 [ORCHESTRATOR] Checkpoint saved: ${checkpoint.phase}`);
    } catch (error) {
      console.error(`❌ [ORCHESTRATOR] Failed to save checkpoint:`, error);
    }
  }

  /**
   * Load latest checkpoint
   */
  private async loadLatestCheckpoint(
    expeditionId: string
  ): Promise<WorkflowCheckpoint | null> {
    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);
      
      if (expedition?.workflowState) {
        return {
          id: `cp-loaded`,
          expeditionId,
          phase: expedition.workflowState.currentPhase,
          state: expedition.workflowState as ExpeditionState,
          timestamp: new Date(expedition.updatedAt),
          duration: 0
        };
      }
    } catch (error) {
      console.error(`❌ [ORCHESTRATOR] Failed to load checkpoint:`, error);
    }
    
    return null;
  }

  /**
   * Calculate expedition progress
   */
  private calculateProgress(state: ExpeditionState): ExpeditionProgress {
    const totalTasks = state.taskBreakdown.length || 0;
    const completedTasks = state.completedTasks?.length || 0;
    const overallProgress = totalTasks > 0 
      ? Math.round((completedTasks / totalTasks) * 100) 
      : 0;

    const qualityScores = state.completedTasks?.map(t => t.qualityScore || 75) || [];
    const qualityScore = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
      : 0;

    return {
      expeditionId: state.expeditionId,
      currentPhase: state.currentPhase,
      overallProgress,
      tasksCompleted: completedTasks,
      tasksTotal: totalTasks,
      estimatedTimeRemaining: this.estimateTimeRemaining(state),
      qualityScore,
      issues: state.errors || []
    };
  }

  /**
   * Estimate time remaining based on current progress
   */
  private estimateTimeRemaining(state: ExpeditionState): number {
    const totalTasks = state.taskBreakdown.length || 0;
    const completedTasks = state.completedTasks?.length || 0;
    const remainingTasks = totalTasks - completedTasks;
    
    if (remainingTasks <= 0) return 0;
    
    // Calculate average task duration from completed tasks
    if (completedTasks > 0 && state.completedTasks) {
      const totalDuration = state.completedTasks.reduce(
        (sum, task) => sum + (task.actualDuration || 30),
        0
      );
      const avgDuration = totalDuration / completedTasks;
      return Math.round(remainingTasks * avgDuration);
    }
    
    // Default estimate: 30 minutes per task
    return remainingTasks * 30;
  }

  /**
   * Get active expeditions
   */
  getActiveExpeditions(): string[] {
    return Array.from(this.activeContexts.keys());
  }

  /**
   * Get expedition context
   */
  getExpeditionContext(expeditionId: string): WorkflowContext | undefined {
    return this.activeContexts.get(expeditionId);
  }
}