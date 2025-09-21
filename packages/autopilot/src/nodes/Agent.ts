/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Enhanced with consistent two-word method naming for semantic grouping.
 */

import { AgentParams, ValidationResult, ValidationError, NodeHandlerOptions, ExecutionItem, LlmParams, LlmMessage } from '@/types';
import { NodeHandler } from '@/types/node-handler';
import { Blueprint } from '@/types/blueprint';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { EngineConfig } from '@/engine/Engine';
import { Runner } from '@/runner/Runner';
import { LocalRunner } from '@/runner/LocalRunner';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private options?: NodeHandlerOptions;
  private nodeCounter: number = 1;
  private runner: Runner;

  constructor(params: AgentParams, options?: NodeHandlerOptions) {
    // Store agent parameters
    this.params = structuredClone(params);

    // Create options
    this.options = options;

    // Initialize runner - defaults to LocalRunner for nested execution safety
    // ConversationService or other top-level callers can provide a ChildProcessRunner via options
    this.runner = options?.runner ?? new LocalRunner();

    // Initialize blueprint if not provided - creates Start -> End workflow (minimal)
    if (!this.params.blueprint) {
      this.params.blueprint = {
        nodes: [
          {
            ref: 'start_1',
            type: 'start',
            name: 'Start',
            description: 'Start node',
            parameters: {},
          },
          {
            ref: 'end_1',
            type: 'end',
            name: 'End',
            description: 'End node',
            parameters: {},
          },
        ],
        edges: [
          {
            ref: 'edge_1',
            from: 'start_1',
            to: 'end_1',
          },
        ],
        metadata: {
          generatedBy: 'Agent constructor',
          createdAt: new Date().toISOString(),
        },
      };
      this.nodeCounter = 2; // start_1 and end_1 are taken

      // Create the appropriate blueprint based on configuration
      this.createDefaultBlueprint();
    }

    // Blueprint is guaranteed to exist after constructor logic above
  }

  /**
   * Create default blueprint - unified approach for all agent types
   * Simple agents: Start -> LLM -> Conditional -> End (conditional always false)
   * Tool agents: Start -> LLM -> Conditional -> Tool -> LLM (conditional routes based on tool_calls)
   */
  private createDefaultBlueprint(): void {
    const llmNodeRef = `llm_${this.nodeCounter++}`;
    const conditionalNodeRef = `conditional_${this.nodeCounter++}`;
    const hasTools = this.params.tools && this.params.tools.length > 0;

    // Create unified LLM node that handles both simple and tool-enabled cases
    const llmParams: LlmParams = {
      model: this.params.model,
      messages: '{{ state.messages }}',
      ...(hasTools && { tools: this.params.tools }),
      ...(this.params.temperature !== undefined && { temperature: this.params.temperature }),
      ...(this.params.maxTokens !== undefined && { maxTokens: this.params.maxTokens }),
      ...(this.params.timeout !== undefined && { timeout: this.params.timeout }),
      // Always add assistant message via inline mutation
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
    };

    const llmNode = {
      ref: llmNodeRef,
      type: 'llm' as const,
      name: hasTools ? 'LLM with Tools' : 'Respond',
      description: hasTools ? 'AI model with function calling capability' : 'AI response node',
      parameters: llmParams,
    };

    // Create conditional node to check for tool calls from current LLM response
    const conditionalNode = {
      ref: conditionalNodeRef,
      type: 'conditional' as const,
      name: 'Check Tool Calls',
      description: 'Check if LLM wants to call any tools',
      parameters: {
        condition: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls !== undefined && $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls !== null }}`,
      },
    };

    // Find the end node
    const endNode = this.params.blueprint!.nodes.find((node) => node.type === 'end')!;

    // Always create the unified blueprint structure
    this.params.blueprint!.nodes.push(llmNode, conditionalNode);

    // Update start edge to point to LLM
    const startToEndEdge = this.params.blueprint!.edges.find((edge) => edge.to === endNode.ref)!;
    startToEndEdge.to = llmNodeRef;

    // Add LLM -> Conditional edge
    this.params.blueprint!.edges.push({
      ref: `edge_${this.params.blueprint!.edges.length + 1}`,
      from: llmNodeRef,
      to: conditionalNodeRef,
    });

    // Create tool node and edges only if tools exist
    if (hasTools) {
      const toolNodeRef = `tool_${this.nodeCounter++}`;
      const toolNode = {
        ref: toolNodeRef,
        type: 'tool' as const,
        name: 'Execute Tool',
        description: 'Execute the requested tool',
        parameters: {
          name: `{{ $lastOutputOf("${llmNodeRef}")[0].json.choices[0].message.tool_calls[0].function.name }}`,
          description: 'Dynamic tool execution',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          // Add tool result via inline mutation
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
      };

      this.params.blueprint!.nodes.push(toolNode);

      this.params.blueprint!.edges.push(
        // Conditional -> Tool (if tool calls exist)
        {
          ref: `edge_${this.params.blueprint!.edges.length + 2}`,
          from: conditionalNodeRef,
          to: toolNodeRef,
          condition: 'true',
        },
        // Tool -> LLM (loop back after adding tool result)
        {
          ref: `edge_${this.params.blueprint!.edges.length + 3}`,
          from: toolNodeRef,
          to: llmNodeRef,
        }
      );
    }

    // Conditional -> End (always present - if no tools or no tool_calls)
    this.params.blueprint!.edges.push({
      ref: `edge_${this.params.blueprint!.edges.length + 4}`,
      from: conditionalNodeRef,
      to: endNode.ref,
      condition: 'false',
    });
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
    // Create execution context for the agent's blueprint
    const execution = ExecutionItemUtils.createExecution(input);

    // Initialize messages in the required order:
    // 1) systemMessage from this.params.memoryState
    // 2) messages from this.params.memoryState
    // 3) message(s) from execute args
    const orderedMessages: LlmMessage[] = [];

    const memory = this.params.memoryState;
    if (memory?.systemPrompt) {
      orderedMessages.push({ role: 'system', content: memory.systemPrompt });
    }
    if (memory?.messages?.length) {
      orderedMessages.push(...memory.messages);
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

    if (input && input.length > 0) {
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      // If input contains an array of LlmMessage, append them; otherwise create a user message from the input
      if (isLlmMessageArray(inputData)) {
        orderedMessages.push(...inputData);
      } else {
        const content = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
        orderedMessages.push({ role: 'user', content });
      }
    }

    // Commit ordered messages to execution state
    (execution.state as Record<string, unknown>)['messages'] = orderedMessages;
    // Provide tool definitions (with blueprints) to execution state for Tool node resolution
    (execution.state as Record<string, unknown>)['tools'] = this.params.tools || [];

    try {
      // Create execution with ordered messages in state (system -> memory -> conversation)
      const execution = ExecutionItemUtils.createExecution();
      const orderedMessages: LlmMessage[] = [];

      const memory = this.params.memoryState;
      if (memory?.systemPrompt) {
        orderedMessages.push({ role: 'system', content: memory.systemPrompt });
      }
      if (memory?.messages?.length) {
        orderedMessages.push(...memory.messages);
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

      if (input && input.length > 0) {
        const inputData = ExecutionItemUtils.unwrapSingle(input);
        // If input contains an array of LlmMessage, append them; otherwise create a user message from the input
        if (isLlmMessageArray(inputData)) {
          orderedMessages.push(...inputData);
        } else {
          const content = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
          orderedMessages.push({ role: 'user', content });
        }
      }

      // Commit ordered messages to execution state
      (execution.state as Record<string, unknown>)['messages'] = orderedMessages;
      // Provide tool definitions (with blueprints) to execution state for Tool node resolution
      (execution.state as Record<string, unknown>)['tools'] = this.params.tools || [];

      // Prepare engine config with event callback
      const engineConfig: EngineConfig = {
        eventCallback: this.options?.eventCallback,
        failOnNodeError: true,
      };

      // Execute using the configured runner
      const blueprint = this.getCurrentBlueprint();
      return await this.runner.run(blueprint, execution, engineConfig);
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
