/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Enhanced with consistent two-word method naming for semantic grouping.
 */

import { AgentParams, ValidationResult, ValidationError, NodeHandlerOptions, ExecutionItem, LlmParams } from '@/types';
import { NodeHandler } from '@/types/node-handler';
import { Blueprint } from '@/types/blueprint';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { Engine } from '@/engine/Engine';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private options?: NodeHandlerOptions;
  private nodeCounter: number = 1;

  constructor(params: AgentParams, options?: NodeHandlerOptions) {
    // Store agent parameters
    this.params = structuredClone(params);

    // Create options
    this.options = options;

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

      // Add a default LLM node to create start -> llm -> end workflow
      this.addToChain();
    }

    // Blueprint is guaranteed to exist after constructor logic above
  }

  /**
   * Add an LLM node to the chain, inserting it before the end node
   * This allows building chains like: start -> llm -> llm -> ... -> end
   */
  addToChain(name?: string, description?: string): Agent {
    const nodeRef = `llm_${++this.nodeCounter}`;
    const nodeName = name || 'Respond';
    const nodeDescription = description || 'AI response node';

    // Create the LLM parameters
    const llmParams: LlmParams = {
      model: this.params.model,
      messages: '{{ state.messages }}',
      ...(this.params.temperature !== undefined && { temperature: this.params.temperature }),
      ...(this.params.maxTokens !== undefined && { maxTokens: this.params.maxTokens }),
      ...(this.params.timeout !== undefined && { timeout: this.params.timeout }),
      mutations: [
        {
          operation: 'add' as const,
          path: '/state/messages/-',
          value: {
            role: 'assistant',
            content: `{{ $lastOutputOf("${nodeRef}")[0].json.choices[0].message.content }}`,
          },
        },
      ],
    };

    // Create the LLM node
    const llmNode = {
      ref: nodeRef,
      type: 'llm' as const,
      name: nodeName,
      description: nodeDescription,
      parameters: llmParams,
    };

    // Find the end node
    const endNode = this.params.blueprint!.nodes.find((node) => node.type === 'end');
    if (!endNode) {
      throw new Error('End node not found in blueprint');
    }

    // Find the edge that currently connects to the end node
    const edgeToEnd = this.params.blueprint!.edges.find((edge) => edge.to === endNode.ref);
    if (!edgeToEnd) {
      throw new Error('Edge to end node not found');
    }

    // Update the existing edge to point to the new LLM node
    edgeToEnd.to = nodeRef;

    // Add the new LLM node to the blueprint
    this.params.blueprint!.nodes.push(llmNode);

    // Create a new edge from the LLM node to the end node
    this.params.blueprint!.edges.push({
      ref: `edge_${this.params.blueprint!.edges.length + 1}`,
      from: nodeRef,
      to: endNode.ref,
    });

    return this;
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
   * Creates a new Engine instance and executes the agent's blueprint
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Create execution context for the agent's blueprint
    const execution = ExecutionItemUtils.createExecution(input);

    // Initialize empty messages array for template access
    execution.state.messages = [];

    // Create a new Engine instance for executing the agent's blueprint
    const engine = new Engine({
      eventCallback: this.options?.eventCallback,
    });

    try {
      // Execute the agent's blueprint using the new Engine
      return await engine.executeBlueprint(this.params.blueprint!, execution);
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
