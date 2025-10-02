/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Enhanced with consistent two-word method naming for semantic grouping.
 */

import { AgentParams, AgentState, ValidationResult, ValidationError, NodeHandlerOptions, ExecutionItem, LlmMessage } from '@/types';
import { NodeHandler } from '@/types/node-handler';
import { Blueprint } from '@/types/blueprint';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { EngineConfig } from '@/engine/Engine';
import { LocalRunner } from '@/runner/LocalRunner';
import { ChildProcessRunner } from '@/runner/ChildProcessRunner';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private options?: NodeHandlerOptions;
  private nodeCounter: number = 1;
  private state: AgentState;

  constructor(params: AgentParams, options?: NodeHandlerOptions) {
    // Store agent parameters
    this.params = structuredClone(params);

    // Create options
    this.options = options;

    // Initialize state from params.state first
    this.state = {
      messages: params.state?.messages || [],
      tools: params.state?.tools || [],
    };

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
    const startRef = `start_${this.nodeCounter++}`;
    const endRef = `end_${this.nodeCounter++}`;
    const llmNodeRef = `llm_${this.nodeCounter++}`;
    const conditionalNodeRef = `conditional_${this.nodeCounter++}`;
    const argsNodeRef = `args_${this.nodeCounter++}`;
    const toolNodeRef = `tool_${this.nodeCounter++}`;

    // Create complete blueprint with all nodes
    this.params.blueprint = {
      nodes: [
        // Start node
        {
          ref: startRef,
          type: 'start',
          name: 'Start',
          description: 'Start node',
          parameters: {},
        },
        // End node
        {
          ref: endRef,
          type: 'end',
          name: 'End',
          description: 'End node',
          parameters: {},
        },
        // LLM node with state-driven tools
        {
          ref: llmNodeRef,
          type: 'llm' as const,
          name: 'AI Assistant',
          description: 'AI model with state-driven tool support',
          parameters: {
            model: this.params.model,
            messages: '{{ state.messages }}',
            tools: '{{ state.tools }}', // Always use state - Engine handles empty arrays
            ...(this.params.temperature !== undefined && { temperature: this.params.temperature }),
            ...(this.params.maxTokens !== undefined && { maxTokens: this.params.maxTokens }),
            ...(this.params.timeout !== undefined && { timeout: this.params.timeout }),
            mutations: [
              {
                operation: 'add' as const,
                path: '/state/messages/-',
                value: {
                  role: 'assistant',
                  content: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.content }}`,
                  reasoning: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.reasoning }}`,
                  tool_calls: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls }}`,
                },
              },
            ],
          },
        },
        // Conditional node for tool call detection + streaming length handling + batch processing
        {
          ref: conditionalNodeRef,
          type: 'conditional' as const,
          name: 'Check Tool Calls',
          description: 'Check if LLM made any tool calls or needs to continue due to length finish_reason',
          parameters: {
            condition:
              '{{(() => { const last = $input(); const fr = last?.choices?.[0]?.finish_reason; if (fr==="length") return "continue"; if (fr==="tool_calls") return "call_tool"; const calls = last?.choices?.[0]?.message?.tool_calls; return Array.isArray(calls) && calls.length > 0 ? "call_tool" : "complete"; })()}}',
          },
        },
        // Prepare arguments for Tool (extract ALL tool calls)
        {
          ref: argsNodeRef,
          type: 'code' as const,
          name: 'Prepare Tool Args',
          description: 'Extract ALL tool calls for parallel execution',
          parameters: {
            code: `
              const last = $lastOutputOf("${llmNodeRef}")[0]?.json;
              const toolCalls = last?.choices?.[0]?.message?.tool_calls || [];
              
              // Handle empty tool calls gracefully (return empty array instead of error)
              if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
                // Return empty array - Tool node will handle appropriately
                return [];
              }
              
              // Return the WHOLE array - Tool node handles distribution
              // Robust arg handling:
              // - Prefer arguments_json when it's an object
              // - Fallback to parsing function.arguments string
              // - Default to {} on empty/invalid
              return toolCalls.map((call, index) => ({
                id: call.id,
                name: call.function?.name || '',
                arguments: (() => {
                  const aj = call.function?.arguments_json;
                  if (aj && typeof aj === 'object') return aj;
                  const s = typeof call.function?.arguments === 'string' ? call.function.arguments : '';
                  if (!s || s.trim().length === 0) return {};
                  try {
                    return JSON.parse(s);
                  } catch {
                    return {};
                  }
                })(),
                callIndex: index,
                toolCallId: call.id
              }));
            `,
            timeout: 3000,
          },
        },
        // Tool execution node - universal tool executor for parallel execution
        {
          ref: toolNodeRef,
          type: 'tool' as const,
          name: 'Execute Tools',
          description: 'Execute tools based on input data',
          parameters: {
            // Static configuration - Tool node builds blueprints dynamically
            name: 'universal_tool_executor',
            description: 'Execute tools based on input data',
            parameters: {
              type: 'object',
              properties: {
                toolCalls: {
                  type: 'array',
                  items: { type: 'object' },
                },
              },
            },
            blueprint: null, // Tool node builds blueprints dynamically

            // Append ALL tool results (successful + failed) to state.messages so the next LLM pass can synthesize
            // We replace the entire messages array with previous messages + new tool messages (dynamic count)
            mutations: [
              {
                operation: 'replace' as const,
                path: '/state/messages',
                value: `{{
                  (() => {
                    const prev = (state && Array.isArray(state.messages)) ? state.messages : [];
                    const results = $lastOutputOf("${toolNodeRef}")[0]?.json || {};
                    const successful = Array.isArray(results.successful) ? results.successful : [];
                    const failed = Array.isArray(results.failed) ? results.failed : [];
                    
                    const toMessage = (r) => {
                      const data = r && r.data && typeof r.data === 'object' && r.data.json ? r.data.json : (r ? r.data : undefined);
                      let content;
                      try { content = typeof data === 'string' ? data : JSON.stringify(data); } catch { content = String(data); }
                      return {
                        role: 'tool',
                        tool_call_id: r?.toolCallId,
                        name: r?.toolName,
                        content
                      };
                    };
                    
                    const successMsgs = successful.map(toMessage);
                    const failedMsgs = failed.map((r) => {
                      const base = toMessage({ ...r, data: { error: r?.error || 'Unknown error' } });
                      base.tool_failed = true;
                      return base;
                    });
                    
                    return [...prev, ...successMsgs, ...failedMsgs];
                  })()
                }}`,
              },
            ],
          },
        },
      ],
      edges: [
        // Start -> LLM
        { ref: 'edge_start_llm', from: startRef, to: llmNodeRef },
        // LLM -> Conditional
        { ref: 'edge_llm_conditional', from: llmNodeRef, to: conditionalNodeRef },
        // Conditional -> LLM (if finish_reason === "length")
        { ref: 'edge_conditional_llm_length', from: conditionalNodeRef, to: llmNodeRef, condition: 'continue' },
        // Conditional -> Prepare Args (if tool_calls exist)
        { ref: 'edge_conditional_args', from: conditionalNodeRef, to: argsNodeRef, condition: 'call_tool' },
        // Prepare Args -> Tool
        { ref: 'edge_args_tool', from: argsNodeRef, to: toolNodeRef },
        // Tool -> LLM (loop back)
        { ref: 'edge_tool_llm', from: toolNodeRef, to: llmNodeRef },
        // Conditional -> End (if no tool_calls)
        { ref: 'edge_conditional_end', from: conditionalNodeRef, to: endRef, condition: 'complete' },
      ],
      metadata: {
        generatedBy: 'Agent constructor',
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Get current blueprint
   */
  getCurrentBlueprint(): Blueprint {
    return this.params.blueprint!;
  }

  // =============================================================================
  // MESSAGE PROCESSING METHODS
  // =============================================================================

  /**
   * Sanitize tool messages by removing invalid ones without tool_call_id
   * This ensures compatibility with OpenRouter/OpenAI requirements
   */
  private sanitizeToolMessages(messages: LlmMessage[]): LlmMessage[] {
    const toolMsgs = messages.filter((m) => m.role === 'tool');
    const invalidToolMsgs = toolMsgs.filter((m) => !m.tool_call_id);
    
    if (invalidToolMsgs.length > 0) {
      console.warn('[AGENT] Removing invalid tool messages without tool_call_id:', {
        total: messages.length,
        toolCount: toolMsgs.length,
        invalidCount: invalidToolMsgs.length,
      });
      
      // Filter out invalid tool messages without tool_call_id
      return messages.filter((m) => m.role !== 'tool' || !!m.tool_call_id);
    }
    
    return messages;
  }

  /**
   * Inject tool calling rules if tools are available and not already present
   * These generic rules enable all agents to understand parallel vs sequential execution
   */
  private injectToolCallingRules(messages: LlmMessage[]): LlmMessage[] {
    const tools = this.state.tools || [];
    
    // Only inject if we have tools
    if (tools.length === 0) return messages;
    
    // Check if rules already exist to avoid duplicates
    const hasToolRules = messages.some((msg) => 
      msg.role === 'system' && msg.content?.includes('TOOL CALLING RULE')
    );
    
    if (!hasToolRules) {
      const systemRules: LlmMessage = {
        role: 'system',
        content: 'TOOL CALLING RULES:\n' +
          '1. Only call a tool when you have ACTUAL values for all its arguments - never guess or use placeholders.\n' +
          '2. When tools are INDEPENDENT (don\'t need each other\'s output), call them ALL in the same response for parallel execution.\n' +
          '3. When tools are DEPENDENT (Tool B needs Tool A\'s output), wait for Tool A to complete before calling Tool B.'
      };
      
      return [systemRules, ...messages];
    }
    
    return messages;
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
      if (this.state && typeof this.state === 'object') {
        Object.assign(execution.state, this.state);
      }
      const orderedMessages: LlmMessage[] = [];

      // Add system prompt from params root first
      if (this.params.systemPrompt) {
        orderedMessages.push({ role: 'system', content: this.params.systemPrompt });
      }

      // Add state messages
      if (this.state.messages?.length) {
        orderedMessages.push(...this.state.messages);
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
          // Process messages: sanitize tool messages and inject tool calling rules
          let processedMessages = this.sanitizeToolMessages(inputData);
          processedMessages = this.injectToolCallingRules(processedMessages);
          
          orderedMessages.push(...processedMessages);
        }
        // Silently ignore non-LlmMessage inputs
      }

      // Commit ordered messages to execution state
      (execution.state as Record<string, unknown>)['messages'] = orderedMessages;
      // Store tools in state so LLM nodes can reference them via {{ state.tools }}
      (execution.state as Record<string, unknown>)['tools'] = this.state.tools || [];

      // Prepare engine config with event callback
      const engineConfig: EngineConfig = {
        eventCallback: this.options?.eventCallback,
        failOnNodeError: false,
        secureEnv: this.options?.secureEnv,
      };

      // Execute using runner chosen by current execution depth
      const blueprint = this.getCurrentBlueprint();
      const depth = execution.depth ?? 0;
      // Use ChildProcessRunner for top-level Agent executions (depth 0) and LocalRunner for nested (depth > 0)
      const runner = depth === 0 ? new ChildProcessRunner() : new LocalRunner();
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
