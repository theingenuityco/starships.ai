/**
 * Services Index - Centralized Service Exports
 *
 * Exports all services for the expedition system including specialized services
 * for focused operations and existing comprehensive services.
 */

// Import services for internal use
import { TaskService } from './TaskService';
import { MessageService } from './MessageService';
import { ResultService } from './ResultService';
import { ExpeditionService } from './ExpeditionService';
import { FirstOfficerService } from './FirstOfficerService';

// Existing comprehensive services
export { ExpeditionService } from './ExpeditionService';
export { FirstOfficerService } from './FirstOfficerService';
export { SocketIOService } from './SocketIOService';
export { AgentService } from './AgentService';
export { UserService } from './UserService';
export { SibilService } from './SibilService';

// Vision refinement services
export { VisionRefinementService } from './VisionRefinementService';
export { AffirmationDetector } from './AffirmationDetector';
export { VisionMetricsCalculator } from './VisionMetricsCalculator';
export { VisionRefinementSessionManager } from './VisionRefinementSessionManager';

// New specialized services
export { TaskService } from './TaskService';
export { MessageService } from './MessageService';
export { ResultService } from './ResultService';
export { WorkflowGenerationService } from './WorkflowGenerationService';
export { WorkflowEventService } from './WorkflowEventService';

// Workflow execution engine
export { 
  WorkflowNodeRegistry, 
  workflowNodeRegistry,
  BaseWorkflowNodeHandler,
  type WorkflowNodeHandler
} from './WorkflowNodeRegistry';
export { AgentNodeHandler } from './AgentNodeHandler';
export { ConditionalNodeHandler } from './ConditionalNodeHandler';
export { UserPromptNodeHandler } from './UserPromptNodeHandler';
export { 
  WorkflowExecutionService,
  type WorkflowExecutionEvent,
  type WorkflowExecutionEventCallback
} from './WorkflowExecutionService';

// Service factory for centralized service management
export class ServiceFactory {
  private static taskService: TaskService;
  private static messageService: MessageService;
  private static resultService: ResultService;
  private static expeditionService: ExpeditionService;
  private static firstOfficerService: FirstOfficerService;

  /**
   * Get TaskService singleton instance
   */
  static getTaskService(): TaskService {
    if (!this.taskService) {
      this.taskService = TaskService.getInstance();
    }
    return this.taskService;
  }

  /**
   * Get MessageService singleton instance
   */
  static getMessageService(): MessageService {
    if (!this.messageService) {
      this.messageService = MessageService.getInstance();
    }
    return this.messageService;
  }

  /**
   * Get ResultService singleton instance
   */
  static getResultService(): ResultService {
    if (!this.resultService) {
      this.resultService = ResultService.getInstance();
    }
    return this.resultService;
  }

  /**
   * Get ExpeditionService singleton instance
   */
  static getExpeditionService(): ExpeditionService {
    if (!this.expeditionService) {
      this.expeditionService = ExpeditionService.getInstance();
    }
    return this.expeditionService;
  }

  /**
   * Get FirstOfficerService singleton instance
   */
  static getFirstOfficerService(): FirstOfficerService {
    if (!this.firstOfficerService) {
      this.firstOfficerService = FirstOfficerService.getInstance();
    }
    return this.firstOfficerService;
  }

  /**
   * Initialize all services - useful for startup
   * Services are initialized in dependency order to ensure proper integration
   */
  static initializeServices(): void {
    console.log('[SERVICE-FACTORY] Initializing specialized services...');
    
    // Initialize services in dependency order:
    // 1. Core services first (no dependencies)
    // 2. Services that depend on core services
    // 3. Orchestration services last (depend on all others)
    
    // Core services (no socket dependencies initially)
    this.getTaskService();
    this.getMessageService();
    this.getResultService();
    
    // Business logic services (may use socket service)
    this.getExpeditionService();
    
    // Orchestration services (depend on all others)
    this.getFirstOfficerService();
    
    console.log('[SERVICE-FACTORY] All specialized services initialized in correct dependency order');
  }

  /**
   * Health check for all services
   */
  static async healthCheck(): Promise<{
    taskService: boolean;
    messageService: boolean;
    resultService: boolean;
    expeditionService: boolean;
    firstOfficerService: boolean;
    socketIntegration: boolean;
  }> {
    // Check if SocketIOService is available for integration
    let socketIntegration = false;
    try {
      const { SocketIOService } = await import('./SocketIOService');
      SocketIOService.getInstance();
      socketIntegration = true;
    } catch (error) {
      console.warn('[SERVICE-FACTORY] SocketIOService not available for health check');
    }

    return {
      taskService: !!this.taskService,
      messageService: !!this.messageService,
      resultService: !!this.resultService,
      expeditionService: !!this.expeditionService,
      firstOfficerService: !!this.firstOfficerService,
      socketIntegration
    };
  }
}

// Type exports for service interfaces
export type {
  UpdateTaskRequest,
  TaskAssignmentRequest,
  TaskFilters,
  TaskWorkloadInfo
} from './TaskService';

export type {
  UpdateMessageRequest,
  MessageFilters,
  MessageThread,
  MessageSearchResult,
  FileAttachment
} from './MessageService';

export type {
  UpdateResultRequest,
  QualityAssessmentRequest,
  ResultFilters,
  ResultAnalytics,
  ResultInsight
} from './ResultService';

// Vision refinement types
export type {
  VisionAnalysis,
  RefinementContext,
  VisionRefinementResponse
} from './VisionRefinementService';

export type {
  VisionMetrics
} from './VisionMetricsCalculator';

export type {
  VisionRefinementSession
} from './VisionRefinementSessionManager';