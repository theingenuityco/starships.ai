/**
 * @starships/autopilot-cli
 *
 * A code-native terminal agent loop. An agent is a plain imperative loop over an
 * LLM plus tools, running inside the runner sandbox with a working directory.
 * It is standalone: it owns its OpenRouter model client and message/tool shapes,
 * and does not depend on the autopilot DAG/Engine.
 *
 * Tools come in two families:
 *  - system tools (bash/read/write/edit/ls/glob/grep) operating on the cwd
 *  - connector meta-tools (search_actions/run_action) for on-demand integrations
 */

export { CliAgent } from '@/CliAgent';
export { runCliAgent } from '@/runtime/runCliAgent';
export type { RunCliAgentInput } from '@/runtime/runCliAgent';
export { httpConnectorActionRunner } from '@/runtime/httpConnectorActionRunner';
export type { HttpConnectorActionRunnerOptions } from '@/runtime/httpConnectorActionRunner';

export { buildSystemTools } from '@/tools/system';
export { buildConnectorTools, connectorRegistryCatalog } from '@/tools/connectors';

export { buildPermissionPolicy } from '@/jobSpec';
export type { CliAgentJobSpec, CliWorkspaceSpec, CliGitCredentials, PermissionTable } from '@/jobSpec';

export { OpenRouterClient } from '@/llm/OpenRouterClient';
export type { LlmCallInput, LlmCallResult, ModelTool, DeltaSink } from '@/llm/OpenRouterClient';

export type {
  AgentTool,
  ActionCatalog,
  ActionDescriptor,
  AssistantMessage,
  AssistantToolCall,
  ChatMessage,
  ChatRole,
  CliAgentConfig,
  CliAgentEvent,
  CliAgentEventSink,
  CliAgentResult,
  ConnectorActionResult,
  ConnectorActionRunner,
  CliAgentStopReason,
  JsonObjectSchema,
  LlmExtras,
  ModelClientConfig,
  PendingApproval,
  PermissionPolicy,
  StepUsage,
  ToolContext,
  ToolPermission,
  ToolResult,
} from '@/types';
