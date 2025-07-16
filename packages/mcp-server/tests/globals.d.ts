import { MCPServer, MCPTool, MCPContainer, MCPToolCall, MCPToolResult } from '@starships/models';

declare global {
  var mockMCPServer: MCPServer;
  var mockMCPTool: MCPTool;
  var mockMCPContainer: MCPContainer;
  var mockMCPToolCall: MCPToolCall;
  var mockMCPToolResult: MCPToolResult;
}

export {};