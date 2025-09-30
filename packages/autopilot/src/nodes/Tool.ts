/**
 * Tool Class
 *
 * Smart Tool Node - handles both legacy single tool execution and new parallel execution
 * Routes based on input type and node configuration to enable parallel tool calling
 */

import { BaseNode } from './BaseNode';
import type { ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError, ExecutionItem, Execution } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { EngineConfig } from '@/engine/Engine';
import { Blueprint } from '@/types/blueprint';
import { LocalRunner } from '@/runner/LocalRunner';
import { ChildProcessRunner } from '@/runner/ChildProcessRunner';
import type { Runner } from '@/runner/Runner';
import { ToolCallData, ToolExecutionResult, BatchExecutionResult } from '@/types/parallel-tools';

export class Tool extends BaseNode<ToolParams> {
  // Resource Management
  private static localRunnerPool: LocalRunner[] = [];
  private static poolSize = 3;
  
  constructor(params: ToolParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Smart execute method - routes based on input type and node configuration
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    try {
      const params = this.getParams();
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      
      console.log(`[TOOL-DEBUG] ${params.name} execution started`);
      
      // Check if this is the universal tool executor for parallel execution
      const isUniversalExecutor = params.name === 'universal_tool_executor';
      
      // Smart routing based on input and configuration
      if (isUniversalExecutor && Array.isArray(inputData)) {
        // Universal executor mode - handle array of tool calls
        if (inputData.length > 1) {
          return await this.executeMultipleTools(inputData);
        } else if (inputData.length === 1) {
          return await this.executeSingleToolCall(inputData[0]);
        } else {
          // Empty array - no tools to execute, return empty result
          return ExecutionItemUtils.wrapSingle({
            batchId: this.generateBatchId(),
            timestamp: new Date().toISOString(),
            successful: [],
            failed: [],
            processedIds: [],
            summary: { total: 0, successful: 0, failed: 0, successRate: '0%' }
          });
        }
      } else {
        // Legacy single tool call mode (for backward compatibility)
        return await this.executeLegacyToolExecution(input);
      }
    } catch (toolNodeError) {
      // Hierarchical error recovery
      const errorMessage = toolNodeError instanceof Error ? toolNodeError.message : 'Unknown error';
      return [{
        json: {
          batchId: this.generateBatchId(),
          successful: [],
          failed: [{
            error: 'Tool node execution failed',
            details: errorMessage,
            recovery: 'Continue conversation without tool results'
          }],
          summary: { total: 0, successful: 0, failed: 1 },
          nodeError: true // Flag for Agent to handle gracefully
        },
        error: errorMessage,
        pairedItem: input?.[0]?.pairedItem || { item: 0 }
      }];
    }
  }

  /**
   * Execute multiple tools in parallel with atomic progress tracking
   */
  private async executeMultipleTools(toolCalls: ToolCallData[]): Promise<ExecutionItem[]> {
    const batchId = this.generateBatchId();
    const timestamp = new Date().toISOString();
    
    // Pre-resolve ALL tools upfront (once)
    const toolRegistry = await this.buildToolRegistry();
    
    // Validate all tools exist before starting
    for (const call of toolCalls) {
      if (!toolRegistry.has(call.name.toLowerCase())) {
        throw new Error(`Tool '${call.name}' not found in registry`);
      }
    }
    
    // Atomic progress tracker
    const progressTracker = {
      completed: new Set<string>(),
      failed: new Set<string>(),
      getProgress: () => ({
        completed: progressTracker.completed.size,
        failed: progressTracker.failed.size,
        total: toolCalls.length,
        remaining: toolCalls.filter(call => 
          !progressTracker.completed.has(call.id) && 
          !progressTracker.failed.has(call.id)
        ).map(call => call.name)
      })
    };
    
    // Emit batch started
    await this.emitEvent('parallel_tools_started', {
      batchId,
      timestamp,
      toolCount: toolCalls.length,
      toolNames: toolCalls.map(call => call.name)
    });
    
    // Execute all tools in parallel
    const results = await Promise.allSettled(
      toolCalls.map(async (toolCall) => {
        const toolConfig = toolRegistry.get(toolCall.name.toLowerCase())!;
        
        // Emit progress started
        await this.emitProgress(batchId, toolCall, 'started', progressTracker.getProgress());
        
        try {
          const result = await this.executeWithToolConfig(toolCall, toolConfig);
          progressTracker.completed.add(toolCall.id);
          await this.emitProgress(batchId, toolCall, 'completed', progressTracker.getProgress(), result);
          
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: true,
            data: ExecutionItemUtils.unwrapSingle(result)
          };
        } catch (error) {
          progressTracker.failed.add(toolCall.id);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await this.emitProgress(batchId, toolCall, 'failed', progressTracker.getProgress(), null, errorMessage);
          
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: false,
            error: errorMessage
          };
        }
      })
    );
    
    // Emit batch completed
    await this.emitEvent('parallel_tools_completed', {
      batchId,
      timestamp,
      summary: progressTracker.getProgress()
    });
    
    return this.combineResults(results, batchId, timestamp, toolCalls);
  }
  
  /**
   * Execute single tool call
   */
  private async executeSingleToolCall(toolCall: ToolCallData): Promise<ExecutionItem[]> {
    const toolRegistry = await this.buildToolRegistry();
    const toolConfig = toolRegistry.get(toolCall.name.toLowerCase());
    
    if (!toolConfig) {
      throw new Error(`Tool '${toolCall.name}' not found`);
    }
    
    return await this.executeWithToolConfig(toolCall, toolConfig);
  }
  
  /**
   * Execute legacy single tool (backward compatibility)
   */
  private async executeLegacyToolExecution(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    // This handles the existing single tool execution pattern
    // where Tool node has its own blueprint parameter
    const params = this.getParams();
    
    if (!params.blueprint) {
      throw new Error(`Tool '${params.name}' missing blueprint parameter`);
    }
    
    const inputData = ExecutionItemUtils.unwrapSingle(input);
    const parentExec = this.getOptions()?.execution;
    const toolExecution = ExecutionItemUtils.createExecution(
      ExecutionItemUtils.wrapSingle(inputData),
      parentExec
    );
    
    const runner = await this.getRunner();
    const engineConfig = this.getEngineConfig();
    
    // Execute the tool blueprint
    const rawResult = await runner.run(params.blueprint, toolExecution, engineConfig);
    
    // Transform to structured format expected by Agent mutations
    const batchId = this.generateBatchId();
    const timestamp = new Date().toISOString();
    
    // Wrap legacy result in the new structured format
    const result = ExecutionItemUtils.wrapSingle({
      batchId,
      timestamp,
      successful: [{
        toolCallId: 'legacy_call',
        toolName: params.name,
        success: true,
        data: ExecutionItemUtils.unwrapSingle(rawResult)
      }],
      failed: [],
      processedIds: ['legacy_call'],
      summary: { total: 1, successful: 1, failed: 0, successRate: '100%' }
    });
    
    console.log(`[TOOL-DEBUG] ${params.name} completed successfully`);
    return result;
  }
  
  /**
   * Execute tool with pre-resolved config
   */
  private async executeWithToolConfig(
    toolCall: ToolCallData, 
    toolConfig: ToolConfig
  ): Promise<ExecutionItem[]> {
    const parentExec = this.getOptions()?.execution;
    
    // Add tool arguments to execution
    const executionWithArgs = ExecutionItemUtils.createExecution(
      ExecutionItemUtils.wrapSingle(toolCall.arguments),
      parentExec
    );
    
    const runner = await this.getRunner();
    return await runner.run(toolConfig.blueprint, executionWithArgs, this.getEngineConfig());
  }
  
  /**
   * Build tool registry with pre-resolved blueprints
   */
  private async buildToolRegistry(): Promise<Map<string, ToolConfig>> {
    const state = this.getOptions()?.execution?.state as any;
    const tools = Array.isArray(state?.tools) ? state.tools : [];
    const registry = new Map<string, ToolConfig>();
    
    tools.forEach((tool: any) => {
      if (tool?.name && tool?.blueprint) {
        registry.set(tool.name.toLowerCase(), {
          name: tool.name,
          description: tool.description,
          blueprint: tool.blueprint,
          parameters: tool.parameters
        });
      }
    });
    
    return registry;
  }
  
  /**
   * Combine parallel execution results
   */
  private combineResults(
    results: PromiseSettledResult<any>[], 
    batchId: string,
    timestamp: string,
    toolCalls: ToolCallData[]
  ): ExecutionItem[] {
    const successful: ToolExecutionResult[] = [];
    const failed: ToolExecutionResult[] = [];
    const processedIds: string[] = [];
    
    results.forEach((result, index) => {
      processedIds.push(toolCalls[index].id);
      
      if (result.status === 'fulfilled' && result.value.success) {
        successful.push(result.value);
      } else {
        failed.push(
          result.status === 'fulfilled' 
            ? result.value 
            : {
                toolCallId: toolCalls[index].id,
                toolName: toolCalls[index].name,
                success: false,
                error: result.reason?.message || 'Unknown error'
              }
        );
      }
    });
    
    return ExecutionItemUtils.wrapSingle({
      batchId,
      timestamp,
      successful,
      failed,
      processedIds,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        successRate: `${(successful.length / results.length * 100).toFixed(1)}%`
      }
    });
  }
  
  /**
   * Get runner with pooling for parallel tools
   */
  private async getRunner(): Promise<Runner> {
    const depth = this.getOptions()?.execution?.depth ?? 0;
    
    if (depth === 0) {
      return new ChildProcessRunner(); // Top-level only
    }
    
    // For nested (parallel tools), use pooled LocalRunners
    if (Tool.localRunnerPool.length === 0) {
      for (let i = 0; i < Tool.poolSize; i++) {
        Tool.localRunnerPool.push(new LocalRunner());
      }
    }
    
    return Tool.localRunnerPool[Math.floor(Math.random() * Tool.localRunnerPool.length)];
  }
  
  /**
   * Generate unique batch ID
   */
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get engine configuration
   */
  private getEngineConfig(): EngineConfig {
    return {
      eventCallback: this.getEventCallback(),
      failOnNodeError: false, // Continue with partial failures
      secureEnv: this.getOptions()?.secureEnv
    };
  }
  
  /**
   * Emit progress event with batch context
   */
  private async emitProgress(
    batchId: string,
    toolCall: ToolCallData,
    status: 'started' | 'completed' | 'failed',
    progress: any,
    result?: any,
    error?: string
  ): Promise<void> {
    const eventCallback = this.getEventCallback();
    if (!eventCallback) return;
    
    await eventCallback({
      type: 'tool_started',
      timestamp: new Date().toISOString(),
      executionDepth: this.getOptions()?.execution?.depth ?? 0,
      data: {
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        arguments: toolCall.arguments
      }
    });
  }
  
  /**
   * Emit generic event (using tool_started for batch events)
   */
  private async emitEvent(type: string, data: any): Promise<void> {
    const eventCallback = this.getEventCallback();
    if (!eventCallback) return;
    
    // Use existing event types - map custom events to tool events
    await eventCallback({
      type: 'tool_started',
      timestamp: new Date().toISOString(),
      executionDepth: this.getOptions()?.execution?.depth ?? 0,
      data: {
        toolName: `batch_${type}`,
        ...data
      }
    });
  }
  
  /**
   * Extract tool arguments from upstream input (legacy compatibility)
   */
  private extractToolArguments(inputData: unknown): Record<string, unknown> {
    // Allow no-argument calls by returning an empty object
    if (inputData == null) {
      return {};
    }
    if (typeof inputData === 'string') {
      if (inputData.trim().length === 0) {
        return {};
      }
      throw new Error('Tool arguments must be provided as a plain object input.');
    }
    if (typeof inputData === 'object' && !Array.isArray(inputData)) {
      return inputData as Record<string, unknown>;
    }
    throw new Error('Tool arguments must be provided as a plain object input.');
  }

  /**
   * Validate tool configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    // Required fields validation
    const nameError = this.validateRequiredField(params.name, 'Tool name');
    if (nameError) errors.push(nameError);

    const descriptionError = this.validateRequiredField(params.description, 'Tool description');
    if (descriptionError) errors.push(descriptionError);

    // Parameters validation
    if (!params.parameters || typeof params.parameters !== 'object') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Tool parameters must be defined as an object',
      });
    } else {
      if (params.parameters.type !== 'object') {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'Tool parameters type must be "object"',
        });
      }

      if (!params.parameters.properties || typeof params.parameters.properties !== 'object') {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'Tool parameters must define properties',
        });
      }
    }

    // Blueprint is required for all Tool nodes
    if (!params.blueprint) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Tool blueprint is required',
      });
    } else {
      const nodes = params.blueprint.nodes || [];
      const hasStartNode = Array.isArray(nodes) && nodes.some((n) => n.type === 'start');
      if (!hasStartNode) {
        errors.push({
          code: 'MISSING_START_NODE',
          message: 'Tool blueprint must have a start node',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

// Type definitions
interface ToolConfig {
  name: string;
  description?: string;
  blueprint: Blueprint;
  parameters?: any;
}
