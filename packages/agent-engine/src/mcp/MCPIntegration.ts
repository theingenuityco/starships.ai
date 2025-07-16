import { MCPService } from '@starships/server/src/services/MCPService';
import { MCPTool, MCPToolCall, MCPToolResult } from '@starships/models';

export interface MCPContext {
  availableTools: MCPTool[];
  toolsDescription: string;
}

/**
 * MCP Integration for Agent Engine
 * Handles tool injection, execution, and context management
 */
export class MCPIntegration {
  /**
   * Get available MCP tools for an agent and format them for prompt injection
   */
  static async getMCPContext(userId: string, agentId: string): Promise<MCPContext> {
    try {
      const availableTools = await MCPService.getAgentAvailableTools(userId, agentId);
      
      if (availableTools.length === 0) {
        return {
          availableTools: [],
          toolsDescription: ''
        };
      }

      const toolsDescription = this.formatToolsForPrompt(availableTools);
      
      return {
        availableTools,
        toolsDescription
      };
    } catch (error) {
      console.error('Failed to get MCP context:', error);
      return {
        availableTools: [],
        toolsDescription: ''
      };
    }
  }

  /**
   * Format available tools for prompt injection
   */
  private static formatToolsForPrompt(tools: MCPTool[]): string {
    if (tools.length === 0) {
      return '';
    }

    let toolsText = '\n\nAVAILABLE TOOLS:\n';
    toolsText += 'You have access to the following tools. Use them when they would be helpful to answer the user\'s request.\n\n';

    tools.forEach(tool => {
      toolsText += `**${tool.name}** (${tool.category})\n`;
      toolsText += `Description: ${tool.description}\n`;
      
      if (tool.parameters && Object.keys(tool.parameters).length > 0) {
        toolsText += `Parameters:\n`;
        Object.entries(tool.parameters).forEach(([param, config]: [string, any]) => {
          const required = config.required ? ' (required)' : ' (optional)';
          const defaultVal = config.default ? ` [default: ${config.default}]` : '';
          toolsText += `  - ${param}: ${config.type}${required}${defaultVal}\n`;
        });
      }
      toolsText += '\n';
    });

    toolsText += 'To use a tool, respond with a JSON object in this format:\n';
    toolsText += '```json\n';
    toolsText += '{\n';
    toolsText += '  "tool_call": {\n';
    toolsText += '    "id": "unique_id",\n';
    toolsText += '    "tool_name": "tool_name_here",\n';
    toolsText += '    "parameters": {\n';
    toolsText += '      "param1": "value1",\n';
    toolsText += '      "param2": "value2"\n';
    toolsText += '    }\n';
    toolsText += '  }\n';
    toolsText += '}\n';
    toolsText += '```\n\n';

    return toolsText;
  }

  /**
   * Parse tool calls from agent response
   */
  static parseToolCalls(response: string, userId: string, agentId: string): MCPToolCall[] {
    const toolCalls: MCPToolCall[] = [];
    
    try {
      // Look for JSON blocks containing tool_call
      const jsonBlocks = response.match(/```json\s*([\s\S]*?)\s*```/g);
      
      if (!jsonBlocks) {
        return toolCalls;
      }

      for (const block of jsonBlocks) {
        try {
          const jsonContent = block.replace(/```json\s*/, '').replace(/\s*```/, '');
          const parsed = JSON.parse(jsonContent);
          
          if (parsed.tool_call) {
            const toolCall: MCPToolCall = {
              id: parsed.tool_call.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              toolName: parsed.tool_call.tool_name,
              parameters: parsed.tool_call.parameters || {},
              agentId,
              userId,
              timestamp: new Date().toISOString(),
              context: {
                conversationId: `${userId}_${agentId}`,
                messageId: `msg_${Date.now()}`
              }
            };
            
            toolCalls.push(toolCall);
          }
        } catch (parseError) {
          console.warn('Failed to parse tool call JSON:', parseError);
          continue;
        }
      }
    } catch (error) {
      console.error('Error parsing tool calls:', error);
    }

    return toolCalls;
  }

  /**
   * Execute a tool call and return the result
   */
  static async executeToolCall(userId: string, agentId: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    try {
      console.log(`[MCP-INTEGRATION] Executing tool ${toolCall.toolName} for agent ${agentId}`);
      
      const result = await MCPService.executeToolWithPermissionAndCredentialCheck(
        userId,
        agentId,
        toolCall
      );
      
      console.log(`[MCP-INTEGRATION] Tool execution ${result.success ? 'succeeded' : 'failed'}: ${toolCall.toolName}`);
      return result;
    } catch (error) {
      console.error(`[MCP-INTEGRATION] Tool execution error:`, error);
      
      return {
        id: toolCall.id,
        toolCallId: toolCall.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Format tool results for inclusion in agent response
   */
  static formatToolResults(toolResults: MCPToolResult[]): string {
    if (toolResults.length === 0) {
      return '';
    }

    let resultsText = '\n\nTOOL EXECUTION RESULTS:\n';
    
    toolResults.forEach(result => {
      resultsText += `\n**Tool: ${result.toolCallId}**\n`;
      resultsText += `Status: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
      resultsText += `Execution Time: ${result.executionTime}ms\n`;
      
      if (result.success && result.result) {
        resultsText += `Result:\n`;
        if (typeof result.result === 'object') {
          resultsText += `\`\`\`json\n${JSON.stringify(result.result, null, 2)}\n\`\`\`\n`;
        } else {
          resultsText += `${result.result}\n`;
        }
      }
      
      if (!result.success && result.error) {
        resultsText += `Error: ${result.error}\n`;
      }
      
      if (result.logs && result.logs.length > 0) {
        resultsText += `Logs:\n${result.logs.join('\n')}\n`;
      }
    });

    resultsText += '\nPlease use these results to provide a helpful response to the user.\n';
    
    return resultsText;
  }

  /**
   * Process agent response: detect tool calls, execute them, and format results
   */
  static async processAgentResponse(
    response: string,
    userId: string,
    agentId: string
  ): Promise<{
    hasToolCalls: boolean;
    toolCalls: MCPToolCall[];
    toolResults: MCPToolResult[];
    enhancedResponse: string;
  }> {
    // Parse tool calls from response
    const toolCalls = this.parseToolCalls(response, userId, agentId);
    
    if (toolCalls.length === 0) {
      return {
        hasToolCalls: false,
        toolCalls: [],
        toolResults: [],
        enhancedResponse: response
      };
    }

    // Execute tool calls
    const toolResults: MCPToolResult[] = [];
    for (const toolCall of toolCalls) {
      const result = await this.executeToolCall(userId, agentId, toolCall);
      toolResults.push(result);
    }

    // Format results and enhance response
    const toolResultsText = this.formatToolResults(toolResults);
    const enhancedResponse = response + toolResultsText;

    return {
      hasToolCalls: true,
      toolCalls,
      toolResults,
      enhancedResponse
    };
  }

  /**
   * Check if user has MCP server configured
   */
  static async hasMCPServer(userId: string): Promise<boolean> {
    try {
      const mcpServer = await MCPService.getMCPServerForUser(userId);
      return !!mcpServer;
    } catch (error) {
      console.error('Error checking MCP server:', error);
      return false;
    }
  }

  /**
   * Get tool schema for agent (with credential requirements filtered out)
   */
  static async getToolSchemaForAgent(userId: string, agentId: string, toolName: string): Promise<any> {
    try {
      const availableTools = await MCPService.getAgentAvailableTools(userId, agentId);
      const tool = availableTools.find(t => t.name === toolName);
      
      if (!tool) {
        return null;
      }

      // Get agent credentials to filter out credential fields from schema
      const agentCredentials = await MCPService.getAgentToolCredentials(userId, agentId, toolName);
      const credentialFields = agentCredentials ? Object.keys(agentCredentials) : [];
      
      // Filter out credential fields from parameters
      const filteredParameters = { ...tool.parameters };
      credentialFields.forEach(field => {
        delete filteredParameters[field];
      });

      return {
        name: tool.name,
        description: tool.description,
        parameters: filteredParameters,
        category: tool.category,
        credentialsConfigured: !!agentCredentials
      };
    } catch (error) {
      console.error(`Error getting tool schema for ${toolName}:`, error);
      return null;
    }
  }
}