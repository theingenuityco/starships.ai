/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Enhanced with consistent two-word method naming for semantic grouping.
 */

import { AgentParams, ValidationResult, ValidationError, NodeHandlerOptions, ExecutionItem, LlmMessage } from '@/types';
import { NodeHandler } from '@/types/node-handler';
import { Blueprint } from '@/types/blueprint';
import type { Execution } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { EngineConfig } from '@/engine/Engine';
import { RunnerFactory } from '@/runner/RunnerFactory';
import { BlueprintBuilder } from '@/BlueprintBuilder';
import type { Runner } from '@/runner/Runner';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private options?: NodeHandlerOptions;
  private nodeCounter: number = 1;

  /**
   * Ensure runtime-configurable LLM settings are present in execution state.
   *
   * The default Agent blueprint resolves these from templates like:
   * - {{ state.model }}
   * - {{ state.temperature }}
   * - {{ state.maxTokens }}
   * - {{ state.timeout }}
   * - {{ state.reasoning }}
   *
   * If a host bypasses Agent.execute() and runs the blueprint directly,
   * it should still call this helper before Engine validates the LLM node.
   */
  static seedRuntimeConfigIntoState(
    state: Record<string, unknown>,
    params: Pick<AgentParams, 'model' | 'temperature' | 'maxTokens' | 'timeout' | 'reasoning'>
  ): void {
    if (typeof state.model !== 'string' || state.model.trim().length === 0) {
      state.model = params.model;
    }
    if (state.temperature === undefined && params.temperature !== undefined) {
      state.temperature = params.temperature;
    }
    if (state.maxTokens === undefined && params.maxTokens !== undefined) {
      state.maxTokens = params.maxTokens;
    }
    if (state.timeout === undefined && params.timeout !== undefined) {
      state.timeout = params.timeout;
    }
    // Treat null as "unset" too. Some hosts serialize missing optional fields as null,
    // which would otherwise prevent runtime config from being seeded.
    const shouldSeedReasoning = (state.reasoning === undefined || state.reasoning === null) && params.reasoning !== undefined;
    if (shouldSeedReasoning) {
      state.reasoning = params.reasoning;
    }
  }

  /**
   * Seed all execution.state keys that Agent derives from params + input.
   *
   * This centralizes:
   * - AgentParams.state merge (starshipId, etc.)
   * - Runtime LLM config (model/temperature/maxTokens/timeout/reasoning)
   * - Ordered message construction (systemPrompt -> memory -> input)
   * - Tools placement for {{ state.tools }}
   */
  static seedExecutionStateIntoState(
    state: Record<string, unknown>,
    params: Pick<AgentParams, 'state' | 'systemPrompt' | 'model' | 'temperature' | 'maxTokens' | 'timeout' | 'reasoning'>,
    input?: ExecutionItem[]
  ): void {
    // Merge agent state fields into execution.state so tools/nodes can read context (e.g., starshipId).
    if (params.state && typeof params.state === 'object') {
      Object.assign(state, params.state);
    }

    // Seed runtime-configurable LLM settings into state so the default blueprint can resolve them via templates.
    Agent.seedRuntimeConfigIntoState(state, params);

    // Build ordered messages snapshot: systemPrompt -> memory -> input
    const orderedMessages: LlmMessage[] = [];
    if (typeof params.systemPrompt === 'string' && params.systemPrompt.length > 0) {
      orderedMessages.push({ role: 'system', content: params.systemPrompt });
    }
    if (params.state?.messages?.length) {
      orderedMessages.push(...params.state.messages);
    }

    const isLlmMessageArray = (val: unknown): val is LlmMessage[] => {
      return (
        Array.isArray(val) &&
        val.every((m) => {
          if (typeof m !== 'object' || m === null) return false;
          const obj = m as Record<string, unknown>;
          // Content can be string (text only) or array (multimodal ContentBlock[] for images, PDFs, etc.)
          return typeof obj.role === 'string' && (typeof obj.content === 'string' || Array.isArray(obj.content));
        })
      );
    };

    if (input && input.length > 0) {
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      if (isLlmMessageArray(inputData)) {
        orderedMessages.push(...inputData);
      }
      // Silently ignore non-LlmMessage inputs
    }

    state['messages'] = orderedMessages;
    state['tools'] = params.state?.tools || [];
  }

  /**
   * Create the default tool-enabled blueprint used by Agent when none is provided.
   * This is exposed as a static method so callers can generate the exact same
   * default blueprint without instantiating an Agent.
   */
  static defaultAgentBlueprint(): Blueprint;
  static defaultAgentBlueprint(): Blueprint {
    const builder = new BlueprintBuilder();

    // NOTE: The engine resolves {{ ... }} templates at execution time with access to:
    // - state: execution.state
    // - outputs / lastOutputOf(...)
    // - env(key): Engine runtimeEnv
    //
    // We intentionally pull model/temperature/maxTokens/timeout/reasoning from `state`
    // so the blueprint remains stable and configuration can be injected at runtime.

    // Define refs upfront for nodes used in template strings
    const llmNodeRef = 'ai_assistant';
    const toolNodeRef = 'execute_tool';

    // Add nodes and capture their refs
    const startRef = builder.addNode({
      type: 'start',
      name: 'Start',
      description: 'Start node',
      parameters: {},
    });

    const endRef = builder.addNode({
      type: 'end',
      name: 'End',
      description: 'End node',
      parameters: {},
    });

    // LLM node with state-driven tools - use predefined ref
    builder.addNode({
      type: 'llm',
      name: 'AI Assistant',
      description: 'AI model with state-driven tool support',
      ref: llmNodeRef,
      parameters: {
        model: '{{ state.model }}',
        messages: '{{ state.messages }}',
        tools: '{{ state.tools }}',
        // Optional OpenRouter multimodal output controls (set by the embedding host via state)
        modalities: '{{ state.modalities }}',
        imageConfig: '{{ state.imageConfig }}',
        temperature: '{{ state.temperature }}',
        maxTokens: '{{ state.maxTokens }}',
        timeout: '{{ state.timeout }}',
        reasoning: '{{ state.reasoning }}',
        reducers: [
          `
          (state, ctx) => {
            const msg = ctx.lastOutputOf("${llmNodeRef}")?.choices?.[0]?.message ?? {};
            const content = typeof msg.content === 'string' ? msg.content : '';
            const calls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
            const reasoning = typeof msg.reasoning === 'string' ? msg.reasoning : undefined;
            const reasoningDetails = Array.isArray(msg.reasoningDetails) ? msg.reasoningDetails : undefined;
            let out;
            if (calls.length > 0) {
              const toolCalls = calls.map(tc => ({
                id: tc?.id ?? '',
                type: 'function',
                function: {
                  name: tc?.function?.name ?? '',
                  arguments: (function() {
                    const a = tc?.function?.arguments;
                    if (typeof a === 'string') { try { return JSON.parse(a); } catch { return {}; } }
                    return a ?? {};
                  })()
                }
              }));
              out = { role: 'assistant', content, ...(reasoning ? { reasoning } : {}), ...(reasoningDetails ? { reasoningDetails } : {}), toolCalls };
            } else {
              out = { role: 'assistant', content, ...(reasoning ? { reasoning } : {}), ...(reasoningDetails ? { reasoningDetails } : {}) };
            }
            const next = { ...(state || {}) };
            next.messages = [...(state?.messages ?? []), out];
            return next;
          }
          `,
        ],
      },
    });

    // Conditional node for tool call detection
    const conditionalNodeRef = builder.addNode({
      type: 'conditional',
      name: 'Check Tool Calls',
      description: 'Route after LLM: continue on length, initialize tool-call batch, or complete',
      parameters: {
        condition:
          '{{(() => { const last = lastOutputOf("ai_assistant"); const fr = last?.choices?.[0]?.finishReason; if (fr==="length") return "continue"; const calls = last?.choices?.[0]?.message?.toolCalls; return Array.isArray(calls) && calls.length > 0 ? "init_tool_calls" : "complete"; })()}}',
      },
    });

    // Initialize pending tool calls batch in state (from the last LLM response)
    const initToolCallsNodeRef = builder.addNode({
      type: 'mutate',
      name: 'Init Tool Calls Batch',
      description: 'Store toolCalls[] and reset index for sequential execution',
      parameters: {
        reducers: [
          `
          (state, ctx) => {
            const last = ctx.lastOutputOf("${llmNodeRef}") || {};
            const calls = last?.choices?.[0]?.message?.toolCalls;
            const pending = Array.isArray(calls) ? calls : [];
            const next = { ...(state || {}) };
            next.pendingToolCalls = pending;
            next.pendingToolCallIndex = 0;
            return next;
          }
          `,
        ],
      },
    });

    // Conditional node for per-tool execution loop (sequentially process pendingToolCalls)
    const toolLoopConditionalRef = builder.addNode({
      type: 'conditional',
      name: 'Process Tool Calls',
      description: 'Execute pending tool calls sequentially (allowed/disallowed) until done, then resume LLM',
      parameters: {
        condition: `{{(() => {
          const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : [];
          const rawIdx = state?.pendingToolCallIndex;
          const idx = Number.isFinite(Number(rawIdx)) ? Number(rawIdx) : 0;
          if (!pending.length || idx >= pending.length) return "done_tools";
          const slug = pending?.[idx]?.function?.name;
          const tools = Array.isArray(state?.tools) ? state.tools : [];
          const allowed = slug ? tools.some(t => t && typeof t.slug === "string" && t.slug === String(slug) && t.blueprint) : false;
          return allowed ? "call_tool" : "tool_not_allowed";
        })()}}`,
      },
    });

    // Prepare arguments for Tool - capture ref for edge connections
    const argsNodeRef = builder.addNode({
      type: 'code',
      name: 'Prepare Tool Args',
      description: 'Materialize current pending tool call arguments into a plain object for Tool input',
      parameters: {
        code: `
        async function main(ctx) {
          const pending = Array.isArray(ctx.state?.pendingToolCalls) ? ctx.state.pendingToolCalls : [];
          const rawIdx = ctx.state?.pendingToolCallIndex;
          const idx = Number.isFinite(Number(rawIdx)) ? Number(rawIdx) : 0;
          const tc = pending?.[idx];
          let j = tc?.function?.arguments;
          if (typeof j === 'string') { try { j = JSON.parse(j); } catch {}
          }
          if (j && typeof j === 'object') { return j; }
          throw new Error('Missing toolCall function.arguments');
        }
      `,
        timeout: 3000,
      },
    });

    // Tool execution node - use predefined ref
    builder.addNode({
      type: 'tool',
      name: 'Execute Tool',
      description: 'Execute tool',
      ref: toolNodeRef,
      parameters: {
        name: `{{ (() => { const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : []; const idx = Number.isFinite(Number(state?.pendingToolCallIndex)) ? Number(state?.pendingToolCallIndex) : 0; const slug = pending?.[idx]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.name ?? (slug ?? ""); })() }}`,
        description: `{{ (() => { const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : []; const idx = Number.isFinite(Number(state?.pendingToolCallIndex)) ? Number(state?.pendingToolCallIndex) : 0; const slug = pending?.[idx]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.description ?? ("Tool '" + (slug ?? "unknown") + "' not found"); })() }}`,
        parameters: `{{ (() => { const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : []; const idx = Number.isFinite(Number(state?.pendingToolCallIndex)) ? Number(state?.pendingToolCallIndex) : 0; const slug = pending?.[idx]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.parameters ?? ({ type: "object", properties: {} }); })() }}`,
        blueprint: `{{ (() => { const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : []; const idx = Number.isFinite(Number(state?.pendingToolCallIndex)) ? Number(state?.pendingToolCallIndex) : 0; const slug = pending?.[idx]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.blueprint; })() }}`,
        toolCallId: `{{ (() => { const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : []; const idx = Number.isFinite(Number(state?.pendingToolCallIndex)) ? Number(state?.pendingToolCallIndex) : 0; return pending?.[idx]?.id ?? ""; })() }}`,
      },
    });

    // Mutate node to add tool result to state
    const toolResultNodeRef = builder.addNode({
      type: 'mutate',
      name: 'Add Tool Result',
      description: 'Append tool result and advance to the next pending tool call',
      parameters: {
        reducers: [
          `
          (state, ctx) => {
            const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : [];
            const rawIdx = state?.pendingToolCallIndex;
            const idx = Number.isFinite(Number(rawIdx)) ? Number(rawIdx) : 0;
            const tc = pending?.[idx];
            const toolCallId = tc?.id ?? '';
            const toolResult = ctx.lastOutputOf("${toolNodeRef}") ?? {};
            const content = (typeof toolResult === 'string') ? toolResult : JSON.stringify(toolResult);
            const next = { ...(state || {}) };
            // Providers require exactly one tool_result per tool_call id. If we retried a tool call,
            // replace any prior tool result for the same id instead of appending duplicates.
            const prev = Array.isArray(state?.messages) ? state.messages : [];
            const filtered = toolCallId
              ? prev.filter((m) => {
                  if (!m || typeof m !== 'object') return true;
                  if (m.role !== 'tool') return true;
                  const existingId = (m.toolCallId ?? m.tool_call_id) ?? '';
                  return String(existingId) !== String(toolCallId);
                })
              : prev;
            next.messages = [...filtered, { role: 'tool', toolCallId, content }];
            const nextIdx = idx + 1;
            if (pending.length > 0 && nextIdx >= pending.length) {
              next.pendingToolCalls = [];
              next.pendingToolCallIndex = 0;
            } else {
              next.pendingToolCallIndex = nextIdx;
            }
            return next;
          }
          `,
        ],
      },
    });

    // Mutate node for disallowed tool calls: append tool-style error result and continue
    const notAllowedNodeRef = builder.addNode({
      type: 'mutate',
      name: 'Handle Disallowed Tool',
      description: 'Append tool result error for current pending tool call and advance',
      parameters: {
        reducers: [
          `
          (state, ctx) => {
            const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : [];
            const rawIdx = state?.pendingToolCallIndex;
            const idx = Number.isFinite(Number(rawIdx)) ? Number(rawIdx) : 0;
            const tc = pending?.[idx];
            const slug = tc?.function?.name ?? 'unknown';
            const toolCallId = tc?.id ?? '';
            const next = { ...(state || {}) };
            const payload = { ok: false, error: 'TOOL_NOT_ASSIGNED', message: "Tool '" + String(slug) + "' is not available to this agent." };
            const content = JSON.stringify(payload);
            const prev = Array.isArray(state?.messages) ? state.messages : [];
            const filtered = toolCallId
              ? prev.filter((m) => {
                  if (!m || typeof m !== 'object') return true;
                  if (m.role !== 'tool') return true;
                  const existingId = (m.toolCallId ?? m.tool_call_id) ?? '';
                  return String(existingId) !== String(toolCallId);
                })
              : prev;
            next.messages = [...filtered, { role: 'tool', toolCallId, content }];
            const nextIdx = idx + 1;
            if (pending.length > 0 && nextIdx >= pending.length) {
              next.pendingToolCalls = [];
              next.pendingToolCallIndex = 0;
            } else {
              next.pendingToolCallIndex = nextIdx;
            }
            return next;
          }
          `,
        ],
      },
    });

    // Connect all nodes
    return builder
      .addEdge(startRef, llmNodeRef)
      .addEdge(llmNodeRef, conditionalNodeRef)
      .addEdge(conditionalNodeRef, llmNodeRef, 'continue')
      .addEdge(conditionalNodeRef, initToolCallsNodeRef, 'init_tool_calls')
      .addEdge(conditionalNodeRef, endRef, 'complete')
      .addEdge(initToolCallsNodeRef, toolLoopConditionalRef)
      .addEdge(toolLoopConditionalRef, argsNodeRef, 'call_tool')
      .addEdge(argsNodeRef, toolNodeRef)
      .addEdge(toolNodeRef, toolResultNodeRef)
      .addEdge(toolResultNodeRef, toolLoopConditionalRef)
      .addEdge(toolLoopConditionalRef, notAllowedNodeRef, 'tool_not_allowed')
      .addEdge(notAllowedNodeRef, toolLoopConditionalRef)
      .addEdge(toolLoopConditionalRef, llmNodeRef, 'done_tools')
      .setMetadata('generatedBy', 'Agent.defaultAgentBlueprint')
      .build();
  }

  /**
   * Default blueprint variant that delegates tool execution to the Starships server via connector_action
   * (connector: "starships"), allowing server-side enforcement of assignment + allow/ask/deny.
   *
   * Key behavior difference vs defaultAgentBlueprint():
   * - Instead of a `tool` node executing a blueprint carried in state, we call:
   *   POST /conversations/:conversationId/tool-calls/authorize-and-maybe-execute
   * - If server responds TOOL_APPROVAL_REQUIRED, we append a tool message and end the workflow.
   */
  static defaultAgentBlueprintServerTools(): Blueprint {
    const builder = new BlueprintBuilder();

    const llmNodeRef = 'ai_assistant';

    const startRef = builder.addNode({
      type: 'start',
      name: 'Start',
      description: 'Start node',
      parameters: {},
    });

    const endRef = builder.addNode({
      type: 'end',
      name: 'End',
      description: 'End node',
      parameters: {},
    });

    // -------------------------------------------------------------------------
    // Resume support: if a previous run paused mid-batch awaiting a tool approval,
    // the server persists execution.state into conversation.state (excluding messages/tools).
    //
    // That persisted state includes:
    // - pendingToolCalls: ToolCall[]
    // - pendingToolCallIndex: number
    //
    // On resume, we MUST NOT call the LLM again (it would re-emit tool calls and/or
    // diverge from the original batch). Instead, jump directly into the tool loop.
    // -------------------------------------------------------------------------
    const startConditionalRef = builder.addNode({
      type: 'conditional',
      name: 'Start / Resume Tool Calls',
      description: 'If pendingToolCalls exist, resume tool loop; otherwise call LLM',
      parameters: {
        condition: `{{(() => {
          const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : [];
          const rawIdx = state?.pendingToolCallIndex;
          const idx = Number.isFinite(Number(rawIdx)) ? Number(rawIdx) : 0;
          if (pending.length > 0 && idx >= 0 && idx < pending.length) return "resume_tools";
          return "llm";
        })()}}`,
      },
    });

    builder.addNode({
      type: 'llm',
      name: 'AI Assistant',
      description: 'AI model with state-driven tool support',
      ref: llmNodeRef,
      parameters: {
        model: '{{ state.model }}',
        messages: '{{ state.messages }}',
        tools: '{{ state.tools }}',
        modalities: '{{ state.modalities }}',
        imageConfig: '{{ state.imageConfig }}',
        plugins: '{{ state.plugins }}',
        temperature: '{{ state.temperature }}',
        maxTokens: '{{ state.maxTokens }}',
        timeout: '{{ state.timeout }}',
        reasoning: '{{ state.reasoning }}',
        reducers: [
          `
          (state, ctx) => {
            const msg = ctx.lastOutputOf("${llmNodeRef}")?.choices?.[0]?.message ?? {};
            const content = typeof msg.content === 'string' ? msg.content : '';
            const calls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
            const reasoning = typeof msg.reasoning === 'string' ? msg.reasoning : undefined;
            const reasoningDetails = Array.isArray(msg.reasoningDetails) ? msg.reasoningDetails : undefined;
            let out;
            if (calls.length > 0) {
              const toolCalls = calls.map(tc => ({
                id: tc?.id ?? '',
                type: 'function',
                function: {
                  name: tc?.function?.name ?? '',
                  arguments: (function() {
                    const a = tc?.function?.arguments;
                    if (typeof a === 'string') { try { return JSON.parse(a); } catch { return {}; } }
                    return a ?? {};
                  })()
                }
              }));
              out = { role: 'assistant', content, ...(reasoning ? { reasoning } : {}), ...(reasoningDetails ? { reasoningDetails } : {}), toolCalls };
            } else {
              out = { role: 'assistant', content, ...(reasoning ? { reasoning } : {}), ...(reasoningDetails ? { reasoningDetails } : {}) };
            }
            const next = { ...(state || {}) };
            next.messages = [...(state?.messages ?? []), out];
            return next;
          }
          `,
        ],
      },
    });

    const conditionalNodeRef = builder.addNode({
      type: 'conditional',
      name: 'Check Tool Calls',
      description: 'Route after LLM: continue on length, initialize tool-call batch, or complete',
      parameters: {
        condition:
          '{{(() => { const last = lastOutputOf("ai_assistant"); const fr = last?.choices?.[0]?.finishReason; if (fr==="length") return "continue"; const calls = last?.choices?.[0]?.message?.toolCalls; return Array.isArray(calls) && calls.length > 0 ? "init_tool_calls" : "complete"; })()}}',
      },
    });

    const initToolCallsNodeRef = builder.addNode({
      type: 'mutate',
      name: 'Init Tool Calls Batch',
      description: 'Store toolCalls[] and reset index for sequential execution',
      parameters: {
        reducers: [
          `
          (state, ctx) => {
            const last = ctx.lastOutputOf("${llmNodeRef}") || {};
            const calls = last?.choices?.[0]?.message?.toolCalls;
            const pending = Array.isArray(calls) ? calls : [];
            const next = { ...(state || {}) };
            next.pendingToolCalls = pending;
            next.pendingToolCallIndex = 0;
            return next;
          }
          `,
        ],
      },
    });

    const batchExecuteNodeRef = 'batch_execute_tools';

    // Execute all pending tool calls in a single parallel batch via the server endpoint.
    builder.addNode({
      type: 'connector_action',
      name: 'Batch Execute Tools (Server)',
      description: 'Dispatch all pending tool calls to the server in one request; server runs them in parallel',
      ref: batchExecuteNodeRef,
      parameters: {
        connector: 'starships',
        action: 'batch-execute-tools',
        args: {
          agentId: `{{ String(env("AGENT_ID") ?? "") }}`,
          tools: `{{ (() => {
            const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : [];
            return pending.map(tc => ({
              toolSlug: String(tc?.function?.name ?? ""),
              toolCallId: String(tc?.id ?? ""),
              args: (function() {
                const a = tc?.function?.arguments;
                if (typeof a === 'string') { try { return JSON.parse(a); } catch { return {}; } }
                return a ?? {};
              })()
            }));
          })() }}`,
        },
        // 60 minutes: the slowest tool in the batch determines wall-clock time.
        timeout: 60 * 60 * 1000,
      },
    });

    const appendBatchResultsNodeRef = builder.addNode({
      type: 'mutate',
      name: 'Append Batch Tool Results',
      description: 'Append completed tool results to messages; retain only approval-pending calls in pendingToolCalls',
      parameters: {
        reducers: [
          `
          (state, ctx) => {
            const resp = ctx.lastOutputOf("${batchExecuteNodeRef}") || {};
            const body = resp?.body || {};
            const next = { ...(state || {}) };
            const prev = Array.isArray(state?.messages) ? state.messages : [];
            const allPending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : [];

            // If the outer envelope reports failure (or the node threw and produced no output),
            // mark every pending call as an error.
            if (body?.success !== true) {
              // Distinguish between "node threw with no output" and "server returned success:false"
              // so we can surface the real cause in logs and to the LLM.
              const hasBody = resp && (typeof resp === 'object') && Object.keys(resp).length > 0;
              console.error('[batch_execute_tools] batch node failed or returned error envelope', {
                hasOutput: hasBody,
                status: resp?.status,
                errorCode: body?.error?.code,
                errorMessage: body?.error?.message,
                pendingCount: allPending.length,
                pendingSlugs: allPending.map(tc => String(tc?.function?.name ?? '')),
              });
              const errMsg = body?.error?.message ?? (hasBody ? 'Batch tool execution failed' : 'Batch execute node produced no output — the connector action likely threw (check server logs for details)');
              const errCode = body?.error?.code ?? 'INTERNAL_SERVER_ERROR';
              const errorMessages = allPending
                .map(tc => {
                  const toolCallId = String(tc?.id ?? '');
                  if (!toolCallId) return null;
                  return { role: 'tool', toolCallId, content: JSON.stringify({ success: false, data: { code: errCode, message: errMsg } }) };
                })
                .filter(Boolean);
              next.messages = [...prev, ...errorMessages];
              next.pendingToolCalls = [];
              next.pendingToolCallIndex = 0;
              return next;
            }

            const results = Array.isArray(body?.data?.results) ? body.data.results : [];

            // IDs of tools that ran to completion (success or error) in this batch.
            const completedIds = new Set(
              results.filter(r => r?.kind !== 'approval_required').map(r => String(r?.toolCallId ?? ''))
            );

            // Remove stale tool messages for IDs we are about to re-append (dedup).
            const filtered = prev.filter(m => {
              if (!m || typeof m !== 'object' || m.role !== 'tool') return true;
              const id = String((m?.toolCallId ?? m?.tool_call_id) ?? '');
              return !completedIds.has(id);
            });

            const newMessages = [];
            const approvalPendingIds = new Set();

            for (const r of results) {
              const toolCallId = String(r?.toolCallId ?? '');
              if (!toolCallId) continue;
              if (r?.kind === 'approval_required') {
                approvalPendingIds.add(toolCallId);
                continue;
              }
              let payload;
              if (r?.kind === 'success') {
                const attachments = Array.isArray(r?.attachments) ? r.attachments : [];
                payload = { success: true, data: r?.result, attachments };
              } else {
                payload = { success: false, data: { code: r?.code ?? 'INTERNAL_SERVER_ERROR', message: r?.message ?? 'Tool execution failed' } };
              }
              newMessages.push({ role: 'tool', toolCallId, content: JSON.stringify(payload) });
            }

            next.messages = [...filtered, ...newMessages];
            // Retain only tools that still need approval so the blueprint can pause and resume cleanly.
            next.pendingToolCalls = allPending.filter(tc => approvalPendingIds.has(String(tc?.id ?? '')));
            next.pendingToolCallIndex = 0;
            return next;
          }
          `,
        ],
      },
    });

    const batchOutcomeRef = builder.addNode({
      type: 'conditional',
      name: 'Batch Tool Outcome',
      description: 'Resume LLM when all tools are done; pause execution when any tool still awaits approval',
      parameters: {
        condition: `{{(() => {
          const pending = Array.isArray(state?.pendingToolCalls) ? state.pendingToolCalls : [];
          return pending.length > 0 ? "approval_required" : "done_tools";
        })()}}`,
      },
    });

    return (
      builder
        .addEdge(startRef, startConditionalRef)
        .addEdge(startConditionalRef, llmNodeRef, 'llm')
        .addEdge(startConditionalRef, batchExecuteNodeRef, 'resume_tools')
        .addEdge(llmNodeRef, conditionalNodeRef)
        .addEdge(conditionalNodeRef, llmNodeRef, 'continue')
        .addEdge(conditionalNodeRef, initToolCallsNodeRef, 'init_tool_calls')
        .addEdge(conditionalNodeRef, endRef, 'complete')
        .addEdge(initToolCallsNodeRef, batchExecuteNodeRef)
        .addEdge(batchExecuteNodeRef, appendBatchResultsNodeRef)
        .addEdge(appendBatchResultsNodeRef, batchOutcomeRef)
        .addEdge(batchOutcomeRef, llmNodeRef, 'done_tools')
        // CRITICAL: On TOOL_APPROVAL_REQUIRED, stop execution immediately.
        // pendingToolCalls is already narrowed to only the approval-pending tools by appendBatchResultsNodeRef.
        // On resume, startConditionalRef will detect pendingToolCalls.length > 0 and jump back to batchExecuteNodeRef.
        .addEdge(batchOutcomeRef, endRef, 'approval_required')
        .setMetadata('generatedBy', 'Agent.defaultAgentBlueprintServerTools')
        .build()
    );
  }

  constructor(params: AgentParams, options?: NodeHandlerOptions) {
    // Store agent parameters
    this.params = structuredClone(params);

    // Create options
    this.options = options;

    // Initialize state if not provided
    if (!this.params.state) {
      this.params.state = {
        messages: [],
        tools: [],
      };
    }

    // Runner selection deferred to execute() based on execution.depth to avoid nested runners

    // Create complete tool-enabled blueprint if none was provided
    if (!this.params.blueprint) {
      this.createDefaultBlueprint();
    }
  }

  /**
   * Create complete blueprint from scratch - includes scaffolding and tool execution infrastructure
   * Since tools are driven entirely by state, all blueprints are tool-ready
   */
  private createDefaultBlueprint(): void {
    // Server-controlled tool execution is now the only supported agent execution path.
    // Tools are executed via HttpRequest -> Starships API, and permissions are enforced server-side.
    this.params.blueprint = Agent.defaultAgentBlueprintServerTools();
  }

  /**
   * Get current blueprint
   */
  getCurrentBlueprint(): Blueprint {
    return this.params.blueprint!;
  }

  // =============================================================================
  // EXECUTION METHODS
  // =============================================================================

  /**
   * Execute the agent with optional input items
   * Uses the configured runner to execute the agent's blueprint
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    try {
      // Create execution with ordered messages in state (system -> memory -> conversation)
      const parentExecution = this.options?.execution;
      const execution = ExecutionItemUtils.createExecution(undefined, parentExecution);

      Agent.seedExecutionStateIntoState(execution.state as Record<string, unknown>, this.params, input);

      // Prepare engine config with event callback
      const engineConfig: EngineConfig & Record<string, unknown> = {
        ...(this.options?.runnerConfig || {}),
        eventCallback: this.options?.eventCallback,
        failOnNodeError: false,
        runtimeEnv: this.options?.runtimeEnv,
        hostRuntime: this.options?.hostRuntime,
      };

      // Execute using runner chosen by current execution depth
      const blueprint = this.getCurrentBlueprint();
      const depth = execution.depth ?? 0;
      const runner: Runner = this.options?.runner ?? RunnerFactory.getTopLevelRunner(depth);

      // If the runner supports cancellation controllers, prefer that path so callers can stop a turn.
      type RunnerController = { promise: Promise<ExecutionItem[]>; cancel: () => void };
      type RunnerWithController = Runner & {
        runWithController: (bp: Blueprint, exec: Execution, cfg?: EngineConfig) => RunnerController;
      };
      const ctl = (runner as Runner & Partial<RunnerWithController>).runWithController?.(blueprint, execution, engineConfig);
      if (ctl && typeof ctl.cancel === 'function') {
        try {
          this.options?.onCancel?.(ctl.cancel);
        } catch {
          // ignore cancel registration failures
        }
        return await ctl.promise;
      }

      return await runner.run(blueprint, execution, engineConfig);
    } catch (error) {
      throw new Error(`Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate agent structure and configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Check required agent fields
    if (!this.params.name) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent name is required',
      });
    }

    if (!this.params.model) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent model is required',
      });
    }

    // Check blueprint structure (guaranteed to exist after constructor)
    // Blueprint is always present due to constructor logic, so we validate its structure
    const nodes = this.params.blueprint!.nodes || [];
    const edges = this.params.blueprint!.edges || [];

    // Check for start node
    const hasStartNode = nodes.some((node) => node.type === 'start');
    if (!hasStartNode) {
      errors.push({
        code: 'MISSING_START_NODE',
        message: 'Agent blueprint must have a start node',
      });
    }

    // Note: Node type validation will be handled by external Engine during execution

    // Check edge references
    const nodeRefs = new Set(nodes.map((n) => n.ref));
    const invalidEdges = edges.filter((edge) => !nodeRefs.has(edge.from) || !nodeRefs.has(edge.to));
    if (invalidEdges.length > 0) {
      errors.push({
        code: 'INVALID_EDGE_CONNECTION',
        message: `Invalid edge references found in agent blueprint: ${invalidEdges.length} edges`,
        details: { invalidEdges: invalidEdges.map((e) => ({ from: e.from, to: e.to, ref: e.ref })) },
      });
    }

    // Validate timeout if provided
    if (this.params.timeout !== undefined && this.params.timeout < 1000) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Agent timeout should be at least 1000ms',
        details: { timeout: this.params.timeout },
      });
    }

    // Validate temperature if provided
    if (this.params.temperature !== undefined && (this.params.temperature < 0 || this.params.temperature > 2)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Agent temperature should be between 0 and 2',
        details: { temperature: this.params.temperature },
      });
    }

    // Validate maxTokens if provided
    if (this.params.maxTokens !== undefined && this.params.maxTokens < 1) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Agent maxTokens should be at least 1',
        details: { maxTokens: this.params.maxTokens },
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
