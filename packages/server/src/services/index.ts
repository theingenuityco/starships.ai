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

// New specialized services
export { TaskService } from './TaskService';
export { MessageService } from './MessageService';
export { ResultService } from './ResultService';

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
   */
  static initializeServices(): void {
    console.log('[SERVICE-FACTORY] Initializing specialized services...');
    
    // Initialize services in dependency order
    this.getTaskService();
    this.getMessageService();
    this.getResultService();
    this.getExpeditionService();
    this.getFirstOfficerService();
    
    console.log('[SERVICE-FACTORY] All specialized services initialized');
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
  }> {
    return {
      taskService: !!this.taskService,
      messageService: !!this.messageService,
      resultService: !!this.resultService,
      expeditionService: !!this.expeditionService,
      firstOfficerService: !!this.firstOfficerService
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