/**
 * Services Index - Centralized Service Exports
 *
 * Exports all services for the starships system.
 */

// Existing comprehensive services
export { SocketIOService } from './SocketIOService';
export { AgentService } from './AgentService';
export { UserService } from './UserService';
export { SibilService } from './SibilService';

// Core data management services
export { MessageService } from './MessageService';
export { MemoryService } from './MemoryService';

// Migrated services from @starships/models
export { AgentTemplateService } from './AgentTemplateService';
export { VisionFileService } from './VisionFileService';

// Vision refinement services
export { VisionRefinementService } from './VisionRefinementService';
export { AffirmationDetector } from './AffirmationDetector';
export { VisionMetricsCalculator } from './VisionMetricsCalculator';
export { VisionRefinementSessionManager } from './VisionRefinementSessionManager';

// Mission services
export { MissionOrchestratorService } from './MissionOrchestratorService';

// Workflow services
export { WorkflowService } from './WorkflowService';

// Agent execution services (replacing agents/ directory)
export { ToolService } from './ToolService';

// Note: Workflow execution engine has been moved to @starships/autopilot package

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