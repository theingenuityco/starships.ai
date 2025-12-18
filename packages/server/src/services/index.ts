/**
 * Services Index - Centralized Service Exports
 *
 * Exports all services for the starships system.
 */

// Existing comprehensive services
export { AgentService } from './AgentService';
export { AttachmentService } from './AttachmentService';
export { UserService } from './UserService';

// Core data management services
export { ConversationService } from './ConversationService';
export { MessageService } from './MessageService';

// Migrated services from @starships/models
export { AgentTemplateService } from './AgentTemplateService';

// Avatar generation (OpenRouter image models via Autopilot runner)
export { AvatarGenerationService } from './AvatarGenerationService';

// Agent execution services (replacing agents/ directory)
export { ToolService } from './ToolService';

// Streaming services
export { StreamingService } from './StreamingService';
export { WebSocketService } from './WebSocketService';

// Registration orchestration service
export { RegistrationOrchestrator } from './RegistrationOrchestrator';

// Service Factory for centralized service creation
export { ServiceFactory } from './ServiceFactory';

// Note: Workflow execution engine has been moved to @starships/autopilot package
