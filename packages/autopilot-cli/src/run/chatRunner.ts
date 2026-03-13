import crypto from 'node:crypto';
import readline from 'node:readline';
import { LLM, ExecutionItemUtils } from '@starships/autopilot';
import type { EngineConfig, HostRuntime, LlmMessage, ToolParams } from '@starships/autopilot';
import type { AgentExportPayloadV1, ImportExportContainerV1, RoomExportPayloadV1 } from '@starships/protocol';
import { executeToolBlueprint } from '@/run/executeToolBlueprint';
import { promptYesNo } from '@/run/prompt';
import { normalizePermission, ToolPermission } from '@/run/permissions';

type AgentContainer = ImportExportContainerV1<'agent'>;
type ToolContainer = ImportExportContainerV1<'tool'>;
type RoomContainer = ImportExportContainerV1<'room'>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getContainerSlug(container: ImportExportContainerV1): string | undefined {
  const slug = container.metadata?.fromSlug;
  return typeof slug === 'string' && slug.trim().length > 0 ? slug.trim() : undefined;
}

function getAgentPayload(container: AgentContainer): AgentExportPayloadV1 {
  return container.payload as AgentExportPayloadV1;
}

function getRoomPayload(container: RoomContainer): RoomExportPayloadV1 {
  return container.payload as RoomExportPayloadV1;
}

function buildToolsFromContainers(args: {
  toolContainers: ToolContainer[];
  allowedToolSlugs: Set<string>;
}): Map<string, ToolParams> {
  const bySlug = new Map<string, ToolParams>();
  for (const c of args.toolContainers) {
    const slug = getContainerSlug(c);
    if (!slug) continue;
    if (!args.allowedToolSlugs.has(slug)) continue;
    const payload = c.payload as { tool?: unknown };
    const tool = payload?.tool;
    if (!isPlainObject(tool)) continue;
    if (!tool.blueprint || !isPlainObject(tool.blueprint)) continue;
    const name = typeof tool.name === 'string' ? tool.name : slug;
    const description = typeof tool.description === 'string' ? tool.description : '';
    const parameters = tool.parameters as ToolParams['parameters'] | undefined;
    if (!parameters || !isPlainObject(parameters)) continue;
    bySlug.set(slug, {
      name,
      slug,
      description,
      parameters,
      blueprint: tool.blueprint as unknown as ToolParams['blueprint'],
    });
  }
  return bySlug;
}

function buildPermissionMap(args: {
  agentAssignedToolSlugs: string[];
  room?: RoomContainer | null;
}): Map<string, ToolPermission> {
  const out = new Map<string, ToolPermission>();

  // Default: any agent-assigned tool is allowed.
  for (const slug of args.agentAssignedToolSlugs) {
    if (!slug) continue;
    out.set(slug, 'allow');
  }

  // Room tool assignments override defaults when present.
  if (args.room) {
    const payload = getRoomPayload(args.room);
    const assignments = Array.isArray(payload.toolAssignments) ? payload.toolAssignments : [];
    for (const a of assignments) {
      const toolSlug = a && typeof a === 'object' ? (a as { toolSlug?: unknown }).toolSlug : undefined;
      if (typeof toolSlug !== 'string' || !toolSlug.trim()) continue;
      const permission = a && typeof a === 'object' ? (a as { permission?: unknown }).permission : undefined;
      out.set(toolSlug.trim(), normalizePermission(permission));
    }
  }

  return out;
}

function buildEngineConfig(args: { hostRuntime: HostRuntime; runtimeEnv?: Record<string, unknown> }): EngineConfig {
  return {
    hostRuntime: args.hostRuntime,
    runtimeEnv: args.runtimeEnv ?? {},
    failOnNodeError: true,
  };
}

async function runLlmStep(args: {
  hostRuntime: HostRuntime;
  engineConfig: EngineConfig;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoning?: unknown;
  tools: ToolParams[];
  messages: LlmMessage[];
  onDeltaText?: (text: string) => void;
}): Promise<{
  assistantMessage: LlmMessage;
  toolCalls: Array<{ id: string; function: { name: string; arguments: Record<string, unknown> } }>;
}> {
  let lastPrinted = 0;
  let cumulative = '';

  const reasoningParam =
    args.reasoning && typeof args.reasoning === 'object' && !Array.isArray(args.reasoning) ? args.reasoning : undefined;

  const llm = new LLM(
    {
      model: args.model,
      messages: args.messages,
      tools: args.tools,
      ...(typeof args.temperature === 'number' ? { temperature: args.temperature } : {}),
      ...(typeof args.maxTokens === 'number' ? { maxTokens: args.maxTokens } : {}),
      ...(typeof args.timeout === 'number' ? { timeout: args.timeout } : {}),
      ...(reasoningParam !== undefined ? { reasoning: reasoningParam } : {}),
      stream: true,
    },
    {
      hostRuntime: args.hostRuntime,
      runtimeEnv: args.engineConfig.runtimeEnv,
      eventCallback: async (evt) => {
        if (!evt || typeof evt !== 'object') return;
        if ((evt as { type?: unknown }).type !== 'content_chunk') return;
        const chunk = (evt as { data?: { chunk?: unknown } }).data?.chunk;
        if (!chunk || typeof chunk !== 'object') return;
        const choices = (chunk as { choices?: unknown }).choices;
        if (!Array.isArray(choices) || choices.length === 0) return;
        const choice0 = choices[0] as { delta?: { content?: unknown }; message?: { content?: unknown } };
        const delta = choice0?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          cumulative += delta;
          args.onDeltaText?.(delta);
          lastPrinted = cumulative.length;
          return;
        }
        const msgContent = choice0?.message?.content;
        if (typeof msgContent === 'string' && msgContent.length > lastPrinted) {
          const piece = msgContent.slice(lastPrinted);
          cumulative = msgContent;
          lastPrinted = msgContent.length;
          if (piece) args.onDeltaText?.(piece);
        }
      },
    }
  );

  const items = await llm.execute(ExecutionItemUtils.wrapSingle({}));
  const resp = ExecutionItemUtils.unwrapSingle(items) as unknown as {
    choices?: Array<{
      message?: {
        content?: unknown;
        toolCalls?: unknown;
      };
    }>;
  };

  const message = resp?.choices?.[0]?.message;
  const content = typeof message?.content === 'string' ? message.content : '';
  const rawCalls = message?.toolCalls;
  const toolCalls = Array.isArray(rawCalls)
    ? rawCalls
        .map((tc) => {
          const rec = tc as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
          const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : '';
          const name = typeof rec.function?.name === 'string' && rec.function.name.trim() ? rec.function.name.trim() : '';
          const argumentsObj =
            rec.function?.arguments && typeof rec.function.arguments === 'object' && !Array.isArray(rec.function.arguments)
              ? (rec.function.arguments as Record<string, unknown>)
              : {};
          if (!id || !name) return null;
          return { id, function: { name, arguments: argumentsObj } };
        })
        .filter((x): x is { id: string; function: { name: string; arguments: Record<string, unknown> } } => x !== null)
    : [];

  const assistantMessage: LlmMessage = {
    role: 'assistant',
    content,
    ...(toolCalls.length > 0
      ? {
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        }
      : {}),
  } as LlmMessage;

  return { assistantMessage, toolCalls };
}

function formatToolNotAllowed(slug: string, permission: ToolPermission): string {
  const code = permission === 'deny' ? 'TOOL_DENIED' : 'TOOL_NOT_ASSIGNED';
  const message =
    permission === 'deny'
      ? `Tool '${slug}' is denied in this bundle.`
      : `Tool '${slug}' is not available (missing blueprint or not included in bundle).`;
  return JSON.stringify({ ok: false, error: code, message });
}

function formatToolResult(result: unknown): string {
  // Keep the wrapper stable and provider-safe (string).
  return JSON.stringify({ ok: true, result });
}

export async function runInteractiveChat(args: {
  agent: AgentContainer;
  tools: ToolContainer[];
  room?: RoomContainer | null;
  hostRuntime: HostRuntime;
  maxSteps?: number;
  inputOnce?: string;
}): Promise<void> {
  const agentPayload = getAgentPayload(args.agent);
  const agentModel = agentPayload.agent ?? ({} as AgentExportPayloadV1['agent']);
  const agentName = typeof agentModel.name === 'string' ? agentModel.name : getContainerSlug(args.agent) ?? 'agent';
  const model = typeof agentModel.model === 'string' && agentModel.model.trim() ? agentModel.model.trim() : '';
  if (!model) throw new Error('Agent export is missing agent.model');

  const assignedToolSlugs = Array.isArray(agentPayload.assignedToolSlugs) ? agentPayload.assignedToolSlugs : [];
  const permissionBySlug = buildPermissionMap({ agentAssignedToolSlugs: assignedToolSlugs, room: args.room ?? null });

  const allowedToolSlugs = new Set<string>();
  for (const [slug, perm] of permissionBySlug.entries()) {
    if (perm === 'deny') continue;
    allowedToolSlugs.add(slug);
  }

  const toolBySlug = buildToolsFromContainers({ toolContainers: args.tools, allowedToolSlugs });
  const toolsForModel: ToolParams[] = [];
  for (const [slug, perm] of permissionBySlug.entries()) {
    if (perm === 'deny') continue;
    const t = toolBySlug.get(slug);
    if (!t) continue;
    toolsForModel.push(t);
  }

  const conversationId = crypto.randomBytes(8).toString('hex');
  const runtimeEnv: Record<string, unknown> = {
    CONVERSATION_ID: conversationId,
    AGENT_ID: getContainerSlug(args.agent) ?? agentName,
    STARSHIP_ID: 'local',
  };
  const engineConfig = buildEngineConfig({ hostRuntime: args.hostRuntime, runtimeEnv });

  const messages: LlmMessage[] = [];
  if (typeof agentModel.systemPrompt === 'string' && agentModel.systemPrompt.trim().length > 0) {
    messages.push({ role: 'system', content: agentModel.systemPrompt.trim() });
  }

  const maxSteps = typeof args.maxSteps === 'number' && Number.isFinite(args.maxSteps) ? Math.max(1, Math.floor(args.maxSteps)) : 12;

  const runOneTurn = async (userText: string): Promise<void> => {
    messages.push({ role: 'user', content: userText });

    for (let step = 0; step < maxSteps; step++) {
      const { assistantMessage, toolCalls } = await runLlmStep({
        hostRuntime: args.hostRuntime,
        engineConfig,
        model,
        temperature: typeof agentModel.temperature === 'number' ? agentModel.temperature : undefined,
        maxTokens: typeof agentModel.maxTokens === 'number' ? agentModel.maxTokens : undefined,
        timeout: typeof agentModel.timeout === 'number' ? agentModel.timeout : undefined,
        reasoning: (agentModel as unknown as { reasoning?: unknown }).reasoning,
        tools: toolsForModel,
        messages,
        onDeltaText: (t) => process.stdout.write(t),
      });
      process.stdout.write('\n');

      messages.push(assistantMessage);

      if (toolCalls.length === 0) return;

      for (const tc of toolCalls) {
        const slug = tc.function.name;
        const perm = permissionBySlug.get(slug) ?? 'deny';
        const tool = toolBySlug.get(slug);

        if (perm === 'ask') {
          const ok = await promptYesNo({ question: `Allow tool '${slug}'?`, defaultYes: true });
          if (!ok) {
            messages.push({ role: 'tool', toolCallId: tc.id, content: formatToolNotAllowed(slug, 'deny') } as LlmMessage);
            continue;
          }
        }

        if (perm === 'deny' || !tool) {
          messages.push({ role: 'tool', toolCallId: tc.id, content: formatToolNotAllowed(slug, perm) } as LlmMessage);
          continue;
        }

        try {
          const result = await executeToolBlueprint({
            blueprint: tool.blueprint,
            toolConfig: {},
            toolArgs: tc.function.arguments ?? {},
            engineConfig,
          });
          messages.push({ role: 'tool', toolCallId: tc.id, content: formatToolResult(result) } as LlmMessage);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          messages.push({ role: 'tool', toolCallId: tc.id, content: JSON.stringify({ ok: false, error: msg }) } as LlmMessage);
        }
      }
    }

    throw new Error(`Exceeded maxSteps=${maxSteps} while resolving tool calls/LLM turns.`);
  };

  if (typeof args.inputOnce === 'string') {
    await runOneTurn(args.inputOnce);
    return;
  }

  process.stdout.write(`Running agent '${agentName}' (model=${model}). Type '/exit' to quit.\n\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    for await (const line of rl) {
      const text = String(line ?? '').trim();
      if (!text) continue;
      if (text === '/exit' || text === '/quit') break;
      await runOneTurn(text);
      process.stdout.write('\n');
    }
  } finally {
    rl.close();
  }
}

