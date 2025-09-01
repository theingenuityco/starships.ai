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

// Mission services
export { MissionOrchestratorService } from './MissionOrchestratorService';

// Workflow services
export { WorkflowService } from './WorkflowService';

// Agent execution services (replacing agents/ directory)
export { ToolService } from './ToolService';

// Note: Workflow execution engine has been moved to @starships/autopilot package
