/**
 * ToolInputPatcher - Patches LangChain's tool calling to fix parameter passing
 * 
 * This patcher intercepts tool calls at the lowest level to ensure
 * parameters are properly passed to MCP tools.
 */

import { DynamicTool } from '@langchain/core/tools';

// Extend global type to support our custom properties
declare global {
  var __mcpToolInputs: Record<string, any> | undefined;
}

export class ToolInputPatcher {
  private static originalCallMethods = new WeakMap<DynamicTool, Function>();
  
  /**
   * Patch a tool to intercept and fix parameter passing
   */
  static patchTool(tool: DynamicTool): DynamicTool {
    // Store the original _call method
    const originalCall = tool._call.bind(tool);
    this.originalCallMethods.set(tool, originalCall);
    
    // Override the _call method to intercept parameters
    tool._call = async function(input: any, runManager?: any, config?: any) {
      console.log(`[ToolInputPatcher] Intercepting call to ${tool.name}`);
      console.log(`[ToolInputPatcher] Input type: ${typeof input}`);
      console.log(`[ToolInputPatcher] Input value:`, JSON.stringify(input));
      
      // Store the input in global state for the tool wrapper to retrieve
      if (!(global as any).__mcpToolInputs) {
        (global as any).__mcpToolInputs = {};
      }
      (global as any).__mcpToolInputs[tool.name] = input;
      
      // Call the original method
      return originalCall(input, runManager, config);
    };
    
    return tool;
  }
  
  /**
   * Patch all tools in an array
   */
  static patchTools(tools: DynamicTool[]): DynamicTool[] {
    return tools.map(tool => this.patchTool(tool));
  }
  
  /**
   * Restore a tool to its original state
   */
  static unpatchTool(tool: DynamicTool): void {
    const originalCall = this.originalCallMethods.get(tool);
    if (originalCall) {
      tool._call = originalCall as any;
      this.originalCallMethods.delete(tool);
    }
  }
}