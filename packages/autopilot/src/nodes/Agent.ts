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
    const builder = new BlueprintBuilder();

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
        model: this.params.model,
        messages: '{{ state.messages }}',
        tools: '{{ state.tools }}',
        ...(this.params.temperature !== undefined && { temperature: this.params.temperature }),
        ...(this.params.maxTokens !== undefined && { maxTokens: this.params.maxTokens }),
        ...(this.params.timeout !== undefined && { timeout: this.params.timeout }),
        mutations: [
          {
            operation: 'add' as const,
            path: '/state/messages/-',
            value: `{{ (() => {
            const msg = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message ?? {};
            const content = typeof msg.content === "string" ? msg.content : "";
            const calls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
            const reasoning = typeof msg.reasoning === "string" ? msg.reasoning : undefined;
            if (calls.length > 0) {
              const toolCalls = calls.map(tc => ({
                id: tc?.id ?? "",
                type: "function",
                function: {
                  name: tc?.function?.name ?? "",
                  arguments: (() => {
                    try {
                      const a = tc?.function?.arguments;
                      if (typeof a === "string") { try { return JSON.parse(a); } catch { return {}; } }
                      return a ?? {};
                    } catch { return {}; }
                  })()
                }
              }));
              return { role: "assistant", content, ...(reasoning ? { reasoning } : {}), toolCalls };
            }
            return { role: "assistant", content, ...(reasoning ? { reasoning } : {}) };
          })() }}`,
          },
        ],
      },
    });

    // Conditional node for tool call detection
    const conditionalNodeRef = builder.addNode({
      type: 'conditional',
      name: 'Check Tool Calls',
      description: 'Check if LLM made any tool calls or needs to continue due to length finishReason',
      parameters: {
        condition:
          '{{(() => { const last = $input(); const fr = last?.choices?.[0]?.finishReason; if (fr==="length") return "continue"; if (fr==="tool_calls") return "call_tool"; const calls = last?.choices?.[0]?.message?.toolCalls; return Array.isArray(calls) && calls.length > 0 ? "call_tool" : "complete"; })()}}',
      },
    });

    // Prepare arguments for Tool - capture ref for edge connections
    const argsNodeRef = builder.addNode({
      type: 'code',
      name: 'Prepare Tool Args',
      description: 'Materialize arguments into a plain object for Tool input',
      parameters: {
        code: `
        const last = $lastOutputOf("${llmNodeRef}")[0]?.json;
        let j = last?.choices?.[0]?.message?.toolCalls?.[0]?.function?.arguments;
        if (typeof j === 'string') { try { j = JSON.parse(j); } catch {} }
        if (j && typeof j === 'object') { return j; }
        throw new Error('Missing toolCall function.arguments');
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
        name: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.name ?? (slug ?? ""); })() }}`,
        description: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.description ?? ("Tool '" + (slug ?? "unknown") + "' not found"); })() }}`,
        parameters: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.parameters ?? ({ type: "object", properties: {} }); })() }}`,
        blueprint: `{{ (() => { const calls = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls; const slug = calls?.[0]?.function?.name; const tools = Array.isArray(state?.tools) ? state.tools : []; const tool = tools.find(t => t && typeof t.slug === 'string' && t.slug === String(slug ?? '')); return tool?.blueprint; })() }}`,
        toolCallId: `{{ $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls?.[0]?.id ?? "" }}`,
      },
    });

    // Mutate node to add tool result to state
    const toolResultNodeRef = builder.addNode({
      type: 'mutate',
      name: 'Add Tool Result',
      description: 'Add tool result message to conversation state',
      parameters: {
        mutations: [
          {
            operation: 'add' as const,
            path: '/state/messages/-',
            value: `{{ (() => {
            const toolCallId = $lastOutputOf("${llmNodeRef}")[0]?.json?.choices?.[0]?.message?.toolCalls?.[0]?.id ?? "";
            const toolResult = $lastOutputOf("${toolNodeRef}")[0]?.json ?? {};
            const content = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            return {
              role: "tool",
              toolCallId: toolCallId,
              content: content
            };
          })() }}`,
          },
        ],
      },
    });

    // Connect all nodes
    this.params.blueprint = builder
      .addEdge(startRef, llmNodeRef)
      .addEdge(llmNodeRef, conditionalNodeRef)
      .addEdge(conditionalNodeRef, llmNodeRef, 'continue')
      .addEdge(conditionalNodeRef, argsNodeRef, 'call_tool')
      .addEdge(argsNodeRef, toolNodeRef)
      .addEdge(toolNodeRef, toolResultNodeRef)
      .addEdge(toolResultNodeRef, llmNodeRef)
      .addEdge(conditionalNodeRef, endRef, 'complete')
      .setMetadata('generatedBy', 'Agent constructor')
      .build();
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
        secureEnv: this.options?.secureEnv,
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
