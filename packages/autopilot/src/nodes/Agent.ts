/**
 * Agent Class
 *
 * Executable agent that combines agent configuration with execution capabilities.
 * Uses an internal Engine for execution that manages all node handlers automatically.
 * Memory-first architecture with AgentMemory system.
 * Enhanced with consistent two-word method naming for semantic grouping.
 */

import { AgentMemory } from '@/memory/AgentMemory';
import { Engine } from '@/engine/Engine';
import { AgentParams, ValidationResult, ValidationError, NodeHandlerOptions, Execution, LlmMessage } from '@/types';
import { EventCallback } from '@/types/events';
import { NodeHandler } from '@/types/node-handler';
import { Blueprint, Node } from '@/types/blueprint';
import { LlmParams, TransformParams } from '@/types/node-parameters';

export class Agent implements NodeHandler {
  private params: AgentParams;
  private memory: AgentMemory;
  private engine: Engine;
  private eventCallback?: EventCallback;
  private nodeCounter: number = 1;

  constructor(params: AgentParams, options?: NodeHandlerOptions) {
    // Store agent parameters
    this.params = structuredClone(params);

    // Create AgentMemory instance from config or default
    this.memory = new AgentMemory(
      this.params.memoryState || {
        identity: { name: this.params.name || 'Agent', role: 'AI Assistant' },
        purpose: { primary: 'Assist users with their needs' },
      }
    );

    // Create engine - handles all node types internally
    this.eventCallback = options?.eventCallback;

    // Initialize blueprint if not provided
    if (!this.params.blueprint) {
      const startRef = `start_${this.nodeCounter++}`;
      const endRef = `end_${this.nodeCounter++}`;

      this.params.blueprint = {
        nodes: [
          {
            ref: startRef,
            type: 'start',
            name: 'Start',
            description: 'Start node',
            parameters: {},
          },
          {
            ref: endRef,
            type: 'end',
            name: 'End',
            description: 'End node',
            parameters: {},
          },
        ],
        edges: [
          {
            ref: `edge_1`,
            from: startRef,
            to: endRef,
          },
        ],
        metadata: {
          generatedBy: 'Agent constructor',
          createdAt: new Date().toISOString(),
        },
      };
    }

    // At this point blueprint is guaranteed to exist
    const engincConfig = {
      blueprint: this.params.blueprint,
      eventCallback: this.eventCallback,
    };
    this.engine = new Engine(engincConfig);
  }

  async addMessageToMemory(message: LlmMessage) {
    return this.memory.addMessageToHistory(message);
  }

  // =============================================================================
  // PRIVATE HELPERS
  // =============================================================================

  /**
   * Get the last node in the workflow (for chaining)
   */
  private getLastNode(): Node | undefined {
    const nodes = this.params.blueprint!.nodes;
    return nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
  }

  /**
   * Recreate engine after blueprint modifications
   */
  private updateEngine(): void {
    const engincConfig = {
      blueprint: this.params.blueprint!,
      eventCallback: this.eventCallback,
    };
    this.engine = new Engine(engincConfig);
  }

  /**
   * Helper method to connect new node to previous node and redirect to end node
   */
  private connectToPrevious(newNodeRef: string): void {
    const nodes = this.params.blueprint!.nodes;
    const edges = this.params.blueprint!.edges;

    // Find the end node
    const endNode = nodes.find((node) => node.type === 'end');
    if (!endNode) return;

    // Find the node that currently connects to the end node (should be the last added node)
    const edgeToEnd = edges.find((edge) => edge.to === endNode.ref);
    if (!edgeToEnd) return;

    // Update the edge to end node: redirect it to point to the new node
    edgeToEnd.to = newNodeRef;

    // Add new edge from the new node to the end node
    edges.push({
      ref: `edge_${edges.length + 1}`,
      from: newNodeRef,
      to: endNode.ref,
    });
  }

  // =============================================================================
  // DEFINE* - Agent Identity & Configuration
  // =============================================================================

  /**
   * Define agent personality traits
   */
  definePersonality(
    traits: string | string[],
    options?: {
      name?: string;
      strength?: 'subtle' | 'moderate' | 'strong';
    }
  ): Agent {
    const traitsList = Array.isArray(traits) ? traits : [traits];
    const strength = options?.strength || 'moderate';
    const intensityMap = {
      subtle: 'lightly influenced by',
      moderate: 'guided by',
      strong: 'strongly characterized by',
    };

    const personalityDescription = `You are ${intensityMap[strength]} these personality traits: ${traitsList.join(', ')}`;

    // Update agent identity in memory
    if (this.memory.state.identity) {
      this.memory.state.identity.personality = traitsList.join(', ');
    }

    return this.learnThat(personalityDescription, {
      name: options?.name || 'Define Personality',
      permanent: true,
    });
  }

  /**
   * Define agent role and expertise
   */
  defineRole(
    role: string,
    expertise?: string[],
    options?: {
      name?: string;
    }
  ): Agent {
    // Update agent identity in memory
    if (this.memory.state.identity) {
      this.memory.state.identity.role = role;
      if (expertise) {
        this.memory.state.identity.expertise = expertise;
      }
    }

    const expertiseText = expertise ? ` with expertise in: ${expertise.join(', ')}` : '';
    const roleDescription = `Your role is: ${role}${expertiseText}`;

    return this.learnThat(roleDescription, {
      name: options?.name || 'Define Role',
      permanent: true,
    });
  }

  /**
   * Define what the agent can handle
   */
  defineCapabilities(
    description: string,
    options?: {
      name?: string;
      examples?: string[];
    }
  ): Agent {
    let capabilityText = `You can handle: ${description}`;

    if (options?.examples) {
      capabilityText += `\n\nFor example:\n${options.examples.map((ex) => `- ${ex}`).join('\n')}`;
    }

    return this.learnThat(capabilityText, {
      name: options?.name || 'Define Capabilities',
      permanent: true,
    });
  }

  // =============================================================================
  // LEARN* - Knowledge & Information
  // =============================================================================

  /**
   * Learn new knowledge or information
   */
  learnThat(
    knowledge: string,
    options?: {
      name?: string;
      permanent?: boolean;
    }
  ): Agent {
    const ref = `learn_${this.nodeCounter++}`;
    const name = options?.name || 'Learn';

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: `You are learning new information. Integrate this knowledge: ${knowledge}`,
      },
      {
        role: 'user',
        content: 'Acknowledge what you have learned and how it applies to your role.',
      },
    ];

    const llmParams: LlmParams = {
      model: '{{ $exists(state.model) ? state.model : "anthropic/claude-3-haiku" }}',
      messages,
      temperature: 0.3, // Lower temperature for learning
      maxTokens: '{{ $exists(state.maxTokens) ? state.maxTokens : 256 }}',
    };

    this.params.blueprint!.nodes.push({
      ref,
      type: 'llm',
      name,
      description: `Learning: ${knowledge}`,
      parameters: llmParams,
    });

    // Store learned knowledge in state if permanent
    if (options?.permanent !== false) {
      this.memoryStore('knowledge', knowledge);
    }

    this.connectToPrevious(ref);
    this.updateEngine();
    return this;
  }

  /**
   * Learn from contextual information
   */
  learnFrom(
    context: string,
    options?: {
      name?: string;
      importance?: 'background' | 'important' | 'critical';
    }
  ): Agent {
    const importance = options?.importance || 'important';
    const importanceText = {
      background: 'Keep in mind',
      important: 'Be aware that',
      critical: 'It is critical to understand that',
    };

    const contextDescription = `${importanceText[importance]}: ${context}`;

    return this.learnThat(contextDescription, {
      name: options?.name || 'Learn Context',
      permanent: true,
    });
  }

  // =============================================================================
  // MEMORY* - Information Storage & Recall
  // =============================================================================

  /**
   * Store information in agent memory
   */
  memoryStore(
    key: string,
    information: unknown,
    options?: {
      name?: string;
    }
  ): Agent {
    const ref = `remember_${this.nodeCounter++}`;
    const name = options?.name || 'Remember';

    const transformParams: TransformParams = {
      transforms: [
        {
          operation: 'add',
          path: `/state/memory/${key}`,
          value: information,
        },
      ],
    };

    this.params.blueprint!.nodes.push({
      ref,
      type: 'transform',
      name,
      description: `Remember: ${key}`,
      parameters: transformParams,
    });

    this.connectToPrevious(ref);
    this.updateEngine();
    return this;
  }

  /**
   * Consider and remember contextual awareness
   */
  memoryConsider(
    context: string,
    options?: {
      name?: string;
      importance?: 'background' | 'important' | 'critical';
    }
  ): Agent {
    return this.learnFrom(context, options);
  }

  // =============================================================================
  // THINK* - Cognitive Processing
  // =============================================================================

  /**
   * Think about a specific topic
   */
  thinkAbout(
    topic: string,
    options?: {
      name?: string;
      useContext?: boolean;
    }
  ): Agent {
    const ref = `think_${this.nodeCounter++}`;
    const name = options?.name || 'Think';

    const messages: LlmMessage[] = [];

    // Add context if requested (default true)
    if (options?.useContext !== false) {
      messages.push({
        role: 'system',
        content: '{{ $nodeResult("memory").messages ~> $join("\\n") }}',
      });
    }

    messages.push({
      role: 'user',
      content: `Think about: ${topic}`,
    });

    const llmParams: LlmParams = {
      model: '{{ $exists(state.model) ? state.model : "anthropic/claude-3-haiku" }}',
      messages,
      temperature: '{{ $exists(state.temperature) ? state.temperature : 0.7 }}',
      maxTokens: '{{ $exists(state.maxTokens) ? state.maxTokens : 512 }}',
    };

    this.params.blueprint!.nodes.push({
      ref,
      type: 'llm',
      name,
      description: `Internal reasoning: ${topic}`,
      parameters: llmParams,
    });

    this.connectToPrevious(ref);
    this.updateEngine();
    return this;
  }

  /**
   * Think through multiple reasoning steps
   */
  thinkThrough(
    steps: string[],
    options?: {
      name?: string;
      style?: 'logical' | 'creative' | 'analytical';
    }
  ): Agent {
    const style = options?.style || 'logical';
    const stylePrompts = {
      logical: 'Think logically step by step',
      creative: 'Think creatively and explore different angles',
      analytical: 'Analyze systematically and break down the problem',
    };

    steps.forEach((step, index) => {
      const isFirst = index === 0;
      const stepInstruction = isFirst ? `${stylePrompts[style]}. ${step}` : `Continue your reasoning: ${step}`;

      this.thinkAbout(stepInstruction, {
        name: options?.name ? `${options.name} - Step ${index + 1}` : `Think Step ${index + 1}`,
        useContext: true,
      });
    });

    return this;
  }

  // =============================================================================
  // PROCESS* - Information Analysis
  // =============================================================================

  /**
   * Process and analyze input
   */
  processInput(
    inputDescription: string,
    options?: {
      name?: string;
      type?: 'summary' | 'detailed' | 'creative' | 'analytical';
    }
  ): Agent {
    const ref = `process_${this.nodeCounter++}`;
    const name = options?.name || 'Process Input';

    const analysisPrompts = {
      summary: 'Provide a concise summary and key points',
      detailed: 'Analyze thoroughly and provide detailed insights',
      creative: 'Think creatively and explore possibilities',
      analytical: 'Break down logically and analyze systematically',
    };

    const prompt = analysisPrompts[options?.type || 'detailed'];

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: '{{ $nodeResult("memory").messages ~> $join("\\n") }}',
      },
      {
        role: 'user',
        content: `${inputDescription}\n\n${prompt}.`,
      },
    ];

    const llmParams: LlmParams = {
      model: '{{ $exists(state.model) ? state.model : "anthropic/claude-3-haiku" }}',
      messages,
      temperature: options?.type === 'creative' ? 0.9 : 0.5,
      maxTokens: '{{ $exists(state.maxTokens) ? state.maxTokens : 1024 }}',
    };

    this.params.blueprint!.nodes.push({
      ref,
      type: 'llm',
      name,
      description: `Process: ${inputDescription}`,
      parameters: llmParams,
    });

    this.connectToPrevious(ref);
    this.updateEngine();
    return this;
  }

  // =============================================================================
  // RESPOND* - Output Generation
  // =============================================================================

  /**
   * Respond to user input
   */
  respondTo(
    inputDescription: string,
    options?: {
      name?: string;
      style?: string;
      includeContext?: boolean;
    }
  ): Agent {
    const ref = `respond_${this.nodeCounter++}`;
    const name = options?.name || 'Respond';

    const messages: LlmMessage[] = [];

    // Add context if requested (default true)
    if (options?.includeContext !== false) {
      messages.push({
        role: 'system',
        content: '{{ $nodeResult("memory").messages ~> $join("\\n") }}',
      });
    }

    // Add style guidance if provided
    if (options?.style) {
      messages.push({
        role: 'system',
        content: `Respond in this style: ${options.style}`,
      });
    }

    messages.push({
      role: 'user',
      content: inputDescription,
    });

    const llmParams: LlmParams = {
      model: '{{ $exists(state.model) ? state.model : "anthropic/claude-3-haiku" }}',
      messages,
      temperature: '{{ $exists(state.temperature) ? state.temperature : 0.8 }}',
      maxTokens: '{{ $exists(state.maxTokens) ? state.maxTokens : 1024 }}',
    };

    this.params.blueprint!.nodes.push({
      ref,
      type: 'llm',
      name,
      description: `Respond to: ${inputDescription}`,
      parameters: llmParams,
    });

    this.connectToPrevious(ref);
    this.updateEngine();
    return this;
  }

  /**
   * Respond with a specific style or approach
   */
  respondWith(
    approach: string,
    options?: {
      name?: string;
      context?: string;
    }
  ): Agent {
    return this.respondTo(options?.context || 'the current situation', {
      name: options?.name,
      style: approach,
      includeContext: true,
    });
  }

  // =============================================================================
  // BEHAVIOR* - Behavioral Rules
  // =============================================================================

  /**
   * Always follow a specific behavior
   */
  behaviorAlways(
    behavior: string,
    options?: {
      name?: string;
      priority?: 'low' | 'normal' | 'high';
    }
  ): Agent {
    const priority = options?.priority || 'normal';
    const priorityText = {
      low: 'when possible',
      normal: 'consistently',
      high: 'as a top priority',
    };

    const behaviorDescription = `You should ${priorityText[priority]} ${behavior}`;

    return this.behaviorFollow(behaviorDescription, {
      name: options?.name || 'Set Behavior',
      strict: priority === 'high',
    });
  }

  /**
   * Never do something - set constraints
   */
  behaviorNever(
    restriction: string,
    options?: {
      name?: string;
      strict?: boolean;
    }
  ): Agent {
    const strictness = options?.strict ? 'absolutely must never' : 'should avoid';
    const constraintDescription = `Important constraint: You ${strictness} ${restriction}`;

    return this.behaviorFollow(constraintDescription, {
      name: options?.name || 'Set Constraint',
      strict: options?.strict,
    });
  }

  /**
   * Follow a behavioral guideline
   */
  behaviorFollow(
    guideline: string,
    options?: {
      name?: string;
      strict?: boolean;
    }
  ): Agent {
    const ref = `guideline_${this.nodeCounter++}`;
    const name = options?.name || 'Follow Guideline';

    const strictness = options?.strict ? 'must always' : 'should try to';
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: `Important guideline you ${strictness} follow: ${guideline}`,
      },
      {
        role: 'user',
        content: 'Acknowledge this guideline and confirm your understanding of how to apply it.',
      },
    ];

    const llmParams: LlmParams = {
      model: '{{ $exists(state.model) ? state.model : "anthropic/claude-3-haiku" }}',
      messages,
      temperature: 0.3,
      maxTokens: '{{ $exists(state.maxTokens) ? state.maxTokens : 256 }}',
    };

    this.params.blueprint!.nodes.push({
      ref,
      type: 'llm',
      name,
      description: `Guideline: ${guideline}`,
      parameters: llmParams,
    });

    this.connectToPrevious(ref);
    this.updateEngine();
    return this;
  }

  // =============================================================================
  // BUILD* - Workflow Completion
  // =============================================================================

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
   * Execute the agent
   */
  async execute(): Promise<Execution> {
    await this.engine.execute();
    return this.engine.getExecution();
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

    // Check memory is present and valid
    if (!this.params.memoryState) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Agent memory is required',
      });
    } else if (!this.memory || typeof this.memory.toMessages !== 'function') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Invalid agent memory instance',
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

    // Check that all node types have handlers (delegate to engine)
    const unsupportedNodes = nodes.filter((node) => !this.engine.hasHandler(node.type));
    if (unsupportedNodes.length > 0) {
      errors.push({
        code: 'INVALID_NODE_TYPE',
        message: `Unsupported node types in agent blueprint: ${unsupportedNodes.map((n) => n.type).join(', ')}`,
        details: { unsupportedNodes: unsupportedNodes.map((n) => ({ type: n.type, ref: n.ref })) },
      });
    }

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
