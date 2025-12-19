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
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { EngineConfig } from '@/engine/Engine';
import { RunnerFactory } from '@/runner/RunnerFactory';
import { BlueprintBuilder } from '@/BlueprintBuilder';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private options?: NodeHandlerOptions;
  private nodeCounter: number = 1;

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
              out = { role: 'assistant', content, ...(reasoning ? { reasoning } : {}), toolCalls };
            } else {
              out = { role: 'assistant', content, ...(reasoning ? { reasoning } : {}) };
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
            next.messages = [...(state?.messages ?? []), { role: 'tool', toolCallId, content }];
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
            next.messages = [...(state?.messages ?? []), { role: 'tool', toolCallId, content }];
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
    this.params.blueprint = Agent.defaultAgentBlueprint();
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

      // Merge agent state fields into execution.state so tools can read context (e.g., starshipId)
      if (this.params.state && typeof this.params.state === 'object') {
        Object.assign(execution.state, this.params.state);
      }

      // Seed runtime-configurable LLM settings into state so the default blueprint can resolve them via templates.
      // Use ??= so callers can override per-execution by pre-populating execution.state.
      const s = execution.state as Record<string, unknown>;
      (s as Record<string, unknown>)['model'] ??= this.params.model;
      if (this.params.temperature !== undefined) (s as Record<string, unknown>)['temperature'] ??= this.params.temperature;
      if (this.params.maxTokens !== undefined) (s as Record<string, unknown>)['maxTokens'] ??= this.params.maxTokens;
      if (this.params.timeout !== undefined) (s as Record<string, unknown>)['timeout'] ??= this.params.timeout;
      if (this.params.reasoning !== undefined) (s as Record<string, unknown>)['reasoning'] ??= this.params.reasoning;
      const orderedMessages: LlmMessage[] = [];

      // Add system prompt from params root first
      if (this.params.systemPrompt) {
        orderedMessages.push({ role: 'system', content: this.params.systemPrompt });
      }

      // Add state messages
      if (this.params.state?.messages?.length) {
        orderedMessages.push(...this.params.state.messages);
      }

      // Type guard to detect LlmMessage[]
      const isLlmMessageArray = (val: unknown): val is LlmMessage[] => {
        return (
          Array.isArray(val) &&
          val.every((m) => {
            if (typeof m !== 'object' || m === null) return false;
            const obj = m as Record<string, unknown>;
            return typeof obj.role === 'string' && typeof obj.content === 'string';
          })
        );
      };

      // Add input messages (conversation messages from ConversationService)
      if (input && input.length > 0) {
        const inputData = ExecutionItemUtils.unwrapSingle(input);
        if (isLlmMessageArray(inputData)) {
          orderedMessages.push(...inputData);
        }
        // Silently ignore non-LlmMessage inputs
      }

      // Commit ordered messages to execution state
      (execution.state as Record<string, unknown>)['messages'] = orderedMessages;
      // Store tools in state so LLM nodes can reference them via {{ state.tools }}
      (execution.state as Record<string, unknown>)['tools'] = this.params.state?.tools || [];

      // Prepare engine config with event callback
      const engineConfig: EngineConfig = {
        eventCallback: this.options?.eventCallback,
        failOnNodeError: false,
        runtimeEnv: this.options?.runtimeEnv,
        hostRuntime: this.options?.hostRuntime,
      };

      // Execute using runner chosen by current execution depth
      const blueprint = this.getCurrentBlueprint();
      const depth = execution.depth ?? 0;
      const runner = RunnerFactory.getTopLevelRunner(depth);
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
