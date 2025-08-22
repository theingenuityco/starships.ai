/**
 * AgentToolInterceptor - Intercepts and fixes tool parameter passing issues
 * 
 * This interceptor addresses the issue where LangChain's AgentExecutor
 * doesn't properly pass tool parameters to DynamicTool functions.
 */

import { DynamicTool } from '@langchain/core/tools';

// Extend global type to support our custom properties
declare global {
  var __mcpToolInputs: Record<string, any> | undefined;
}

/**
 * Wraps DynamicTool instances to intercept and fix parameter passing
 */
export class AgentToolInterceptor {
  private static instance: AgentToolInterceptor;
  private toolInputCache: Map<string, any> = new Map();
  
  private constructor() {}
  
  static getInstance(): AgentToolInterceptor {
    if (!AgentToolInterceptor.instance) {
      AgentToolInterceptor.instance = new AgentToolInterceptor();
    }
    return AgentToolInterceptor.instance;
  }
  
  /**
   * Store tool input for later retrieval
   */
  storeToolInput(toolName: string, input: any): void {
    console.log(`[AgentToolInterceptor] Storing input for ${toolName}:`, input);
    this.toolInputCache.set(toolName, input);
    
    // Also store in global for backup
    if (!(global as any).__mcpToolInputs) {
      (global as any).__mcpToolInputs = {};
    }
    (global as any).__mcpToolInputs[toolName] = input;
  }
  
  /**
   * Retrieve and clear stored tool input
   */
  getToolInput(toolName: string): any {
    const input = this.toolInputCache.get(toolName);
    if (input) {
      console.log(`[AgentToolInterceptor] Retrieved input for ${toolName}:`, input);
      this.toolInputCache.delete(toolName);
    }
    return input;
  }
  
  /**
   * Wrap a DynamicTool to intercept its execution
   */
  wrapTool(tool: DynamicTool): DynamicTool {
    const originalFunc = tool.func.bind(tool);
    const getToolInput = this.getToolInput.bind(this);
    const toolName = tool.name;
    
    // Create a new function that tries to recover missing parameters
    const wrappedFunc = async function(this: any, ...args: any[]) {
      let input = args[0];
      const runManager = args[1];
      
      console.log(`[AgentToolInterceptor] ${toolName} called with:`, {
        argsLength: args.length,
        arg0Type: typeof args[0],
        arg0Keys: args[0] ? Object.keys(args[0]) : null,
        hasRunManager: !!runManager
      });
      
      // Check if we have cached input for this tool
      const cachedInput = getToolInput(toolName);
      if (cachedInput && (!input || Object.keys(input).length === 0)) {
        console.log(`[AgentToolInterceptor] Using cached input for ${toolName}`);
        input = cachedInput;
      }
      
      // Call the original function with potentially fixed input
      return originalFunc(input, runManager);
    };
    
    // Create a new DynamicTool with the wrapped function
    const wrappedTool = new DynamicTool({
      name: tool.name,
      description: tool.description,
      func: wrappedFunc
    });
    
    // Copy any additional properties
    if ((tool as any).__mcpTool) {
      (wrappedTool as any).__mcpTool = (tool as any).__mcpTool;
    }
    
    return wrappedTool;
  }
  
  /**
   * Wrap all tools in an array
   */
  wrapTools(tools: DynamicTool[]): DynamicTool[] {
    return tools.map(tool => this.wrapTool(tool));
  }
  
  /**
   * Clear all cached inputs
   */
  clearCache(): void {
    this.toolInputCache.clear();
    if ((global as any).__mcpToolInputs) {
      delete (global as any).__mcpToolInputs;
    }
  }
}

// Export singleton instance
export const toolInterceptor = AgentToolInterceptor.getInstance();