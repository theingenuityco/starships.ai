/**
 * @starships/autopilot
 *
 * Workflow execution engine and agent development framework for starships.ai
 */

// Engine
export { Engine } from './engine/Engine';
export type { EngineConfig } from './engine/Engine';
export { Eval } from './engine/Eval';
export type { EvalContext, EvalOptions } from './engine/Eval';

// Nodes
export { BaseNode } from './nodes/BaseNode';
export { Workflow } from './nodes/Workflow';
export { LLM } from './nodes/LLM';
export { HttpRequest } from './nodes/HttpRequest';
export { Agent } from './nodes/Agent';
export { Conditional } from './nodes/Conditional';
export { Transform } from './nodes/Transform';
export { Mutate } from './nodes/Mutate';
export { Tool } from './nodes/Tool';

// Node result types
export type { ConditionalResult } from './nodes/Conditional';

// Utils
export { ExecutionItemUtils } from './utils/ExecutionItemUtils';

// Types
export * from './types';

// Configuration
export { config } from './constants';

// Runners
export type { Runner } from './runner/Runner';
export { LocalRunner } from './runner/LocalRunner';
export { ChildProcessRunner } from './runner/ChildProcessRunner';

// Autopilot configuration manager
export { autopilot, AutopilotManager } from './Autopilot';
export type { AutopilotConfig, AutopilotCredentials } from './Autopilot';
