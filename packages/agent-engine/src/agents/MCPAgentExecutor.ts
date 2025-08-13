/**
 * MCPAgentExecutor - Custom agent executor that fixes tool parameter passing
 * 
 * This custom executor intercepts the agent's tool calls and ensures
 * parameters are properly passed to MCP tools.
 */

import { AgentExecutor } from 'langchain/agents';
import { BaseMessage } from '@langchain/core/messages';
import { AgentAction, AgentFinish } from '@langchain/core/agents';
import { ChainValues } from '@langchain/core/utils/types';
import { toolInterceptor } from '../tools/AgentToolInterceptor';

// Extend global type to support our custom properties
declare global {
  var __mcpToolInputs: Record<string, any> | undefined;
}

export class MCPAgentExecutor extends AgentExecutor {
  /**
   * Override the main execution method to intercept tool calls
   */
  async _call(
    inputs: ChainValues,
    runManager?: any
  ): Promise<ChainValues> {
    console.log('[MCPAgentExecutor] Starting execution with inputs:', {
      hasInput: !!inputs.input,
      inputKeys: Object.keys(inputs)
    });
    
    // Simply call parent - the tools are already patched
    return super._call(inputs, runManager);
  }
  
  /**
   * Create an MCPAgentExecutor from a standard configuration
   */
  static fromAgentAndTools(config: {
    agent: any;
    tools: any[];
    verbose?: boolean;
    maxIterations?: number;
    returnIntermediateSteps?: boolean;
    handleParsingErrors?: boolean | string | ((e: any) => string);
    earlyStoppingMethod?: 'generate' | 'force';
  }): MCPAgentExecutor {
    // Don't double-wrap tools - they're already wrapped by MCPToolWrapper
    // Just use them as-is
    
    // Create the executor with properly typed configuration
    const executor = new MCPAgentExecutor({
      agent: config.agent,
      tools: config.tools,
      verbose: config.verbose,
      maxIterations: config.maxIterations,
      returnIntermediateSteps: config.returnIntermediateSteps,
      handleParsingErrors: config.handleParsingErrors,
      earlyStoppingMethod: config.earlyStoppingMethod,
    } as any);
    
    return executor;
  }
}