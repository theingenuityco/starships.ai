/**
 * CliAgentTurn
 *
 * Flag-gated cutover path: runs one agent turn via the code-native CLI agent
 * (@starships/autopilot-cli) inside the sandbox, instead of the DAG blueprint.
 * Gated by env.USE_CLI_AGENT_PATH and currently scoped to repo-backed
 * conversations (an existing, provisioned workspace session), i.e. the
 * engineering room. Non-repo turns continue on the blueprint path.
 *
 * Persistence + streaming are mapped from CliAgentEvent to the same primitives
 * the blueprint path uses (messageService + streamBus + turn/conversation repos),
 * deliberately persisting per-step messages rather than reproducing the
 * token-streaming machinery. Tool-result serialization matches the agent's own
 * so transcripts round-trip cleanly across turns.
 *
 * NOTE: experimental. Not yet validated against a running system; token-level
 * streaming, DB-backed allow/ask/deny, and connector-scoped discovery are
 * follow-ups (see project memory).
 */

import type { LlmMessage } from '@starships/autopilot';
import { serializeToolResult } from '@starships/autopilot-cli';
import type { CliAgentEvent, CliAgentResult, ChatMessage, AssistantToolCall, CliAgentJobSpec } from '@starships/autopilot-cli';
import type { MessageService } from '@/services/MessageService';
import type { ConversationStreamBus } from '@/services/ConversationStreamBus';
import type { TurnRepository, ConversationRepository } from '@starships/models';
import { ConnectorRepository, ToolCallApprovalRepository } from '@starships/models';
import type { PermissionTable } from '@starships/autopilot-cli';
import { cliAgentContainerLauncher } from '@/execution/CliAgentContainerLauncher';
import { buildAutopilotRuntimeEnv, buildAutopilotExecutionBundle } from '@/services/autopilot-execution-bundle';

// Lazily instantiated so importing this module never constructs repositories at
// load time. Avoids breaking test suites that partially mock @starships/models,
// and defers any DB-connection setup until a CLI turn actually runs.
let _connectorRepo: ConnectorRepository | undefined;
let _approvalRepo: ToolCallApprovalRepository | undefined;
const connectorRepo = (): ConnectorRepository => (_connectorRepo ??= new ConnectorRepository());
const approvalRepo = (): ToolCallApprovalRepository => (_approvalRepo ??= new ToolCallApprovalRepository());

/**
 * Default permission policy. Opt-in via CLI_AGENT_TOOL_APPROVALS=true: when set,
 * mutating system tools require human approval; everything else runs. When unset,
 * all tools run (matches the validated initial behavior).
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

export interface CliAgentTurnDeps {
  messageService: MessageService;
  streamBus: ConversationStreamBus;
  turnRepository: TurnRepository;
  conversationRepository: ConversationRepository;
}

export interface CliAgentTurnAgentModel {
  id: string;
  name: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean };
}

export interface CliAgentTurnArgs {
  conversationId: string;
  turnId: string;
  agentModel: CliAgentTurnAgentModel;
  systemPrompt: string;
  /** Conversation history shaped for the LLM (excluding the system prompt). */
  llmMessages: LlmMessage[];
  starshipId: string;
  authUserId: string;
  roomId?: string;
  /** Persistent, provisioned per-conversation host dir, bind-mounted into the sandbox. */
  hostDir: string;
  /** No-repo run: the agent's cwd is the mount root rather than a repo checkout. */
  scratch?: boolean;
  /** Approval decisions keyed by toolCallId, supplied on resume after human approval. */
  approvals?: Record<string, 'approved' | 'denied'>;
  modalities?: Array<'text' | 'image'>;
  imageConfig?: Record<string, unknown>;
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
    // Accept both casings: the loaded history uses camelCase `toolCallId`, but the wire
    // format is snake_case `tool_call_id` — without this a tool result links to nothing on resume.
    const toolCallId =
      typeof rec.toolCallId === 'string' ? rec.toolCallId : typeof rec.tool_call_id === 'string' ? rec.tool_call_id : undefined;
    return {
      role: m.role as ChatMessage['role'],
      content: (m.content as ChatMessage['content']) ?? '',
      ...(typeof rec.reasoning === 'string' ? { reasoning: rec.reasoning } : {}),
      ...(Array.isArray(rec.reasoningDetails) ? { reasoningDetails: rec.reasoningDetails as unknown[] } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(toolCallId ? { toolCallId } : {}),
    };
  });
}

/**
 * Execute one agent turn via the CLI agent. Returns true when handled; false when
 * the caller should fall back to the blueprint path (e.g. missing model/runtime config).
 */
export async function executeCliAgentTurn(deps: CliAgentTurnDeps, args: CliAgentTurnArgs): Promise<boolean> {
  const { conversationId, turnId, agentModel, starshipId, authUserId } = args;

  const runtimeEnv = buildAutopilotRuntimeEnv({
    starshipId,
    conversationId,
    ...(args.roomId ? { roomId: args.roomId } : {}),
    authUserId,
    agentId: agentModel.id,
  });
  const { engineConfig } = await buildAutopilotExecutionBundle({ starshipId, authUserId, runtimeEnv });

  // The CLI client talks to OpenRouter directly; without an API key or the
  // server-authority connector callback we cannot run, so fall back.
  if (!engineConfig.llm?.apiKey || !engineConfig.connectorActionCallback?.url) return false;

  // Resolve the OpenRouter model id (the canonical model may route through several providers).
  const routes = engineConfig.modelRoutes?.[agentModel.model] ?? [];
  const openrouterRoute = routes.find((r) => r.provider === 'openrouter');
  const modelId = openrouterRoute?.providerModelId || agentModel.model;

  const extras =
    (args.modalities && args.modalities.length > 0) || (args.imageConfig && typeof args.imageConfig === 'object')
      ? {
          ...(args.modalities && args.modalities.length > 0 ? { modalities: args.modalities } : {}),
          ...(args.imageConfig && typeof args.imageConfig === 'object' ? { imageConfig: args.imageConfig } : {}),
        }
      : undefined;

  const discoverConnectors = await resolveDiscoverableConnectors(starshipId);
  const permissions = defaultPermissionTable();

  const spec: Omit<CliAgentJobSpec, 'workspace'> = {
    requestId: turnId,
    model: modelId,
    systemPrompt: args.systemPrompt,
    messages: toChatMessages(args.llmMessages),
    discoverConnectors,
    ...(permissions ? { permissions } : {}),
    ...(args.approvals ? { approvals: args.approvals } : {}),
    llm: { apiKey: engineConfig.llm.apiKey, ...(engineConfig.llm.baseUrl ? { baseUrl: engineConfig.llm.baseUrl } : {}) },
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

  type CreateMessageReq = Parameters<MessageService['createMessage']>[0];

  const onEvent = async (event: CliAgentEvent): Promise<void> => {
    if (event.type === 'assistant_message') {
      const m = event.message;
      const toolCalls = (m.toolCalls ?? []).map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
      }));
      const req = {
        conversationId,
        role: 'assistant',
        content: m.content,
        agentId: agentModel.id,
        agentName: agentModel.name,
        ...(m.reasoning ? { reasoning: m.reasoning } : {}),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      } as unknown as CreateMessageReq;
      const persisted = await deps.messageService.createMessage(req);
      await deps.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persisted } });
    } else if (event.type === 'tool_result') {
      const req = {
        conversationId,
        role: 'tool',
        content: serializeToolResult(event.result),
        toolCallId: event.toolCallId,
        messageType: 'tool_result',
        agentId: agentModel.id,
        agentName: agentModel.name,
      } as unknown as CreateMessageReq;
      const persisted = await deps.messageService.createMessage(req);
      await deps.streamBus.publish(conversationId, { type: 'message.append', data: { conversationId, message: persisted } });
    } else if (event.type === 'approval_required') {
      // Persist an approval record (idempotent per conversation+toolCallId) so the
      // existing approve/deny UI + routes can resolve it; resume re-enters the CLI loop.
      let approvalId: string | undefined;
      try {
        const existing = await approvalRepo().findByConversationAndToolCallId(conversationId, event.toolCallId).catch(() => null);
        // Only reuse a still-pending record. A stale decided record (e.g. a reused toolCallId
        // from a prior turn) must not be handed back as the approvalId, or approve/deny would
        // be a no-op (they only update `pending` rows) and the turn would hang.
        if (existing && existing.status === 'pending') {
          approvalId = existing.id;
        } else {
          const created = await approvalRepo().createPendingForCli({
            starshipId,
            conversationId,
            agentId: agentModel.id,
            toolName: event.name,
            toolCallId: event.toolCallId,
            argsJson: event.args,
          });
          approvalId = created.id;
        }
      } catch (err) {
        // Best-effort: still surface the prompt even if persistence failed. Log so a rare
        // toolCallId collision (UNIQUE conflict against a stale decided row) is observable —
        // in that case the prompt would have no backing record to approve.
        console.warn(
          `[CliAgentTurn] approval persist failed for toolCallId=${event.toolCallId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      await deps.streamBus.publish(conversationId, {
        type: 'ui_action',
        data: {
          action: 'tool_approval_required',
          payload: {
            ...(approvalId ? { approvalId } : {}),
            conversationId,
            agentId: agentModel.id,
            agentName: agentModel.name,
            toolName: event.name,
            toolCallId: event.toolCallId,
            args: event.args,
          },
        },
      });
    }
  };

  let result: CliAgentResult;
  try {
    result = await cliAgentContainerLauncher.launch({
      spec,
      hostDir: args.hostDir,
      ...(args.scratch ? { scratch: true } : {}),
      onEvent,
    });
  } catch (err) {
    // Container failure (Docker missing, crash, OOM, timeout) must not leave the turn
    // stuck active — mark it failed and clear pending state before rethrowing.
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
          error: { code: 'CLI_AGENT_EXECUTION_FAILED', message: err instanceof Error ? err.message : String(err) },
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

  return true;
}
