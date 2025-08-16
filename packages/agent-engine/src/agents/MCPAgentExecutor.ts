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
import { DynamicTool } from '@langchain/core/tools';

// Extend global type to support our custom properties
declare global {
  var __mcpToolInputs: Record<string, any> | undefined;
  var __lastAgentAction: any | undefined;
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
   * Override _takeNextStep to intercept and fix tool invocations
   */
  async _takeNextStep(
    nameToolMap: Record<string, DynamicTool>,
    inputs: ChainValues,
    intermediateSteps: any[],
    runManager?: any
  ): Promise<any> {
    // First, let's patch the tool map to ensure proper parameter passing
    const patchedNameToolMap: Record<string, DynamicTool> = {};
    
    for (const [name, tool] of Object.entries(nameToolMap)) {
      // Create a wrapper for each tool that ensures parameters are passed
      const wrappedTool = Object.create(tool);
      
      // Store original methods
      const originalCall = tool.call?.bind(tool);
      const originalInvoke = tool.invoke?.bind(tool);
      
      // Override call method to capture and fix parameters
      if (originalCall) {
        wrappedTool.call = async function(input: any, ...args: any[]) {
          console.log(`[MCPAgentExecutor._takeNextStep] Tool ${name} being called with:`, {
            inputType: typeof input,
            inputValue: JSON.stringify(input),
            hasInput: input !== undefined && input !== null
          });
          
          // Store input for potential recovery
          if (input !== undefined && input !== null) {
            if (!(global as any).__mcpToolInputs) {
              (global as any).__mcpToolInputs = {};
            }
            (global as any).__mcpToolInputs[name] = input;
          }
          
          return originalCall(input, ...args);
        };
      }
      
      // Override invoke method similarly
      if (originalInvoke) {
        wrappedTool.invoke = async function(input: any, ...args: any[]) {
          console.log(`[MCPAgentExecutor._takeNextStep] Tool ${name} being invoked with:`, {
            inputType: typeof input,
            inputValue: JSON.stringify(input),
            hasInput: input !== undefined && input !== null
          });
          
          // Store input for potential recovery
          if (input !== undefined && input !== null) {
            if (!(global as any).__mcpToolInputs) {
              (global as any).__mcpToolInputs = {};
            }
            (global as any).__mcpToolInputs[name] = input;
          }
          
          return originalInvoke(input, ...args);
        };
      }
      
      patchedNameToolMap[name] = wrappedTool;
    }
    
    // Call parent with patched tool map
    const result = await super._takeNextStep(patchedNameToolMap, inputs, intermediateSteps, runManager);
    
    // Additionally capture any actions for debugging
    if (result && Array.isArray(result)) {
      for (const step of result) {
        if (step.action && step.action.tool && step.action.toolInput !== undefined) {
          console.log(`[MCPAgentExecutor] Post-execution: captured action for ${step.action.tool}:`, JSON.stringify(step.action.toolInput));
          (global as any).__lastAgentAction = step.action;
        }
      }
    }
    
    return result;
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
    // Patch each tool to intercept calls and ensure parameters are passed correctly
    const patchedTools = config.tools.map(tool => {
      const originalCall = tool.call?.bind(tool);
      const originalInvoke = tool.invoke?.bind(tool);
      const originalFunc = tool.func?.bind(tool);
      
      // Override the call method
      if (originalCall) {
        tool.call = async function(input: any, ...args: any[]) {
          console.log(`[MCPAgentExecutor] Tool ${tool.name} call() invoked with:`, JSON.stringify(input));
          
          // Store the input for func() to use
          if (input !== undefined && input !== null) {
            if (!(global as any).__mcpToolInputs) {
              (global as any).__mcpToolInputs = {};
            }
            (global as any).__mcpToolInputs[tool.name] = input;
          } else {
            // If input is undefined, try to recover from global state
            const globalStore = (global as any).__mcpToolInputs || {};
            if (globalStore[tool.name]) {
              console.log(`[MCPAgentExecutor] Recovered input for ${tool.name} from global state`);
              input = globalStore[tool.name];
            }
          }
          
          return originalCall(input, ...args);
        };
      }
      
      // Override the invoke method
      if (originalInvoke) {
        tool.invoke = async function(input: any, ...args: any[]) {
          console.log(`[MCPAgentExecutor] Tool ${tool.name} invoke() invoked with:`, JSON.stringify(input));
          
          // Store the input for func() to use
          if (input !== undefined && input !== null) {
            if (!(global as any).__mcpToolInputs) {
              (global as any).__mcpToolInputs = {};
            }
            (global as any).__mcpToolInputs[tool.name] = input;
          } else {
            // If input is undefined, try to recover from global state
            const globalStore = (global as any).__mcpToolInputs || {};
            if (globalStore[tool.name]) {
              console.log(`[MCPAgentExecutor] Recovered input for ${tool.name} from global state`);
              input = globalStore[tool.name];
            }
          }
          
          return originalInvoke(input, ...args);
        };
      }
      
      // Override the func method (used by DynamicTool)
      if (originalFunc) {
        tool.func = async function(input: any, ...args: any[]) {
          console.log(`[MCPAgentExecutor] Tool ${tool.name} func() invoked with:`, JSON.stringify(input));
          
          // If input is undefined, try to recover from global state
          if (input === undefined || input === null) {
            const globalStore = (global as any).__mcpToolInputs || {};
            // Check for exact tool name match first
            if (globalStore[tool.name]) {
              console.log(`[MCPAgentExecutor] Recovered input for ${tool.name} from global state`);
              input = globalStore[tool.name];
              // Don't delete yet - let the actual tool function handle cleanup
            } else {
              // Try to find a key that ends with the tool's base name (for namespaced tools)
              const possibleKeys = Object.keys(globalStore);
              for (const key of possibleKeys) {
                if (key.includes(tool.name) || tool.name.includes(key)) {
                  console.log(`[MCPAgentExecutor] Recovered input for ${tool.name} from global state using key ${key}`);
                  input = globalStore[key];
                  break;
                }
              }
            }
          }
          
          return originalFunc(input, ...args);
        };
      }
      
      return tool;
    });
    
    // Create the executor with patched tools
    const executor = new MCPAgentExecutor({
      agent: config.agent,
      tools: patchedTools,
      verbose: config.verbose,
      maxIterations: config.maxIterations,
      returnIntermediateSteps: config.returnIntermediateSteps,
      handleParsingErrors: config.handleParsingErrors,
      earlyStoppingMethod: config.earlyStoppingMethod,
    } as any);
    
    return executor;
  }
}