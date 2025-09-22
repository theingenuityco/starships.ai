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
                  tool_calls: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls }}`,
                },
              },
            ],
          },
        },
        // Conditional node for tool call detection
        {
          ref: conditionalNodeRef,
          type: 'conditional' as const,
          name: 'Check Tool Calls',
          description: 'Check if LLM made any tool calls',
          parameters: {
            condition: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls !== undefined && $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls !== null }}`,
          },
        },
        // Tool execution node - receives the complete tool definition via template resolution
        {
          ref: toolNodeRef,
          type: 'tool' as const,
          name: 'Execute Tool',
          description: 'Execute tool and add result to conversation',
          parameters: {
            // Resolve tool definition from state using the tool name from LLM response
            name: `{{ state.tools.find(t => t.name === $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].function.name).name }}`,
            description: `{{ state.tools.find(t => t.name === $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].function.name).description }}`,
            parameters: `{{ state.tools.find(t => t.name === $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].function.name).parameters }}`,
            blueprint: `{{ state.tools.find(t => t.name === $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].function.name).blueprint }}`,
            toolCallId: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].id }}`,
            mutations: [
              {
                operation: 'add' as const,
                path: '/state/messages/-',
                value: {
                  role: 'tool',
                  tool_call_id: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].id }}`,
                  name: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].function.name }}`,
                  content: `{{ JSON.stringify($lastOutputOf("${toolNodeRef}")[0].json) }}`,
                },
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
        // Conditional -> Tool (if tool_calls exist)
        { ref: 'edge_conditional_tool', from: conditionalNodeRef, to: toolNodeRef, condition: 'true' },
        // Tool -> LLM (loop back)
        { ref: 'edge_tool_llm', from: toolNodeRef, to: llmNodeRef },
        // Conditional -> End (if no tool_calls)
        { ref: 'edge_conditional_end', from: conditionalNodeRef, to: endRef, condition: 'false' },
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
          orderedMessages.push(...inputData);
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
        failOnNodeError: true,
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
