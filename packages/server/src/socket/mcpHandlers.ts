import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { 
  SocketIOEvents,
  MCPSocketEvents,
  MCPConfiguration, 
  MCPToolCall, 
  MCPStatus, 
  MCPHealthResult,
  MCPToolSchema,
  MCPContainerLogs
} from '@starships/protocol';
import { MCPService } from '../services/MCPService';
import { SocketIOService } from '../services/SocketIOService';

// Create a combined interface for MCP events
interface CombinedSocketEvents extends SocketIOEvents, MCPSocketEvents {}

export function setupMCPHandlers(io: SocketIOServer<CombinedSocketEvents>) {
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    const socketService = SocketIOService.getInstance();

    console.log(`[MCP SOCKET] User ${userId} connected for MCP operations`);

    // Handle MCP server configuration
    socket.on('mcp:configure', async (config: MCPConfiguration) => {
      console.log(`[MCP SOCKET] Configuring MCP server for user ${userId}:`, config.name);

      try {
        // Validate configuration
        if (!config.userId || config.userId !== userId) {
          socket.emit('mcp:configuration-result', {
            success: false,
            error: 'Invalid user ID in configuration'
          });
          return;
        }

        if (!config.tools || config.tools.length === 0) {
          socket.emit('mcp:configuration-result', {
            success: false,
            error: 'At least one tool must be configured'
          });
          return;
        }

        // Configure MCP server using the correct method name
        const mcpServer = await MCPService.createUserMCPServer(userId, config);

        // Join MCP room for real-time updates
        const mcpRoomName = `mcp:${mcpServer.id}`;
        socket.join(mcpRoomName);
        console.log(`[MCP SOCKET] User ${userId} joined MCP room: ${mcpRoomName}`);

        // Send success response
        socket.emit('mcp:configuration-result', {
          success: true,
          serverId: mcpServer.id
        });

        // Send initial status update (mock status for now)
        const status: MCPStatus = {
          serverId: mcpServer.id,
          status: 'running',
          containerInfo: {
            id: `container-${mcpServer.id}`,
            status: 'running',
            uptime: 0,
            resourceUsage: {
              memory: '256MB',
              cpu: '10%'
            }
          },
          availableTools: config.tools.map((t: any) => t.name),
          lastActivity: new Date().toISOString()
        };
        socket.emit('mcp:status-update', status);

        // Notify about available tools for each agent
        if (config.agentPermissions) {
          for (const [agentId, toolNames] of Object.entries(config.agentPermissions)) {
            const availableTools = await MCPService.getAgentAvailableTools(userId, agentId);
            const toolSchemas: MCPToolSchema[] = availableTools.map(tool => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              agentCredentialsConfigured: true
            }));
            socket.emit('mcp:agent-tools-available', agentId, toolSchemas);
          }
        }

        console.log(`[MCP SOCKET] MCP server configured successfully for user ${userId}: ${mcpServer.id}`);

      } catch (error) {
        console.error(`[MCP SOCKET] Configuration error for user ${userId}:`, error);
        socket.emit('mcp:configuration-result', {
          success: false,
          error: error instanceof Error ? error.message : 'Configuration failed'
        });
      }
    });

    // Handle tool execution with real-time streaming
    socket.on('mcp:tool-execute', async (toolCall: MCPToolCall) => {
      console.log(`[MCP SOCKET] Executing tool ${toolCall.toolName} for user ${userId}, agent ${toolCall.agentId}`);

      try {
        // Validate tool call
        if (!toolCall.userId || toolCall.userId !== userId) {
          socket.emit('mcp:tool-result', {
            id: toolCall.id,
            toolCallId: toolCall.id,
            success: false,
            error: 'Invalid user ID in tool call',
            executionTime: 0,
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Stream tool execution progress
        const startTime = Date.now();
        
        // Send initial stream chunk
        socket.emit('mcp:tool-stream', {
          toolCallId: toolCall.id,
          type: 'stdout',
          content: `Starting execution of tool: ${toolCall.toolName}`,
          timestamp: Date.now()
        });

        // Execute tool with permission and credential checks
        const result = await MCPService.executeToolWithPermissionAndCredentialCheck(
          userId,
          toolCall.agentId,
          toolCall
        );

        // Send execution logs if available
        if (result.logs && result.logs.length > 0) {
          for (const log of result.logs) {
            socket.emit('mcp:tool-stream', {
              toolCallId: toolCall.id,
              type: 'stdout',
              content: log,
              timestamp: Date.now()
            });
          }
        }

        // Send final result
        socket.emit('mcp:tool-stream', {
          toolCallId: toolCall.id,
          type: 'complete',
          content: result.success ? 'Tool execution completed successfully' : 'Tool execution failed',
          timestamp: Date.now()
        });

        socket.emit('mcp:tool-result', result);

        console.log(`[MCP SOCKET] Tool execution completed for user ${userId}: ${toolCall.toolName} (${Date.now() - startTime}ms)`);

      } catch (error) {
        console.error(`[MCP SOCKET] Tool execution error for user ${userId}:`, error);
        
        socket.emit('mcp:tool-stream', {
          toolCallId: toolCall.id,
          type: 'error',
          content: error instanceof Error ? error.message : 'Unknown execution error',
          timestamp: Date.now()
        });

        socket.emit('mcp:tool-result', {
          id: toolCall.id,
          toolCallId: toolCall.id,
          success: false,
          error: error instanceof Error ? error.message : 'Tool execution failed',
          executionTime: Date.now() - Date.now(),
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle MCP health checks
    socket.on('mcp:health-check', async (serverId: string) => {
      console.log(`[MCP SOCKET] Health check requested for server ${serverId} by user ${userId}`);

      try {
        // Verify user owns this MCP server
        const mcpServer = await MCPService.getMCPServerForUser(userId);
        if (!mcpServer || mcpServer.id !== serverId) {
          socket.emit('mcp:health-result', {
            serverId,
            healthy: false,
            uptime: 0,
            resourceUsage: { memory: '0MB', cpu: '0%' },
            availableTools: 0,
            lastActivity: new Date().toISOString(),
            error: 'Server not found or access denied'
          });
          return;
        }

        // Perform health check (mock implementation for now)
        const healthResult: MCPHealthResult = {
          serverId,
          healthy: true,
          uptime: Date.now() - new Date(mcpServer.createdAt).getTime(),
          resourceUsage: { memory: '256MB', cpu: '15%' },
          availableTools: (await MCPService.getUserAvailableTools(userId)).length,
          lastActivity: new Date().toISOString()
        };
        
        socket.emit('mcp:health-result', healthResult);

        console.log(`[MCP SOCKET] Health check completed for server ${serverId}: healthy`);

      } catch (error) {
        console.error(`[MCP SOCKET] Health check error for server ${serverId}:`, error);
        socket.emit('mcp:health-result', {
          serverId,
          healthy: false,
          uptime: 0,
          resourceUsage: { memory: '0MB', cpu: '0%' },
          availableTools: 0,
          lastActivity: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Health check failed'
        });
      }
    });

    // Handle disconnection cleanup
    socket.on('disconnect', (reason) => {
      console.log(`[MCP SOCKET] User ${userId} disconnected from MCP operations: ${reason}`);
      // Cleanup is handled automatically by Socket.IO room management
    });
  });

  // Periodic status updates for all connected MCP users
  setInterval(async () => {
    try {
      const connectedSockets = await io.fetchSockets();
      const userIds = [...new Set(connectedSockets.map(socket => socket.data.userId))];

      for (const userId of userIds) {
        if (!userId) continue;

        try {
          const mcpServer = await MCPService.getMCPServerForUser(userId);
          if (mcpServer) {
            // Send status update to user's MCP room
            const mcpRoomName = `mcp:${mcpServer.id}`;
            const status: MCPStatus = {
              serverId: mcpServer.id,
              status: mcpServer.status as 'running' | 'stopped' | 'error' | 'starting',
              containerInfo: {
                id: `container-${mcpServer.id}`,
                status: mcpServer.status,
                uptime: Date.now() - new Date(mcpServer.createdAt).getTime(),
                resourceUsage: {
                  memory: '256MB',
                  cpu: '15%'
                }
              },
              availableTools: (await MCPService.getUserAvailableTools(userId)).map(t => t.name),
              lastActivity: mcpServer.updatedAt
            };
            
            (io as any).to(mcpRoomName).emit('mcp:status-update', status);

            // Send mock container logs
            const logs: MCPContainerLogs = {
              serverId: mcpServer.id,
              containerId: `container-${mcpServer.id}`,
              logs: `[${new Date().toISOString()}] MCP server running normally`,
              timestamp: Date.now(),
              level: 'info'
            };
            (io as any).to(mcpRoomName).emit('mcp:container-logs', logs);
          }
        } catch (error) {
          console.warn(`[MCP SOCKET] Failed to get status for user ${userId}:`, error);
        }
      }
    } catch (error) {
      console.error('[MCP SOCKET] Error in periodic status update:', error);
    }
  }, 30000); // Every 30 seconds

  console.log('[MCP SOCKET] MCP Socket.IO handlers initialized');
}

// Utility functions for broadcasting MCP events
export class MCPSocketBroadcaster {
  private static io: SocketIOServer<CombinedSocketEvents>;

  static initialize(io: SocketIOServer<CombinedSocketEvents>) {
    MCPSocketBroadcaster.io = io;
  }

  // Broadcast agent permission updates
  static async broadcastAgentPermissionUpdate(userId: string, agentId: string, toolName: string, granted: boolean) {
    if (!MCPSocketBroadcaster.io) return;

    try {
      const userSockets = await MCPSocketBroadcaster.io.fetchSockets();
      const targetSockets = userSockets.filter(socket => socket.data.userId === userId);

      for (const socket of targetSockets) {
        (socket as any).emit('mcp:agent-permission-updated', agentId, toolName, granted);
      }

      console.log(`[MCP BROADCASTER] Permission update sent to user ${userId}: agent ${agentId}, tool ${toolName}, granted: ${granted}`);
    } catch (error) {
      console.error('[MCP BROADCASTER] Failed to broadcast permission update:', error);
    }
  }

  // Broadcast agent credential updates
  static async broadcastAgentCredentialsUpdate(userId: string, agentId: string, toolName: string, configured: boolean) {
    if (!MCPSocketBroadcaster.io) return;

    try {
      const userSockets = await MCPSocketBroadcaster.io.fetchSockets();
      const targetSockets = userSockets.filter(socket => socket.data.userId === userId);

      for (const socket of targetSockets) {
        (socket as any).emit('mcp:agent-credentials-updated', agentId, toolName, configured);
      }

      console.log(`[MCP BROADCASTER] Credentials update sent to user ${userId}: agent ${agentId}, tool ${toolName}, configured: ${configured}`);
    } catch (error) {
      console.error('[MCP BROADCASTER] Failed to broadcast credentials update:', error);
    }
  }

  // Broadcast tool availability updates
  static async broadcastAgentToolsAvailable(userId: string, agentId: string, tools: MCPToolSchema[]) {
    if (!MCPSocketBroadcaster.io) return;

    try {
      const userSockets = await MCPSocketBroadcaster.io.fetchSockets();
      const targetSockets = userSockets.filter(socket => socket.data.userId === userId);

      for (const socket of targetSockets) {
        (socket as any).emit('mcp:agent-tools-available', agentId, tools);
      }

      console.log(`[MCP BROADCASTER] Tools availability sent to user ${userId}: agent ${agentId}, ${tools.length} tools`);
    } catch (error) {
      console.error('[MCP BROADCASTER] Failed to broadcast tools availability:', error);
    }
  }

  // Broadcast container status updates
  static async broadcastStatusUpdate(userId: string, status: MCPStatus) {
    if (!MCPSocketBroadcaster.io) return;

    try {
      const mcpRoomName = `mcp:${status.serverId}`;
      (MCPSocketBroadcaster.io as any).to(mcpRoomName).emit('mcp:status-update', status);

      console.log(`[MCP BROADCASTER] Status update sent to room ${mcpRoomName}: ${status.status}`);
    } catch (error) {
      console.error('[MCP BROADCASTER] Failed to broadcast status update:', error);
    }
  }
}