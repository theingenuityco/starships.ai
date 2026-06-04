/**
 * AgentTurn
 *
 * The single entry point for running one agent turn. It owns transport selection
 * and drives both transports through the same event mapper (agentTurnEventMapper),
 * so streaming + persistence are identical regardless of where the loop ran:
 *
 *   - provisioned repo workspace (engineering room) -> Docker sandbox, full system
 *     tools + connector tools (cliAgentContainerLauncher).
 *   - otherwise (ordinary non-repo chat)            -> in-process, connector tools
 *     only (runInProcessAgentTurn).
 *
 * There is no DAG/blueprint fallback: if LLM config is missing this throws, because
 * there is no second path to fall back to.
 */

import type { LlmMessage } from '@starships/protocol';
import { buildPermissionPolicy } from '@starships/autopilot-cli';
import type {
  CliAgentJobSpec,
  CliAgentResult,
  ChatMessage,
  AssistantToolCall,
  PermissionTable,
} from '@starships/autopilot-cli';
import type { TurnRepository, ConversationRepository } from '@starships/models';
import { ConnectorRepository } from '@starships/models';
import type { MessageService } from '@/services/MessageService';
import type { ConversationStreamBus } from '@/services/ConversationStreamBus';
import { cliAgentContainerLauncher } from '@/execution/CliAgentContainerLauncher';
import { runInProcessAgentTurn } from '@/execution/InProcessCliAgentRunner';
import { workspaceSessionManager } from '@/execution/WorkspaceSessionManager';
import type { AutopilotRunnerExecuteConfig } from '@/services/autopilot-execution-bundle';
import { buildAutopilotRuntimeEnv, buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';
import { createAgentTurnEventMapper } from '@/services/agentTurnEventMapper';

// Lazily instantiated so importing this module never constructs repositories at load time.
let _connectorRepo: ConnectorRepository | undefined;
const connectorRepo = (): ConnectorRepository => (_connectorRepo ??= new ConnectorRepository());

/**
 * Default permission policy. Opt-in via CLI_AGENT_TOOL_APPROVALS=true: when set,
 * mutating system tools require human approval; everything else runs. When unset,
 * all tools run.
 */
function defaultPermissionTable(): PermissionTable | undefined {
  if (process.env.CLI_AGENT_TOOL_APPROVALS !== 'true') return undefined;
  return { default: 'allow', tools: { bash: 'ask', write: 'ask', edit: 'ask' } };
}

/** Connectors the agent can always reach, regardless of per-starship connections. */
const ALWAYS_DISCOVERABLE_CONNECTORS = ['system', 'starships'];

/** Connector names a starship has connected, plus the always-available ones. */
async function resolveDiscoverableConnectors(starshipId: string): Promise<string[]> {
  try {
    const rows = await connectorRepo().findByStarship(starshipId);
    const connected = rows.map((r) => String(r.provider)).filter(Boolean);
    return Array.from(new Set([...connected, ...ALWAYS_DISCOVERABLE_CONNECTORS]));
  } catch {
    return [...ALWAYS_DISCOVERABLE_CONNECTORS];
  }
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Convert autopilot LlmMessage history into the CLI agent's ChatMessage shape. */
function toChatMessages(messages: LlmMessage[]): ChatMessage[] {
  return messages.map((m): ChatMessage => {
    const rec = m as unknown as Record<string, unknown>;
    const toolCallsRaw = Array.isArray(rec.toolCalls) ? (rec.toolCalls as Array<Record<string, unknown>>) : [];
    const toolCalls: AssistantToolCall[] = toolCallsRaw.map((tc, i) => {
      const fn = (tc.function ?? {}) as Record<string, unknown>;
      return {
        id: typeof tc.id === 'string' && tc.id ? tc.id : `call_${i}`,
        name: typeof fn.name === 'string' ? fn.name : '',
        args: parseArgs(fn.arguments),
      };
    });
    // Accept both casings: loaded history uses camelCase `toolCallId`, the wire format is
    // snake_case `tool_call_id` — without this a tool result links to nothing on resume.
    const toolCallId =
      typeof rec.toolCallId === 'string' ? rec.toolCallId : typeof rec.tool_call_id === 'string' ? rec.tool_call_id : undefined;
    return {
      role: m.role as ChatMessage['role'],
      content: (m.content as ChatMessage['content']) ?? '',
      ...(typeof rec.reasoning === 'string' ? { reasoning: rec.reasoning } : {}),
      ...(Array.isArray(rec.reasoningDetails) ? { reasoningDetails: rec.reasoningDetails as unknown[] } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(toolCallId ? { toolCallId } : {}),
      // Preserve image references on resume so vision/image-gen models can reference them.
      ...(Array.isArray(rec.images) && rec.images.length > 0 ? { images: rec.images as unknown[] } : {}),
    };
  });
}

export interface AgentTurnDeps {
  messageService: MessageService;
  streamBus: ConversationStreamBus;
  turnRepository: TurnRepository;
  conversationRepository: ConversationRepository;
}

export interface AgentTurnAgentModel {
  id: string;
  name: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
}

export interface AgentTurnArgs {
  conversationId: string;
  turnId: string;
  agentModel: AgentTurnAgentModel;
  systemPrompt: string;
  /** Conversation history shaped for the LLM (excluding the system prompt). */
  llmMessages: LlmMessage[];
  starshipId: string;
  authUserId: string;
  roomId?: string;
  /** Approval decisions keyed by toolCallId, supplied on resume after human approval. */
  approvals?: Record<string, 'approved' | 'denied'>;
  modalities?: Array<'text' | 'image'>;
  imageConfig?: Record<string, unknown>;
  /** OpenRouter LLM plugins (e.g. web search), resolved from conversation state. */
  plugins?: Array<{ id: string; max_results?: number }>;
  /**
   * Pre-built execution bundle. The fields this turn reads (llm, modelRoutes,
   * connectorActionCallback) are stable across a conversation's agent hops, so the
   * caller can build it once and pass it in to avoid a per-hop DB round-trip
   * (getAllModelProviders). Built on demand when absent.
   */
  engineConfig?: AutopilotRunnerExecuteConfig;
  /**
   * Cancellation signal. Forwarded into the in-process CLI loop so a stop request
   * (ConversationService.activeCancellations) aborts the turn end-to-end.
   */
  signal?: AbortSignal;
}

/**
 * Run one agent turn. Selects sandbox vs in-process by whether the conversation has
 * a provisioned repo workspace, then finalizes turn status from the result. Returns
 * the CliAgentResult so callers can react (e.g. awaiting_approval).
 */
export async function runAgentTurn(deps: AgentTurnDeps, args: AgentTurnArgs): Promise<CliAgentResult> {
  const { conversationId, turnId, agentModel, starshipId, authUserId } = args;

  const runtimeEnv = buildAutopilotRuntimeEnv({
    starshipId,
    conversationId,
    ...(args.roomId ? { roomId: args.roomId } : {}),
    authUserId,
    agentId: agentModel.id,
  });
  const engineConfig = args.engineConfig ?? (await buildAutopilotExecutionBundle({ starshipId, authUserId, runtimeEnv })).engineConfig;

  // The agent talks to OpenRouter directly; without an API key we cannot run, and
  // there is no blueprint path to fall back to.
  if (!engineConfig.llm?.apiKey) {
    throw new Error('Agent turn cannot run: missing LLM API key (OPENROUTER_API_KEY).');
  }
  const llm = { apiKey: engineConfig.llm.apiKey, ...(engineConfig.llm.baseUrl ? { baseUrl: engineConfig.llm.baseUrl } : {}) };

  // Resolve the OpenRouter model id (the canonical model may route through several providers).
  const routes = engineConfig.modelRoutes?.[agentModel.model] ?? [];
  const openrouterRoute = routes.find((r) => r.provider === 'openrouter');
  const modelId = openrouterRoute?.providerModelId || agentModel.model;

  const hasExtras =
    (args.modalities && args.modalities.length > 0) ||
    (args.imageConfig && typeof args.imageConfig === 'object') ||
    (args.plugins && args.plugins.length > 0);
  const extras = hasExtras
    ? {
        ...(args.modalities && args.modalities.length > 0 ? { modalities: args.modalities } : {}),
        ...(args.imageConfig && typeof args.imageConfig === 'object' ? { imageConfig: args.imageConfig } : {}),
        ...(args.plugins && args.plugins.length > 0 ? { plugins: args.plugins } : {}),
      }
    : undefined;

  const discoverConnectors = await resolveDiscoverableConnectors(starshipId);
  const permissions = defaultPermissionTable();
  const messages = toChatMessages(args.llmMessages);

  const onEvent = createAgentTurnEventMapper(
    { messageService: deps.messageService, streamBus: deps.streamBus },
    {
      conversationId,
      turnId,
      starshipId,
      agentId: agentModel.id,
      agentName: agentModel.name,
      model: agentModel.model,
    }
  );

  // Transport: a provisioned repo checkout (engineering room) runs in the sandbox with
  // full system tools; everything else runs in-process with connector tools only.
  const ws = workspaceSessionManager.get(conversationId);
  const useSandbox = Boolean(ws && !ws.scratch && workspaceSessionManager.isProvisioned(ws));

  let result: CliAgentResult;
  try {
    if (useSandbox && ws) {
      if (!engineConfig.connectorActionCallback?.url) {
        throw new Error('Sandbox agent turn cannot run: missing connector-action callback URL.');
      }
      const spec: Omit<CliAgentJobSpec, 'workspace'> = {
        requestId: turnId,
        model: modelId,
        systemPrompt: args.systemPrompt,
        messages,
        discoverConnectors,
        ...(permissions ? { permissions } : {}),
        ...(args.approvals ? { approvals: args.approvals } : {}),
        llm,
        connectorActionCallback: {
          url: engineConfig.connectorActionCallback.url,
          ...(engineConfig.connectorActionCallback.secret ? { secret: engineConfig.connectorActionCallback.secret } : {}),
          starshipId,
          authUserId,
        },
        runtimeEnv,
        ...(agentModel.temperature !== undefined ? { temperature: agentModel.temperature } : {}),
        ...(agentModel.maxTokens !== undefined ? { maxTokens: agentModel.maxTokens } : {}),
        ...(agentModel.timeout !== undefined ? { timeout: agentModel.timeout } : {}),
        ...(agentModel.reasoning ? { reasoning: agentModel.reasoning } : {}),
        ...(extras ? { extras } : {}),
      };
      result = await cliAgentContainerLauncher.launch({ spec, hostDir: ws.hostDir, onEvent, ...(args.signal ? { signal: args.signal } : {}) });
    } else {
      result = await runInProcessAgentTurn({
        modelId,
        systemPrompt: args.systemPrompt,
        messages,
        llm,
        starshipId,
        authUserId,
        runtimeEnv,
        discoverConnectors,
        onEvent,
        ...(args.signal ? { signal: args.signal } : {}),
        ...(args.approvals ? { approvals: args.approvals } : {}),
        ...(permissions ? { permission: buildPermissionPolicy(permissions) } : {}),
        ...(agentModel.temperature !== undefined ? { temperature: agentModel.temperature } : {}),
        ...(agentModel.maxTokens !== undefined ? { maxTokens: agentModel.maxTokens } : {}),
        ...(agentModel.timeout !== undefined ? { timeout: agentModel.timeout } : {}),
        ...(agentModel.reasoning ? { reasoning: agentModel.reasoning } : {}),
        ...(extras ? { extras } : {}),
      });
    }
  } catch (err) {
    // Execution failure (Docker missing/crash/OOM/timeout, or an in-process LLM/tool error) must
    // not leave the turn stuck active — mark it failed and clear pending state before rethrowing.
    const failedAt = new Date().toISOString();
    await deps.conversationRepository.mergeState(conversationId, { turnActive: false, pendingToolCalls: [] }).catch(() => undefined);
    await deps.turnRepository.updateTurn(turnId, { status: 'failed', completedAt: failedAt }).catch(() => undefined);
    await deps.streamBus
      .publish(conversationId, {
        type: 'turn.status',
        data: {
          conversationId,
          turnId,
          status: 'failed',
          at: failedAt,
          error: { code: 'AGENT_EXECUTION_FAILED', message: err instanceof Error ? err.message : String(err) },
        },
      })
      .catch(() => undefined);
    throw err;
  }

  const at = new Date().toISOString();
  if (result.reason === 'awaiting_approval') {
    const pendingToolCalls = (result.pendingApprovals ?? []).map((p) => ({ id: p.toolCallId, function: { name: p.name } }));
    await deps.conversationRepository.mergeState(conversationId, { turnActive: false, pendingToolCalls });
    await deps.turnRepository.updateTurn(turnId, { status: 'waiting_for_tools', completedAt: null }).catch(() => undefined);
    await deps.streamBus.publish(conversationId, { type: 'turn.status', data: { conversationId, turnId, status: 'waiting_for_tools', at } });
  } else {
    await deps.conversationRepository.mergeState(conversationId, { turnActive: false, lastCompleteAt: at, pendingToolCalls: [] });
    await deps.turnRepository.updateTurn(turnId, { status: 'completed', completedAt: at }).catch(() => undefined);
    await deps.streamBus.publish(conversationId, { type: 'turn.status', data: { conversationId, turnId, status: 'completed', at } });
  }

  return result;
}
