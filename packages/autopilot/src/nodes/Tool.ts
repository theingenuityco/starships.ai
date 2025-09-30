/**
 * Tool Class
 *
 * Smart Tool Node - handles both legacy single tool execution and new parallel execution
 * Routes based on input type and node configuration to enable parallel tool calling
 */

import { BaseNode } from './BaseNode';
import type { ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { EngineConfig } from '@/engine/Engine';
import { Blueprint } from '@/types/blueprint';
import { LocalRunner } from '@/runner/LocalRunner';
import type { Runner } from '@/runner/Runner';
import { ToolCallData, ToolExecutionResult } from '@/types/parallel-tools';

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
    let inputData: unknown;
    try {
      const params = this.getParams();
      inputData = ExecutionItemUtils.unwrapSingle(input);

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
            summary: { total: 0, successful: 0, failed: 0, successRate: '0%' },
          });
        }
      } else {
        // Legacy single tool call mode (for backward compatibility)
        return await this.executeLegacyToolExecution(input);
      }
    } catch (toolNodeError) {
      // Hierarchical error recovery with per-call failure mapping
      const errorMessage = toolNodeError instanceof Error ? toolNodeError.message : 'Unknown error';
      const params = this.getParams();
      const calls: ToolCallData[] = Array.isArray(inputData) ? (inputData as ToolCallData[]) : [];
      const failedEntries =
        calls.length > 0
          ? calls.map((call) => ({
              toolCallId: call?.id ?? call?.toolCallId ?? 'unknown_call',
              toolName: call?.name ?? params.name ?? 'unknown_tool',
              success: false,
              error: errorMessage,
            }))
          : [
              {
                toolCallId: 'unknown_call',
                toolName: params.name ?? 'unknown_tool',
                success: false,
                error: errorMessage,
              },
            ];

      const batchId = this.generateBatchId();
      const timestamp = new Date().toISOString();

      return [
        {
          json: {
            batchId,
            timestamp,
            successful: [],
            failed: failedEntries,
            processedIds: failedEntries.map((f) => f.toolCallId).filter(Boolean),
            summary: { total: failedEntries.length, successful: 0, failed: failedEntries.length, successRate: '0%' },
            nodeError: true, // Flag for Agent to handle gracefully
          },
          error: errorMessage,
          pairedItem: input?.[0]?.pairedItem || { item: 0 },
        },
      ];
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

    // Use the tool calls as provided by the LLM - no augmentation
    const allCalls = toolCalls;

    // Proceed even if some tools are missing; per-call failures will be recorded

    // Atomic progress tracker
    const progressTracker = {
      completed: new Set<string>(),
      failed: new Set<string>(),
      getProgress: () => ({
        completed: progressTracker.completed.size,
        failed: progressTracker.failed.size,
        total: allCalls.length,
        remaining: allCalls
          .filter((call: ToolCallData) => !progressTracker.completed.has(call.id) && !progressTracker.failed.has(call.id))
          .map((call: ToolCallData) => call.name),
      }),
    };

    // Emit batch started
    await this.emitEvent('parallel_tools_started', {
      batchId,
      timestamp,
      toolCount: allCalls.length,
      toolNames: allCalls.map((call: ToolCallData) => call.name),
    });

    // Execute all tools in parallel
    const results = await Promise.allSettled(
      allCalls.map(async (toolCall: ToolCallData) => {
        const toolConfig = toolRegistry.get(toolCall.name.toLowerCase());

        // Emit progress started
        await this.emitProgress(batchId, toolCall, 'started', progressTracker.getProgress());

        if (!toolConfig) {
          // Missing tool -> record failed without throwing to keep batch running
          progressTracker.failed.add(toolCall.id);
          const msg = `Tool '${toolCall.name}' not found in registry`;
          await this.emitProgress(batchId, toolCall, 'failed', progressTracker.getProgress(), null, msg);
          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: false,
            error: msg,
          };
        }

        try {
          const result = await this.executeWithToolConfig(toolCall, toolConfig);
          progressTracker.completed.add(toolCall.id);
          await this.emitProgress(batchId, toolCall, 'completed', progressTracker.getProgress(), result);

          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: true,
            data: ExecutionItemUtils.unwrapSingle(result),
          } as ToolExecutionResult;
        } catch (error) {
          progressTracker.failed.add(toolCall.id);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await this.emitProgress(batchId, toolCall, 'failed', progressTracker.getProgress(), null, errorMessage);

          return {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: false,
            error: errorMessage,
          } as ToolExecutionResult;
        }
      })
    );

    // Emit batch completed
    await this.emitEvent('parallel_tools_completed', {
      batchId,
      timestamp,
      summary: progressTracker.getProgress(),
    });

    return this.combineResults(results, batchId, timestamp, allCalls);
  }

  /**
   * Execute single tool call
   * Wrap result into the same batch structure expected by Agent mutations
   * Emit progress events so the server can persist tool_result messages for the UI
   */
  private async executeSingleToolCall(toolCall: ToolCallData): Promise<ExecutionItem[]> {

    const toolRegistry = await this.buildToolRegistry();
    const toolConfig = toolRegistry.get(toolCall.name.toLowerCase());

    const batchId = this.generateBatchId();
    const timestamp = new Date().toISOString();

    // Emit batch started (single-tool)
    await this.emitEvent('parallel_tools_started', {
      batchId,
      timestamp,
      toolCount: 1,
      toolNames: [toolCall.name],
    });

    // Emit started progress
    const getProgress = () => ({
      completed: 0,
      failed: 0,
      total: 1,
      remaining: [toolCall.name],
    });
    await this.emitProgress(batchId, toolCall, 'started', getProgress());

    if (!toolConfig) {
      const msg = `Tool '${toolCall.name}' not found in registry`;

      // Emit failure progress
      await this.emitProgress(batchId, toolCall, 'failed', { ...getProgress(), failed: 1, remaining: [] }, null, msg);

      // Emit batch completed
      await this.emitEvent('parallel_tools_completed', {
        batchId,
        timestamp,
        summary: { completed: 0, failed: 1, total: 1, remaining: [] },
      });

      // Return structured failure (do not throw) so Agent can continue
      return ExecutionItemUtils.wrapSingle({
        batchId,
        timestamp,
        successful: [],
        failed: [
          {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: false,
            error: msg,
          },
        ],
        processedIds: [toolCall.id],
        summary: { total: 1, successful: 0, failed: 1, successRate: '0%' },
      });
    }

    try {
      const raw = await this.executeWithToolConfig(toolCall, toolConfig);
      const data = ExecutionItemUtils.unwrapSingle(raw);

      // Emit completed progress
      await this.emitProgress(
        batchId,
        toolCall,
        'completed',
        { completed: 1, failed: 0, total: 1, remaining: [] },
        ExecutionItemUtils.wrapSingle(data)
      );

      // Emit batch completed
      await this.emitEvent('parallel_tools_completed', {
        batchId,
        timestamp,
        summary: { completed: 1, failed: 0, total: 1, remaining: [] },
      });

      return ExecutionItemUtils.wrapSingle({
        batchId,
        timestamp,
        successful: [
          {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: true,
            data,
          },
        ],
        failed: [],
        processedIds: [toolCall.id],
        summary: { total: 1, successful: 1, failed: 0, successRate: '100%' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';

      // Emit failed progress
      await this.emitProgress(batchId, toolCall, 'failed', { completed: 0, failed: 1, total: 1, remaining: [] }, null, msg);

      // Emit batch completed
      await this.emitEvent('parallel_tools_completed', {
        batchId,
        timestamp,
        summary: { completed: 0, failed: 1, total: 1, remaining: [] },
      });

      return ExecutionItemUtils.wrapSingle({
        batchId,
        timestamp,
        successful: [],
        failed: [
          {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            success: false,
            error: msg,
          },
        ],
        processedIds: [toolCall.id],
        summary: { total: 1, successful: 0, failed: 1, successRate: '0%' },
      });
    }
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
    const toolExecution = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(inputData), parentExec);

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
      successful: [
        {
          toolCallId: 'legacy_call',
          toolName: params.name,
          success: true,
          data: ExecutionItemUtils.unwrapSingle(rawResult),
        },
      ],
      failed: [],
      processedIds: ['legacy_call'],
      summary: { total: 1, successful: 1, failed: 0, successRate: '100%' },
    });

    console.log(`[TOOL-DEBUG] ${params.name} completed successfully`);
    return result;
  }

  /**
   * Execute tool with pre-resolved config
   */
  private async executeWithToolConfig(toolCall: ToolCallData, toolConfig: ToolConfig): Promise<ExecutionItem[]> {
    const parentExec = this.getOptions()?.execution;

    // Add tool arguments to execution
    const executionWithArgs = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(toolCall.arguments), parentExec);

    const runner = await this.getRunner();
    return await runner.run(toolConfig.blueprint, executionWithArgs, this.getEngineConfig());
  }

  /**
   * Build tool registry with pre-resolved blueprints
   */
  private async buildToolRegistry(): Promise<Map<string, ToolConfig>> {
    type ToolStateItem = { name: string; description?: string; blueprint?: Blueprint; parameters?: unknown };
    const state = this.getOptions()?.execution?.state as { tools?: ToolStateItem[] } | undefined;
    const tools: ToolStateItem[] = Array.isArray(state?.tools) ? (state!.tools as ToolStateItem[]) : [];
    const registry = new Map<string, ToolConfig>();

    tools.forEach((tool) => {
      if (tool?.name && tool?.blueprint) {
        registry.set(tool.name.toLowerCase(), {
          name: tool.name,
          description: tool.description,
          blueprint: tool.blueprint,
          parameters: tool.parameters,
        });
      }
    });

    // Debug summary
    try {
      console.log(`[TOOL-DEBUG] Registry built: ${registry.size} tools -> ${JSON.stringify(Array.from(registry.keys()))}`);
    } catch {
      /* ignore logging errors */
    }

    return registry;
  }

  /**
   * Combine parallel execution results
   */
  private combineResults(
    results: PromiseSettledResult<ToolExecutionResult>[],
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
                error: result.reason?.message || 'Unknown error',
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
        successRate: `${((successful.length / results.length) * 100).toFixed(1)}%`,
      },
    });
  }

  /**
   * Get runner with pooling for parallel tools
   * Always use in-process LocalRunner for nested tool blueprints to avoid nested child processes
   */
  private async getRunner(): Promise<Runner> {
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
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get engine configuration
   */
  private getEngineConfig(): EngineConfig {
    return {
      eventCallback: this.getEventCallback(),
      failOnNodeError: false, // Continue with partial failures
      secureEnv: this.getOptions()?.secureEnv,
    };
  }

  /**
   * Emit progress event with batch context
   */
  private async emitProgress(
    batchId: string,
    toolCall: ToolCallData,
    status: 'started' | 'completed' | 'failed',
    progress: { completed: number; failed: number; total: number; remaining: string[] },
    result?: unknown,
    error?: string
  ): Promise<void> {
    const eventCallback = this.getEventCallback();
    if (!eventCallback) return;

    const resultPayload: Record<string, unknown> = {
      batchId,
      status,
      progress,
    };
    if (result !== undefined) {
      if (typeof result === 'object' && result !== null) {
        Object.assign(resultPayload, result as Record<string, unknown>);
      } else {
        resultPayload.value = result;
      }
    }

    const eventType: 'tool_started' | 'tool_complete' = status === 'started' ? 'tool_started' : 'tool_complete';

    await eventCallback({
      type: eventType,
      timestamp: new Date().toISOString(),
      executionDepth: this.getOptions()?.execution?.depth ?? 0,
      data: {
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        arguments: toolCall.arguments,
        ...(status !== 'started' ? { result: resultPayload } : {}),
        ...(error ? { error } : {}),
      },
    });
  }

  /**
   * Emit generic event (map batch lifecycle to tool events)
   */
  private async emitEvent(type: string, data: Record<string, unknown>): Promise<void> {
    const eventCallback = this.getEventCallback();
    if (!eventCallback) return;

    const eventType: 'tool_started' | 'tool_complete' = type.includes('completed') ? 'tool_complete' : 'tool_started';

    await eventCallback({
      type: eventType,
      timestamp: new Date().toISOString(),
      executionDepth: this.getOptions()?.execution?.depth ?? 0,
      data: {
        toolName: `batch_${type}`,
        ...(data ? { result: data } : {}),
      },
    });
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

    // Blueprint validation
    const isUniversalExecutor = params.name === 'universal_tool_executor';
    // For universal executor, the blueprint is built dynamically; allow null/absent blueprint
    if (!isUniversalExecutor) {
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
  parameters?: unknown;
}
