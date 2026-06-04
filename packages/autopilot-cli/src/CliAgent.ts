/**
 * CliAgent
 *
 * The code-native terminal agent loop. No DAG, no blueprint, no Engine: just
 *
 *   system prompt + history
 *   loop:
 *     assistant = LLM(messages, tools)
 *     if no tool calls -> done
 *     gate each tool call (allow/ask/deny); run the allowed ones in parallel,
 *       reject the denied ones, and pause for any that need approval
 *
 * Human-in-the-loop: when a call needs approval the loop pauses with reason
 * 'awaiting_approval'. The host persists the transcript and resumes by calling
 * run() again with the same messages plus `approvals`; the loop detects tool
 * calls that have no result yet and finishes them WITHOUT re-calling the LLM.
 *
 * Tools are plain async functions. The model client is a standalone OpenRouter
 * client. Side effects the agent cannot do itself (connector actions) are
 * delegated through the injected ConnectorActionRunner.
 */

import { OpenRouterClient, type ModelTool } from '@/llm/OpenRouterClient';
import { buildSystemTools } from '@/tools/system';
import { buildConnectorTools } from '@/tools/connectors';
import { serializeToolResult } from '@/serialize';
import type {
  AgentTool,
  AssistantMessage,
  AssistantToolCall,
  ChatMessage,
  CliAgentConfig,
  CliAgentEvent,
  CliAgentResult,
  PendingApproval,
  ToolContext,
  ToolResult,
} from '@/types';

const DEFAULT_MAX_STEPS = 50;

type EffectivePermission = 'allow' | 'deny' | 'ask';

function toModelTool(tool: AgentTool): ModelTool {
  return { name: tool.name, description: tool.description, parameters: tool.parameters };
}

/** Shape an assistant message for the transcript, preserving reasoning signatures + images. */
function toTranscriptAssistant(message: AssistantMessage): ChatMessage {
  return {
    role: 'assistant',
    content: message.content,
    ...(message.reasoning ? { reasoning: message.reasoning } : {}),
    ...(message.reasoningDetails && message.reasoningDetails.length > 0 ? { reasoningDetails: message.reasoningDetails } : {}),
    ...(message.images && message.images.length > 0 ? { images: message.images } : {}),
    ...(message.toolCalls && message.toolCalls.length > 0 ? { toolCalls: message.toolCalls } : {}),
  };
}

/**
 * On resume, find tool calls that still need to run: the most recent assistant
 * message's tool calls whose id has no following `tool` result. Returns null when
 * nothing is outstanding (a fresh turn).
 */
function outstandingToolCalls(messages: ChatMessage[]): AssistantToolCall[] | null {
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && (messages[i].toolCalls?.length ?? 0) > 0) {
      lastAssistantIdx = i;
      break;
    }
  }
  if (lastAssistantIdx === -1) return null;
  const calls = messages[lastAssistantIdx].toolCalls ?? [];
  const resolvedIds = new Set<string>();
  for (let i = lastAssistantIdx + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'tool' && m.toolCallId) resolvedIds.add(m.toolCallId);
  }
  const outstanding = calls.filter((c) => !resolvedIds.has(c.id));
  return outstanding.length > 0 ? outstanding : null;
}

export class CliAgent {
  private readonly config: CliAgentConfig;
  private readonly tools: AgentTool[];
  private readonly toolByName: Map<string, AgentTool>;
  private readonly modelTools: ModelTool[];

  constructor(config: CliAgentConfig) {
    this.config = config;
    this.tools = config.tools ?? [...buildSystemTools(), ...buildConnectorTools()];
    if (!config.tools && !config.catalog) {
      // Connector tools are part of the default set but need a catalog to do
      // anything; without one they silently return errors to the model.
      console.warn('[CliAgent] default connector tools wired without config.catalog — search_actions/run_action will error');
    }
    this.toolByName = new Map(this.tools.map((t) => [t.name, t]));
    this.modelTools = this.tools.map(toModelTool);
  }

  private async emit(event: CliAgentEvent): Promise<void> {
    try {
      await this.config.onEvent?.(event);
    } catch {
      // Event sinks must never break the loop.
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  /** Resolve the effective permission for a call, folding in any prior approval decision. */
  private async resolvePermission(call: AssistantToolCall): Promise<EffectivePermission> {
    const base = (await this.config.permission?.({ name: call.name, args: call.args })) ?? 'allow';
    if (base !== 'ask') return base;
    const decision = this.config.approvals?.[call.id];
    if (decision === 'approved') return 'allow';
    if (decision === 'denied') return 'deny';
    return 'ask';
  }

  async run(): Promise<CliAgentResult> {
    const maxSteps = this.config.maxSteps ?? DEFAULT_MAX_STEPS;
    const messages: ChatMessage[] = [{ role: 'system', content: this.config.systemPrompt }, ...this.config.messages];

    const client = new OpenRouterClient(this.config.modelClient, (text) => {
      void this.emit({ type: 'assistant_delta', text });
    });

    const toolCtx: ToolContext = {
      cwd: this.config.cwd,
      connectors: this.config.connectors,
      catalog: this.config.catalog,
      ...(this.config.signal ? { signal: this.config.signal } : {}),
    };

    await this.emit({ type: 'turn_started', at: this.now() });

    // Resume: tool calls left unfinished by a prior (paused) run.
    let pendingCalls: AssistantToolCall[] | null = outstandingToolCalls(messages);
    let steps = 0;

    try {
      while (steps < maxSteps) {
        if (this.config.signal?.aborted) {
          await this.emit({ type: 'turn_completed', at: this.now(), reason: 'cancelled' });
          return { messages, reason: 'cancelled', steps };
        }

        if (!pendingCalls) {
          const { message, finishReason, usage } = await client.call(
            {
              model: this.config.model,
              messages,
              tools: this.modelTools,
              ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
              ...(this.config.maxTokens !== undefined ? { maxTokens: this.config.maxTokens } : {}),
              ...(this.config.timeout !== undefined ? { timeout: this.config.timeout } : {}),
              ...(this.config.reasoning ? { reasoning: this.config.reasoning } : {}),
              ...(this.config.extras ? { extras: this.config.extras } : {}),
            },
            this.config.signal
          );

          steps++;
          messages.push(toTranscriptAssistant(message));
          await this.emit({ type: 'assistant_message', message, ...(usage ? { usage } : {}) });

          const calls = message.toolCalls ?? [];

          // Provider truncated mid-text (no tool calls): add an explicit nudge so the model
          // resumes, rather than leaving its own partial message as the trailing turn (which
          // some providers won't continue from). When tool calls are present, fall through and
          // execute them instead of inserting a user turn after an assistant tool-call message.
          if (finishReason === 'length' && calls.length === 0) {
            messages.push({ role: 'user', content: 'Please continue.' });
            continue;
          }

          if (calls.length === 0) {
            await this.emit({ type: 'turn_completed', at: this.now(), reason: 'stop' });
            return { messages, reason: 'stop', steps };
          }
          pendingCalls = calls;
        }

        // Gate every pending call, then run the resolved ones and pause for the rest.
        const gated = await Promise.all(
          pendingCalls.map(async (call) => ({ call, perm: await this.resolvePermission(call) }))
        );
        const toAsk = gated.filter((g) => g.perm === 'ask');

        // Execute everything that has a decision now (allow -> run, deny -> error result),
        // so their tool results are appended even when other calls still await approval.
        // NOTE: decided calls run fully in parallel (no concurrency cap). A step is
        // normally 1-5 calls; a model going wide (e.g. 10 bash calls) is backstopped by
        // the sandbox --pids-limit/--cpus rather than throttled here.
        const decided = gated.filter((g) => g.perm !== 'ask');
        const toolMessages = await Promise.all(
          decided.map((g) => (g.perm === 'deny' ? this.denyToolCall(g.call) : this.runToolCall(g.call, toolCtx)))
        );
        messages.push(...toolMessages);

        if (toAsk.length > 0) {
          const pendingApprovals: PendingApproval[] = toAsk.map((g) => ({
            toolCallId: g.call.id,
            name: g.call.name,
            args: g.call.args,
          }));
          for (const p of pendingApprovals) {
            await this.emit({ type: 'approval_required', toolCallId: p.toolCallId, name: p.name, args: p.args });
          }
          await this.emit({ type: 'turn_completed', at: this.now(), reason: 'awaiting_approval' });
          return { messages, reason: 'awaiting_approval', steps, pendingApprovals };
        }

        pendingCalls = null;
      }

      await this.emit({ type: 'turn_completed', at: this.now(), reason: 'max_steps' });
      return { messages, reason: 'max_steps', steps };
    } catch (err) {
      await this.emit({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  private async runToolCall(call: AssistantToolCall, ctx: ToolContext): Promise<ChatMessage> {
    await this.emit({ type: 'tool_started', toolCallId: call.id, name: call.name, args: call.args });

    const tool = this.toolByName.get(call.name);
    let result: ToolResult;
    if (!tool) {
      result = { content: { error: `unknown tool '${call.name}'` }, isError: true };
    } else {
      try {
        result = await tool.run(call.args, ctx);
      } catch (err) {
        result = { content: { error: err instanceof Error ? err.message : String(err) }, isError: true };
      }
    }

    await this.emit({ type: 'tool_result', toolCallId: call.id, name: call.name, result });
    return { role: 'tool', toolCallId: call.id, content: serializeToolResult(result) };
  }

  private async denyToolCall(call: AssistantToolCall): Promise<ChatMessage> {
    const result: ToolResult = {
      content: { code: 'PERMISSION_DENIED', message: `Tool '${call.name}' was not permitted to run.` },
      isError: true,
    };
    await this.emit({ type: 'tool_result', toolCallId: call.id, name: call.name, result });
    return { role: 'tool', toolCallId: call.id, content: serializeToolResult(result) };
  }
}
