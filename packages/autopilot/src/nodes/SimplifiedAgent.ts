/**
 * SimplifiedAgent Class
 * 
 * Simplified agent implementation optimized for parallel execution.
 * Uses the new ParallelEngine and ParallelToolsNode for automatic multi-tool support.
 */

import { AgentParams, AgentState, ValidationResult, ValidationError, NodeHandlerOptions, ExecutionItem, LlmMessage } from '@/types';
import { NodeHandler } from '@/types/node-handler';
import { BaseBlueprint } from '@/types/base';
import { ParallelEngine } from '@/engine/ParallelEngine';
import { Execution, ExecutionStatus, ExecutionState } from '@/types/execution';

export class SimplifiedAgent implements NodeHandler {
  private params: AgentParams;
  private state: AgentState;
  private engine: ParallelEngine;
  private nodeCounter: number = 1;

  constructor(params: AgentParams, options?: NodeHandlerOptions) {
    this.params = structuredClone(params);
    // Options are handled by node handlers, not needed here
    
    // Initialize state
    this.state = {
      messages: params.state?.messages || [],
      tools: params.state?.tools || [],
    };
    
    // Create parallel engine
    this.engine = new ParallelEngine({
      maxVisits: 10, // Default max visits
      defaultTimeout: params.timeout || 30000,
      debug: false
    });
    
    // Create optimized blueprint if none provided
    if (!this.params.blueprint) {
      this.createParallelBlueprint();
    }
  }

  /**
   * Create simplified blueprint optimized for parallel execution
   * Handles 1-N tools automatically with ParallelToolsNode
   */
  private createParallelBlueprint(): void {
    const startRef = `start_${this.nodeCounter++}`;
    const endRef = `end_${this.nodeCounter++}`;
    const llmRef = `llm_${this.nodeCounter++}`;
    const checkToolsRef = `check_tools_${this.nodeCounter++}`;
    const toolsRef = `tools_${this.nodeCounter++}`;
    const synthesisRef = `synthesis_${this.nodeCounter++}`;
    
    this.params.blueprint = {
      nodes: [
        // Start node
        {
          ref: startRef,
          type: 'start',
          name: 'Start',
          description: 'Entry point',
          parameters: {}
        },
        
        // Main LLM node
        {
          ref: llmRef,
          type: 'llm',
          name: 'AI Assistant',
          description: 'Main LLM with tool support',
          parameters: {
            model: this.params.model,
            messages: '{{ state.messages }}',
            tools: '{{ state.tools }}',
            temperature: this.params.temperature,
            maxTokens: this.params.maxTokens,
            timeout: this.params.timeout,
            mutations: [
              {
                operation: 'add',
                path: '/messages/-',
                value: {
                  role: 'assistant',
                  content: `{{ $lastOutputOf("${llmRef}")[0].json.choices[0].message.content }}`,
                  tool_calls: `{{ $lastOutputOf("${llmRef}")[0].json.choices[0].message.tool_calls }}`
                }
              }
            ]
          }
        },
        
        // Check for tool calls
        {
          ref: checkToolsRef,
          type: 'conditional',
          name: 'Check Tool Calls',
          description: 'Route based on tool calls',
          parameters: {
            // Simple condition that returns edge labels
            condition: `{{ (() => {
              const last = $lastOutputOf("${llmRef}")[0]?.json;
              const finishReason = last?.choices?.[0]?.finish_reason;
              const toolCalls = last?.choices?.[0]?.message?.tool_calls;
              
              if (finishReason === "length") return "continue";
              if (finishReason === "tool_calls" || (Array.isArray(toolCalls) && toolCalls.length > 0)) {
                return "has_tools";
              }
              return "complete";
            })() }}`
          }
        },
        
        // Parallel tools execution - handles ALL tool_calls automatically
        {
          ref: toolsRef,
          type: 'tool', // Use 'tool' type which maps to ParallelToolsNode
          name: 'Execute Tools',
          description: 'Execute 1-N tools in parallel',
          parameters: {
            // ParallelToolsNode automatically extracts and executes all tool_calls
            mutations: [
              // Add all tool results to messages
              {
                operation: 'add',
                path: '/messages',
                value: `{{ (() => {
                  const results = $lastOutputOf("${toolsRef}");
                  return results || [];
                })() }}`
              }
            ]
          }
        },
        
        // Synthesis LLM - processes tool results
        {
          ref: synthesisRef,
          type: 'llm',
          name: 'Synthesis',
          description: 'Synthesize tool results',
          parameters: {
            model: this.params.model,
            messages: '{{ state.messages }}',
            temperature: this.params.temperature,
            maxTokens: this.params.maxTokens,
            mutations: [
              {
                operation: 'add',
                path: '/messages/-',
                value: {
                  role: 'assistant',
                  content: `{{ $lastOutputOf("${synthesisRef}")[0].json.choices[0].message.content }}`
                }
              }
            ]
          }
        },
        
        // End node
        {
          ref: endRef,
          type: 'end',
          name: 'End',
          description: 'Completion',
          parameters: {
            aggregate: false
          }
        }
      ],
      
      edges: [
        // Start -> LLM
        { ref: 'e1', from: startRef, to: llmRef },
        
        // LLM -> Check
        { ref: 'e2', from: llmRef, to: checkToolsRef },
        
        // Check -> Tools (if has tool calls)
        { ref: 'e3', from: checkToolsRef, to: toolsRef, condition: 'has_tools' },
        
        // Tools -> Synthesis
        { ref: 'e4', from: toolsRef, to: synthesisRef },
        
        // Synthesis -> Check (for potential follow-up tools)
        { ref: 'e5', from: synthesisRef, to: checkToolsRef },
        
        // Check -> LLM (if needs continuation due to length)
        { ref: 'e6', from: checkToolsRef, to: llmRef, condition: 'continue' },
        
        // Check -> End (if complete)
        { ref: 'e7', from: checkToolsRef, to: endRef, condition: 'complete' }
      ],
      
      metadata: {
        generatedBy: 'SimplifiedAgent',
        createdAt: new Date().toISOString(),
        optimizedFor: 'parallel_execution'
      }
    };
  }

  /**
   * Execute the agent using ParallelEngine
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Ensure blueprint exists (created in constructor if not provided)
    const blueprint = this.params.blueprint;
    if (!blueprint) {
      throw new Error('No blueprint defined');
    }
    
    // Add user message to state if input provided
    if (input && input.length > 0) {
      const userMessage = this.extractUserMessage(input);
      if (userMessage) {
        if (!this.state.messages) {
          this.state.messages = [];
        }
        this.state.messages.push(userMessage);
      }
    }
    
    // Create execution context with proper ExecutionState type
    const executionState: ExecutionState = {
      ...this.state,
      messages: this.state.messages || [],
      tools: this.state.tools || []
    };
    
    const execution: Execution = {
      status: 'not_started' as ExecutionStatus,
      state: executionState,
      results: input ? [{ nodeRef: 'input', items: input }] : []
    };
    
    try {
      // Execute with parallel engine (blueprint is BaseBlueprint compatible)
      const results = await this.engine.execute(blueprint as BaseBlueprint, execution);
      
      // Extract final response
      return this.extractFinalResponse(results);
    } catch (error) {
      // Return error as execution item
      const errorMessage = error instanceof Error ? error.message : 'Agent execution failed';
      return [{
        json: {
          ok: false,
          error: errorMessage
        },
        error: errorMessage
      }];
    } finally {
      // Reset engine for next execution
      this.engine.reset();
    }
  }

  /**
   * Extract user message from input
   */
  private extractUserMessage(input: ExecutionItem[]): LlmMessage | null {
    const firstItem = input[0]?.json;
    
    // Check if it's already a message format
    if (firstItem && typeof firstItem === 'object') {
      const data = firstItem as Record<string, unknown>;
      if (data.role && data.content) {
        return data as unknown as LlmMessage;
      }
      
      // Extract content and create message
      if (data.message || data.text || data.query) {
        return {
          role: 'user',
          content: String(data.message || data.text || data.query)
        };
      }
    }
    
    // Treat as plain text
    if (typeof firstItem === 'string') {
      return {
        role: 'user',
        content: firstItem
      };
    }
    
    return null;
  }

  /**
   * Extract final response from execution results
   */
  private extractFinalResponse(results: ExecutionItem[]): ExecutionItem[] {
    if (!results || results.length === 0) {
      return [{
        json: {
          role: 'assistant',
          content: 'No response generated'
        }
      }];
    }
    
    // Look for assistant messages in results
    const assistantResponses = results.filter(item => {
      const data = item.json as Record<string, unknown>;
      return data?.role === 'assistant' && data?.content;
    });
    
    if (assistantResponses.length > 0) {
      return assistantResponses;
    }
    
    // Return raw results if no assistant messages found
    return results;
  }

  /**
   * Validate agent configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!this.params.model) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Model is required'
      });
    }
    
    if (!this.params.blueprint && !this.state) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'State is required when no blueprint provided'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get current blueprint
   */
  getBlueprint(): any {
    return this.params.blueprint;
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Update state
   */
  setState(state: Partial<AgentState>): void {
    this.state = {
      ...this.state,
      ...state
    };
  }

  /**
   * Add message to conversation
   */
  addMessage(message: LlmMessage): void {
    if (!this.state.messages) {
      this.state.messages = [];
    }
    this.state.messages.push(message);
  }

  /**
   * Add tool to available tools  
   */
  addTool(tool: Record<string, unknown>): void {
    if (!this.state.tools) {
      this.state.tools = [];
    }
    this.state.tools.push(tool as any); // Tool params can vary
  }

  /**
   * Clear conversation history
   */
  clearMessages(): void {
    this.state.messages = [];
  }

  /**
   * Get node count (for debugging)
   */
  getNodeCount(): number {
    return this.params.blueprint?.nodes.length || 0;
  }

  /**
   * Get edge count (for debugging)
   */
  getEdgeCount(): number {
    return this.params.blueprint?.edges.length || 0;
  }
}