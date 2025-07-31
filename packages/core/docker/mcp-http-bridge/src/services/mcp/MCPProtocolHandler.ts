/**
 * MCPProtocolHandler - Manages MCP protocol connections and communication
 * 
 * This service handles connection management, request routing, and error recovery
 * for MCP (Model Context Protocol) servers running in Docker containers. It provides
 * connection pooling, timeout handling, and automatic reconnection capabilities.
 */

import { EventEmitter } from 'events';
import { MCPServerConnector } from '@starships/models';

// MCP Protocol Types (simplified - would normally come from MCP SDK)
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPConnection {
  id: string;
  connectorId: string;
  serviceName: string;
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastActivity: Date;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  requestCount: number;
  errorCount: number;
}

export interface ConnectionConfig {
  timeout: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  connectionPoolSize: number;
  requestRetries: number;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  uptime: number;
}

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Manages MCP protocol connections with advanced features
 */
export class MCPProtocolHandler extends EventEmitter {
  private connections: Map<string, MCPConnection> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    startTime: number;
  }> = new Map();
  
  private config: ConnectionConfig;
  private stats: ConnectionStats;
  private heartbeatTimer?: NodeJS.Timeout;
  private startTime: number;

  constructor(config?: Partial<ConnectionConfig>) {
    super();
    
    this.config = {
      timeout: 30000, // 30 seconds
      reconnectDelay: 5000, // 5 seconds
      maxReconnectAttempts: 3,
      heartbeatInterval: 60000, // 1 minute
      connectionPoolSize: 10,
      requestRetries: 2,
      ...config
    };

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      uptime: 0
    };

    this.startTime = Date.now();
    this.startHeartbeat();
  }

  /**
   * Connect to an MCP server
   */
  async connect(connector: MCPServerConnector): Promise<MCPConnection> {
    const connectionId = `${connector.id}-${Date.now()}`;
    console.log(`[MCPProtocolHandler] Connecting to MCP server: ${connector.dockerServiceName}`);

    // Validate connection requirements
    if (!connector.dockerServiceName) {
      throw new Error('Docker service name is required for MCP connection');
    }

    if (!connector.dockerStatus || connector.dockerStatus !== 'running') {
      throw new Error(`Cannot connect to MCP server in status: ${connector.dockerStatus}`);
    }

    // Create connection object
    const connection: MCPConnection = {
      id: connectionId,
      connectorId: connector.id,
      serviceName: connector.dockerServiceName,
      url: this.buildConnectionUrl(connector),
      status: 'connecting',
      lastActivity: new Date(),
      reconnectAttempts: 0,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      requestCount: 0,
      errorCount: 0
    };

    this.connections.set(connectionId, connection);
    this.stats.totalConnections++;

    try {
      // Establish connection (simulated - would use actual MCP transport)
      await this.establishConnection(connection);
      
      connection.status = 'connected';
      this.stats.activeConnections++;
      
      console.log(`[MCPProtocolHandler] Successfully connected to ${connection.serviceName}`);
      this.emit('connected', connection);
      
      return connection;

    } catch (error) {
      connection.status = 'error';
      connection.errorCount++;
      
      console.error(`[MCPProtocolHandler] Failed to connect to ${connection.serviceName}:`, error);
      this.emit('connectionError', connection, error);
      
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`[MCPProtocolHandler] Connection ${connectionId} not found`);
      return;
    }

    console.log(`[MCPProtocolHandler] Disconnecting from ${connection.serviceName}`);

    try {
      // Close connection (simulated)
      await this.closeConnection(connection);
      
      connection.status = 'disconnected';
      if (this.stats.activeConnections > 0) {
        this.stats.activeConnections--;
      }
      
      this.connections.delete(connectionId);
      
      console.log(`[MCPProtocolHandler] Disconnected from ${connection.serviceName}`);
      this.emit('disconnected', connection);

    } catch (error) {
      console.error(`[MCPProtocolHandler] Error disconnecting from ${connection.serviceName}:`, error);
      throw error;
    }
  }

  /**
   * Send a request to an MCP server
   */
  async sendRequest(
    connectorId: string, 
    method: string, 
    params?: any, 
    options?: RequestOptions
  ): Promise<any> {
    const connection = this.getConnectionByConnectorId(connectorId);
    if (!connection) {
      throw new Error(`No connection found for connector: ${connectorId}`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Connection not ready. Status: ${connection.status}`);
    }

    const requestId = this.generateRequestId();
    const requestOptions = { ...this.config, ...options };
    const startTime = Date.now();

    console.log(`[MCPProtocolHandler] Sending request ${requestId} to ${connection.serviceName}: ${method}`);

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        connection.errorCount++;
        this.stats.failedRequests++;
        
        const error = new Error(`Request timeout after ${requestOptions.timeout}ms`);
        console.error(`[MCPProtocolHandler] Request ${requestId} timed out`);
        reject(error);
      }, requestOptions.timeout || this.config.timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        startTime
      });

      // Send request (simulated - would use actual MCP transport)
      this.sendRequestToServer(connection, request)
        .then(() => {
          connection.requestCount++;
          connection.lastActivity = new Date();
          this.stats.totalRequests++;
        })
        .catch((error) => {
          this.pendingRequests.delete(requestId);
          clearTimeout(timeout);
          connection.errorCount++;
          this.stats.failedRequests++;
          reject(error);
        });
    });
  }

  /**
   * Handle response from MCP server
   */
  handleResponse(response: MCPResponse): void {
    const requestId = response.id.toString();
    const pendingRequest = this.pendingRequests.get(requestId);
    
    if (!pendingRequest) {
      console.warn(`[MCPProtocolHandler] Received response for unknown request: ${requestId}`);
      return;
    }

    const { resolve, reject, timeout, startTime } = pendingRequest;
    clearTimeout(timeout);
    this.pendingRequests.delete(requestId);

    // Update stats
    const responseTime = Date.now() - startTime;
    this.updateResponseTimeStats(responseTime);

    if (response.error) {
      console.error(`[MCPProtocolHandler] Request ${requestId} failed:`, response.error);
      this.stats.failedRequests++;
      reject(new Error(`MCP Error: ${response.error.message}`));
    } else {
      console.log(`[MCPProtocolHandler] Request ${requestId} completed in ${responseTime}ms`);
      this.stats.successfulRequests++;
      resolve(response.result);
    }
  }

  /**
   * Get connection by connector ID
   */
  getConnection(connectorId: string): MCPConnection | undefined {
    return this.getConnectionByConnectorId(connectorId);
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): MCPConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.status === 'connected');
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Health check for a specific connection
   */
  async healthCheck(connectorId: string): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      
      // Send ping request
      await this.sendRequest(connectorId, 'ping', {}, { timeout: 5000 });
      
      const latency = Date.now() - startTime;
      
      return {
        healthy: true,
        latency
      };

    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Reconnect to a server
   */
  async reconnect(connectionId: string): Promise<MCPConnection> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (connection.reconnectAttempts >= connection.maxReconnectAttempts) {
      throw new Error(`Max reconnection attempts reached for ${connection.serviceName}`);
    }

    console.log(`[MCPProtocolHandler] Attempting to reconnect to ${connection.serviceName} (attempt ${connection.reconnectAttempts + 1})`);

    connection.reconnectAttempts++;
    connection.status = 'connecting';

    try {
      await this.establishConnection(connection);
      
      connection.status = 'connected';
      connection.reconnectAttempts = 0; // Reset on successful reconnection
      connection.lastActivity = new Date();
      
      console.log(`[MCPProtocolHandler] Successfully reconnected to ${connection.serviceName}`);
      this.emit('reconnected', connection);
      
      return connection;

    } catch (error) {
      connection.status = 'error';
      connection.errorCount++;
      
      console.error(`[MCPProtocolHandler] Reconnection failed for ${connection.serviceName}:`, error);
      this.emit('reconnectionFailed', connection, error);
      
      // Schedule another reconnection attempt if not at max
      if (connection.reconnectAttempts < connection.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnect(connectionId).catch(err => {
            console.error(`[MCPProtocolHandler] Automatic reconnection failed:`, err);
          });
        }, this.config.reconnectDelay);
      }
      
      throw error;
    }
  }

  /**
   * Cleanup and close all connections
   */
  async shutdown(): Promise<void> {
    console.log(`[MCPProtocolHandler] Shutting down protocol handler`);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Close all pending requests
    for (const [requestId, { reject, timeout }] of this.pendingRequests) {
      clearTimeout(timeout);
      reject(new Error('Protocol handler is shutting down'));
    }
    this.pendingRequests.clear();

    // Close all connections
    const disconnectPromises = Array.from(this.connections.keys()).map(connectionId =>
      this.disconnect(connectionId).catch(err => {
        console.error(`[MCPProtocolHandler] Error closing connection ${connectionId}:`, err);
      })
    );

    await Promise.all(disconnectPromises);
    this.connections.clear();

    console.log(`[MCPProtocolHandler] Protocol handler shutdown complete`);
  }

  /**
   * Private helper methods
   */
  private buildConnectionUrl(connector: MCPServerConnector): string {
    // Build connection URL based on Docker service name
    // In production, this would determine the protocol (TCP, WebSocket, etc.)
    return `tcp://${connector.dockerServiceName}:3000`;
  }

  private async establishConnection(connection: MCPConnection): Promise<void> {
    // Simulated connection establishment
    // In real implementation, this would:
    // 1. Create TCP/WebSocket connection to the service
    // 2. Perform MCP handshake
    // 3. Set up message handlers
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate random connection failure (10% chance)
        if (Math.random() < 0.1) {
          reject(new Error('Connection refused'));
        } else {
          resolve();
        }
      }, 100);
    });
  }

  private async closeConnection(connection: MCPConnection): Promise<void> {
    // Simulated connection closure
    // In real implementation, this would gracefully close the transport
    
    return new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  private async sendRequestToServer(connection: MCPConnection, request: MCPRequest): Promise<void> {
    // Simulated request sending
    // In real implementation, this would serialize and send over transport
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate request failure (5% chance)
        if (Math.random() < 0.05) {
          reject(new Error('Request send failed'));
        } else {
          resolve();
          
          // Simulate response after delay
          setTimeout(() => {
            const response: MCPResponse = {
              jsonrpc: '2.0',
              id: request.id,
              result: { success: true, method: request.method }
            };
            this.handleResponse(response);
          }, Math.random() * 200 + 50); // 50-250ms delay
        }
      }, 10);
    });
  }

  private getConnectionByConnectorId(connectorId: string): MCPConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.connectorId === connectorId && connection.status === 'connected') {
        return connection;
      }
    }
    return undefined;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateResponseTimeStats(responseTime: number): void {
    const totalRequests = this.stats.successfulRequests + this.stats.failedRequests;
    if (totalRequests === 0) {
      this.stats.averageResponseTime = responseTime;
    } else {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeat();
    }, this.config.heartbeatInterval);
  }

  private async performHeartbeat(): Promise<void> {
    const activeConnections = this.getActiveConnections();
    
    for (const connection of activeConnections) {
      const timeSinceLastActivity = Date.now() - connection.lastActivity.getTime();
      
      // If no activity for 2x heartbeat interval, perform health check
      if (timeSinceLastActivity > this.config.heartbeatInterval * 2) {
        try {
          const health = await this.healthCheck(connection.connectorId);
          if (!health.healthy) {
            console.warn(`[MCPProtocolHandler] Health check failed for ${connection.serviceName}: ${health.error}`);
            this.emit('healthCheckFailed', connection, health.error);
          }
        } catch (error) {
          console.error(`[MCPProtocolHandler] Heartbeat health check error for ${connection.serviceName}:`, error);
        }
      }
    }
  }

  /**
   * Advanced connection management features
   */

  /**
   * Get connection pool usage
   */
  getConnectionPoolUsage(): {
    used: number;
    available: number;
    utilization: number;
  } {
    const used = this.stats.activeConnections;
    const available = this.config.connectionPoolSize - used;
    const utilization = used / this.config.connectionPoolSize;

    return { used, available, utilization };
  }

  /**
   * Set connection priority (for connection pooling)
   */
  setConnectionPriority(connectionId: string, priority: 'low' | 'normal' | 'high'): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      (connection as any).priority = priority;
      console.log(`[MCPProtocolHandler] Set priority ${priority} for connection ${connectionId}`);
    }
  }

  /**
   * Get detailed connection info
   */
  getConnectionInfo(connectionId: string): {
    connection: MCPConnection;
    requestsPerMinute: number;
    errorRate: number;
    averageResponseTime: number;
  } | null {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return null;
    }

    const errorRate = connection.requestCount > 0 ? 
      (connection.errorCount / connection.requestCount) * 100 : 0;

    // Calculate requests per minute (simplified)
    const uptimeMinutes = (Date.now() - this.startTime) / (1000 * 60);
    const requestsPerMinute = uptimeMinutes > 0 ? connection.requestCount / uptimeMinutes : 0;

    return {
      connection,
      requestsPerMinute,
      errorRate,
      averageResponseTime: this.stats.averageResponseTime
    };
  }

  /**
   * Bulk operations
   */
  async connectMultiple(connectors: MCPServerConnector[]): Promise<{
    successful: MCPConnection[];
    failed: { connector: MCPServerConnector; error: Error }[];
  }> {
    const results = await Promise.allSettled(
      connectors.map(connector => this.connect(connector))
    );

    const successful: MCPConnection[] = [];
    const failed: { connector: MCPServerConnector; error: Error }[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          connector: connectors[index],
          error: result.reason
        });
      }
    });

    return { successful, failed };
  }

  async disconnectMultiple(connectionIds: string[]): Promise<void> {
    const disconnectPromises = connectionIds.map(id => 
      this.disconnect(id).catch(err => {
        console.error(`[MCPProtocolHandler] Error disconnecting ${id}:`, err);
      })
    );

    await Promise.all(disconnectPromises);
  }
}