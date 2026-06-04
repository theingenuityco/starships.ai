/**
 * InProcessCliAgentRunner
 *
 * Runs the code-native agent loop (CliAgent) directly in the server process — no
 * Docker — for ordinary non-repo chat. It wires the agent with CONNECTOR TOOLS
 * ONLY: system tools (bash/read/write/edit/...) are deliberately excluded because
 * they would execute on the server host, which is unsafe. Repo/filesystem work
 * goes through the sandbox transport instead.
 *
 * Connector actions are dispatched DIRECTLY via ConnectorActionExecutor (a plain
 * in-process call that resolves credentials server-side) rather than the HTTP
 * callback the sandbox uses. Credentials never leave the server either way.
 */

import { tmpdir } from 'node:os';
import { runCliAgent, buildConnectorTools } from '@starships/autopilot-cli';
import type {
  ChatMessage,
  CliAgentEventSink,
  CliAgentResult,
  ConnectorActionRunner,
  LlmExtras,
  PermissionPolicy,
} from '@starships/autopilot-cli';
import { connectorActionExecutor } from '@/services/ConnectorActionExecutor';

/** Dispatches connector actions in-process; no HTTP round-trip, no secrets in the agent. */
function inProcessConnectorRunner(
  starshipId: string,
  authUserId: string,
  runtimeEnv: Record<string, unknown>
): ConnectorActionRunner {
  return {
    async run({ connector, action, args, timeoutMs }) {
      const envelope = await connectorActionExecutor.execute({
        connector,
        action,
        ...(args ? { args } : {}),
        starshipId,
        authUserId,
        runtimeEnv,
        ...(timeoutMs ? { timeoutMs } : {}),
      });
      return {
        status: envelope.status,
        body: envelope.body,
        ...(envelope.headers ? { headers: envelope.headers } : {}),
      };
    },
  };
}

export interface InProcessAgentTurnInput {
  modelId: string;
  systemPrompt: string;
  messages: ChatMessage[];
  llm: { apiKey: string; baseUrl?: string };
  starshipId: string;
  authUserId: string;
  /** Runtime context (STARSHIP_ID/SERVER_URL/...) needed by connectors like `starships`. */
  runtimeEnv: Record<string, unknown>;
  /** Restrict connector-action discovery to these connector names. */
  discoverConnectors: string[];
  approvals?: Record<string, 'approved' | 'denied'>;
  permission?: PermissionPolicy;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
  extras?: LlmExtras;
  signal?: AbortSignal;
  onEvent: CliAgentEventSink;
}

/** Run one agent turn in-process with connector tools only. */
export async function runInProcessAgentTurn(input: InProcessAgentTurnInput): Promise<CliAgentResult> {
  return runCliAgent({
    model: input.modelId,
    modelClient: { apiKey: input.llm.apiKey, ...(input.llm.baseUrl ? { baseURL: input.llm.baseUrl } : {}) },
    systemPrompt: input.systemPrompt,
    messages: input.messages,
    // No system tools are wired in-process, so cwd is never read; point it somewhere inert.
    cwd: tmpdir(),
    connectors: inProcessConnectorRunner(input.starshipId, input.authUserId, input.runtimeEnv),
    discoverConnectors: input.discoverConnectors,
    tools: buildConnectorTools(),
    onEvent: input.onEvent,
    ...(input.approvals ? { approvals: input.approvals } : {}),
    ...(input.permission ? { permission: input.permission } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
    ...(input.timeout !== undefined ? { timeout: input.timeout } : {}),
    ...(input.reasoning ? { reasoning: input.reasoning } : {}),
    ...(input.extras ? { extras: input.extras } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
