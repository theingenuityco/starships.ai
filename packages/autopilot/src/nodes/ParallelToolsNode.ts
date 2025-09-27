/**
 * ParallelToolsNode - Executes 1 to N tools in parallel
 * Automatically detects and executes all tool_calls from LLM output
 */

import { BaseNode } from './BaseNode';
import { ExecutionItem, ValidationResult } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
    arguments_json?: any;
  };
}

interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: any;
  timeout?: number;
  blueprint?: any;
}

interface ParallelToolsParams {
  llmNodeRef?: string;  // Reference to the LLM node to get tool_calls from
  timeout?: number;
  mutations?: any[];
}

export class ParallelToolsNode extends BaseNode<ParallelToolsParams> {
  constructor(params: ParallelToolsParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // Check if we have an llmNodeRef parameter to fetch LLM output from
    const params = this.getParams();
    let actualInput = input;
    
    if (params.llmNodeRef) {
      // Fetch the LLM output directly from execution results
      const execution = this.getOptions()?.execution;
      if (execution && execution.results) {
        // Find the LLM node's output
        for (let i = execution.results.length - 1; i >= 0; i--) {
          if (execution.results[i].nodeRef === params.llmNodeRef) {
            actualInput = execution.results[i].items;
            console.log('[ParallelToolsNode] Using LLM output from node:', params.llmNodeRef);
            break;
          }
        }
      }
    }
    
    // Get tool calls from LLM output
    const toolCalls = this.extractToolCalls(actualInput);
    
    if (toolCalls.length === 0) {
      console.log('[ParallelToolsNode] No tool calls to execute');
      return [{ 
        json: { 
          message: 'No tools to execute',
          type: 'no_tools'
        },
        pairedItem: { item: 0 }
      }];
    }

    console.log(`[ParallelToolsNode] Starting parallel execution of ${toolCalls.length} tools:`, 
      toolCalls.map(t => t.function.name).join(', '));
    console.log('[ParallelToolsNode] Tool calls details:', JSON.stringify(toolCalls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      args: tc.function.arguments_json || tc.function.arguments
    })), null, 2));
    
    // Log parallel execution
    const eventCallback = this.getOptions()?.eventCallback;
    if (eventCallback) {
      await eventCallback({
        type: 'tools:start' as any,
        timestamp: new Date().toISOString(),
        executionDepth: this.getOptions()?.execution?.depth ?? 0,
        data: { 
          toolsExecuting: toolCalls.length,
          toolNames: toolCalls.map(t => t.function.name).join(', ')
        } as any
      });
    }

    const startTime = Date.now();
    
    // Execute all tool calls in parallel
    const toolPromises = toolCalls.map(async (toolCall, index) => {
      const toolStart = Date.now();
      try {
        console.log(`[ParallelToolsNode] Tool ${toolCall.function.name} started at index ${index}`);
        
        // Parse arguments if needed
        const args = this.parseToolArguments(toolCall);
        
        // Execute tool
        const result = await this.executeToolWithTimeout(
          toolCall.function.name,
          args,
          this.getParams().timeout || 30000
        );
        
        const toolEnd = Date.now();
        console.log(`[ParallelToolsNode] Tool ${toolCall.function.name} completed in ${toolEnd - toolStart}ms`);
        console.log(`[ParallelToolsNode] Tool ${toolCall.function.name} result:`, 
          typeof result === 'string' ? result.substring(0, 200) + '...' : JSON.stringify(result).substring(0, 200) + '...');
        
        // Format tool result message
        const toolMessage = {
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: typeof result === 'string' ? result : JSON.stringify(result),
          index // Preserve order for response assembly
        };
        console.log(`[ParallelToolsNode] Formatted tool message for ${toolCall.function.name}:`, {
          role: toolMessage.role,
          tool_call_id: toolMessage.tool_call_id,
          name: toolMessage.name,
          contentLength: toolMessage.content.length,
          index: toolMessage.index
        });
        return toolMessage;
      } catch (error: any) {
        const toolEnd = Date.now();
        console.log(`[ParallelToolsNode] Tool ${toolCall.function.name} failed in ${toolEnd - toolStart}ms:`, error.message);
        
        // Return error as tool message
        return {
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify({ 
            ok: false, 
            error: error.message || 'Tool execution failed'
          }),
          index
        };
      }
    });
    
    // Wait for all tools to complete
    const results = await Promise.allSettled(toolPromises);
    
    const endTime = Date.now();
    console.log(`[ParallelToolsNode] All tools completed in ${endTime - startTime}ms`);
    
    // Extract successful results and maintain order
    const toolMessages = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<any>).value)
      .sort((a, b) => a.index - b.index)
      .map(({ index, ...msg }) => msg); // Remove index field
    
    // Log completion
    if (eventCallback) {
      await eventCallback({
        type: 'tools:complete' as any,
        timestamp: new Date().toISOString(),
        executionDepth: this.getOptions()?.execution?.depth ?? 0,
        data: { 
          toolsCompleted: toolMessages.length,
          successfulTools: toolMessages.filter(m => !m.content.includes('"ok":false')).length
        } as any
      });
    }
    
    console.log(`[ParallelToolsNode] Returning ${toolMessages.length} tool results`);
    console.log('[ParallelToolsNode] Tool messages to return:', JSON.stringify(toolMessages.map(m => ({
      role: m.role,
      tool_call_id: m.tool_call_id,
      name: m.name,
      contentLength: m.content?.length || 0
    })), null, 2));
    
    // Return as execution items
    const executionItems = toolMessages.map((msg, index) => ({
      json: msg,
      pairedItem: { item: index }
    }));
    
    console.log('[ParallelToolsNode] Final execution items count:', executionItems.length);
    console.log('[ParallelToolsNode] First execution item structure:', executionItems[0] ? {
      hasJson: !!executionItems[0].json,
      jsonKeys: executionItems[0].json ? Object.keys(executionItems[0].json) : [],
      pairedItem: executionItems[0].pairedItem
    } : 'No items');
    
    return executionItems;
  }

  /**
   * Extract tool calls from LLM output
   */
  private extractToolCalls(input?: ExecutionItem[]): ToolCall[] {
    if (!input || input.length === 0) {
      return [];
    }

    // Try to find tool_calls in the input
    for (const item of input) {
      if (item.json && typeof item.json === 'object') {
        const data = item.json as any;
        
        // Check for OpenAI-style response
        if (data.choices && Array.isArray(data.choices)) {
          const choice = data.choices[0];
          if (choice?.message?.tool_calls) {
            return choice.message.tool_calls;
          }
        }
        
        // Check for direct tool_calls array
        if (data.tool_calls && Array.isArray(data.tool_calls)) {
          return data.tool_calls;
        }
        
        // Check for message with tool_calls
        if (data.message?.tool_calls) {
          return data.message.tool_calls;
        }
      }
    }
    
    return [];
  }

  /**
   * Parse tool arguments
   */
  private parseToolArguments(toolCall: ToolCall): any {
    // If arguments_json is already parsed, use it
    if (toolCall.function.arguments_json) {
      return toolCall.function.arguments_json;
    }
    
    // Try to parse arguments string
    if (typeof toolCall.function.arguments === 'string') {
      try {
        return JSON.parse(toolCall.function.arguments);
      } catch {
        // Return as-is if not valid JSON
        return toolCall.function.arguments;
      }
    }
    
    return toolCall.function.arguments || {};
  }

  /**
   * Execute a tool with timeout
   * Looks up tool from state and executes it
   */
  private async executeToolWithTimeout(
    toolName: string,
    args: any,
    timeout: number
  ): Promise<any> {
    // Look up tool from state
    const tool = this.resolveToolFromState(toolName);
    
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found in state`);
    }
    
    // Check if tool has blueprint for execution
    if (!tool.blueprint || !tool.blueprint.nodes || tool.blueprint.nodes.length === 0) {
      throw new Error(`Tool '${toolName}' has no executable blueprint`);
    }
    
    // Import necessary dependencies for actual tool execution
    const { ExecutionItemUtils } = await import('@/utils/ExecutionItemUtils');
    const { LocalRunner } = await import('@/runner/LocalRunner');
    const { ChildProcessRunner } = await import('@/runner/ChildProcessRunner');
    
    try {
      // Create execution for tool
      const parentExecution = this.getOptions()?.execution;
      const toolExecution = ExecutionItemUtils.createExecution(
        ExecutionItemUtils.wrapSingle(args), 
        parentExecution
      );
      
      // Prepare engine config
      const engineConfig = {
        eventCallback: this.getOptions()?.eventCallback,
        failOnNodeError: true,
        secureEnv: this.getOptions()?.secureEnv,
      };
      
      // Use appropriate runner based on depth
      const depth = toolExecution.depth ?? 0;
      const runner = depth === 0 ? new ChildProcessRunner() : new LocalRunner();
      
      // Execute tool blueprint with timeout
      const executePromise = runner.run(tool.blueprint, toolExecution, engineConfig);
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Tool ${toolName} timed out after ${timeout}ms`)), timeout);
      });
      
      // Race between execution and timeout
      const items = await Promise.race([executePromise, timeoutPromise]) as any[];
      const result = ExecutionItemUtils.unwrapSingle(items);
      
      return result;
    } catch (error: any) {
      throw new Error(`Tool ${toolName} failed: ${error.message}`);
    }
  }

  /**
   * Resolve tool from state
   * Gets tool definition from execution state
   */
  private resolveToolFromState(toolName: string): ToolDefinition | undefined {
    const state = this.getOptions()?.execution?.state;
    const tools = state?.tools as ToolDefinition[];
    if (!tools || !Array.isArray(tools)) {
      return undefined;
    }
    
    // Normalize tool name (handle namespaced tools)
    const normalizedName = toolName.split('.').pop()!;
    
    return tools.find(t => 
      t.name.toLowerCase() === normalizedName.toLowerCase()
    );
  }

  /**
   * Validate that we have access to tools
   */
  validate(): ValidationResult {
    const state = this.getOptions()?.execution?.state;
    const tools = state?.tools;
    
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return {
        valid: false,
        errors: [{
          code: 'MISSING_REQUIRED_FIELD',
          message: 'No tools available in state'
        }]
      };
    }
    
    return {
      valid: true
    };
  }
}