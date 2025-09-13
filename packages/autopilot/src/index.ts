/**
 * @starships/autopilot
 *
 * Workflow execution engine and agent development framework for starships.ai
 */

// Engine
export { Engine } from './engine/Engine';

// Nodes
export { Workflow } from './nodes/Workflow';
export { LLM } from './nodes/LLM';
export { HttpRequest } from './nodes/HttpRequest';
export { Agent } from './nodes/Agent';

// Memory
export { Memory } from './memory/Memory';
export type { MemoryState, LlmMessage, MessageRole } from './memory/Memory';
export { AgentMemory } from './memory/AgentMemory';
export type { AgentIdentity, AgentMemoryState, AgentPurpose, AgentSpace } from './memory/AgentMemory';

// Types
export * from './types';

// Configuration
export { config } from './constants';

// Autopilot configuration manager
export { autopilot, AutopilotManager } from './Autopilot';
export type { AutopilotConfig, AutopilotCredentials } from './Autopilot';
