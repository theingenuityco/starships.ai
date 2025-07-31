import { MCPProtocolHandler, MCPConnection, MCPRequest, MCPResponse, ConnectionConfig } from '../MCPProtocolHandler';
import { MCPServerConnector } from '@starships/models';
import { EventEmitter } from 'events';

// Mock timers for testing
jest.useFakeTimers();

describe('MCPProtocolHandler', () => {
  let handler: MCPProtocolHandler;
  
  const mockConnector: MCPServerConnector = {
    id: 'connector-123',
    templateId: 'github-template',
    env: '{"GITHUB_TOKEN": "test-token"}',
    starshipId: 'starship-456',
    name: 'Test GitHub Connector',
    slug: 'github',
    description: 'Test connector',
    isActive: true,
    isPublic: false,
    createdAt: '2025-01-25T00:00:00Z',
    updatedAt: '2025-01-25T00:00:00Z',
    dockerServiceName: 'mcp-starship-456-github',
    dockerStatus: 'running',
    dockerContainerId: 'container-abc123',
    dockerHealthStatus: 'healthy',
    dockerNetworkName: 'starship-starship-456'
  };

  const mockConfig: ConnectionConfig = {
    timeout: 5000,
    reconnectDelay: 1000,
    maxReconnectAttempts: 2,
    heartbeatInterval: 10000,
    connectionPoolSize: 5,
    requestRetries: 1
  };

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new MCPProtocolHandler(mockConfig);
  });

  afterEach(() => {
    handler.removeAllListeners();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const defaultHandler = new MCPProtocolHandler();
      const stats = defaultHandler.getStats();
      
      expect(stats.totalConnections).toBe(0);
      expect(stats.activeConnections).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it('should initialize with custom config', () => {
      const customConfig = { timeout: 15000, maxReconnectAttempts: 5 };
      const customHandler = new MCPProtocolHandler(customConfig);
      
      expect((customHandler as any).config.timeout).toBe(15000);
      expect((customHandler as any).config.maxReconnectAttempts).toBe(5);
    });

    it('should start heartbeat timer', () => {
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), mockConfig.heartbeatInterval);
    });
  });

  describe('connect', () => {
    it('should successfully connect to MCP server', async () => {
      const connectionPromise = handler.connect(mockConnector);
      
      // Advance timers to complete connection
      jest.advanceTimersByTime(200);
      
      const connection = await connectionPromise;
      
      expect(connection.id).toBeDefined();
      expect(connection.connectorId).toBe('connector-123');
      expect(connection.serviceName).toBe('mcp-starship-456-github');
      expect(connection.url).toBe('tcp://mcp-starship-456-github:3000');
      expect(connection.status).toBe('connected');
      expect(connection.reconnectAttempts).toBe(0);
      
      const stats = handler.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.activeConnections).toBe(1);
    });

    it('should reject if docker service name is missing', async () => {
      const invalidConnector = { ...mockConnector, dockerServiceName: undefined };
      
      await expect(handler.connect(invalidConnector)).rejects.toThrow(
        'Docker service name is required for MCP connection'
      );
    });

    it('should reject if docker status is not running', async () => {
      const stoppedConnector = { ...mockConnector, dockerStatus: 'stopped' as any };
      
      await expect(handler.connect(stoppedConnector)).rejects.toThrow(
        'Cannot connect to MCP server in status: stopped'
      );
    });

    it('should handle connection failure', async () => {
      // Mock Math.random to always return value that triggers failure
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.05); // Less than 0.1, triggers failure
      
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      
      await expect(connectionPromise).rejects.toThrow('Connection refused');
      
      const stats = handler.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.activeConnections).toBe(0);
      
      Math.random = originalRandom;
    });

    it('should emit connected event on successful connection', async () => {
      const connectedSpy = jest.fn();
      handler.on('connected', connectedSpy);
      
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      
      await connectionPromise;
      
      expect(connectedSpy).toHaveBeenCalledWith(expect.objectContaining({
        connectorId: 'connector-123',
        status: 'connected'
      }));
    });

    it('should emit connectionError event on failure', async () => {
      const errorSpy = jest.fn();
      handler.on('connectionError', errorSpy);
      
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.05);
      
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      
      await expect(connectionPromise).rejects.toThrow();
      expect(errorSpy).toHaveBeenCalled();
      
      Math.random = originalRandom;
    });
  });

  describe('disconnect', () => {
    it('should successfully disconnect from MCP server', async () => {
      // First connect
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection = await connectionPromise;
      
      const disconnectedSpy = jest.fn();
      handler.on('disconnected', disconnectedSpy);
      
      // Then disconnect
      await handler.disconnect(connection.id);
      
      expect(disconnectedSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: connection.id,
        status: 'disconnected'
      }));
      
      const stats = handler.getStats();
      expect(stats.activeConnections).toBe(0);
    });

    it('should handle disconnect of non-existent connection', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await handler.disconnect('non-existent-id');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MCPProtocolHandler] Connection non-existent-id not found'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('sendRequest', () => {
    let connection: MCPConnection;

    beforeEach(async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      connection = await connectionPromise;
    });

    it('should successfully send request and receive response', async () => {
      const requestPromise = handler.sendRequest('connector-123', 'test.method', { param1: 'value1' });
      
      // Advance timers to trigger response
      jest.advanceTimersByTime(150);
      
      const result = await requestPromise;
      
      expect(result).toEqual({
        success: true,
        method: 'test.method'
      });
      
      const stats = handler.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
    });

    it('should handle request timeout', async () => {
      const requestPromise = handler.sendRequest('connector-123', 'slow.method', {}, { timeout: 1000 });
      
      // Advance timers past timeout
      jest.advanceTimersByTime(1100);
      
      await expect(requestPromise).rejects.toThrow('Request timeout after 1000ms');
      
      const stats = handler.getStats();
      expect(stats.failedRequests).toBe(1);
    });

    it('should handle connection not found', async () => {
      await expect(
        handler.sendRequest('non-existent-connector', 'test.method', {})
      ).rejects.toThrow('No connection found for connector: non-existent-connector');
    });

    it('should handle connection not ready', async () => {
      // Manually set connection status to disconnected
      const conn = handler.getConnection('connector-123');
      if (conn) {
        (conn as any).status = 'disconnected';
      }
      
      await expect(
        handler.sendRequest('connector-123', 'test.method', {})
      ).rejects.toThrow('Connection not ready. Status: disconnected');
    });

    it('should handle request send failure', async () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.01); // Less than 0.05, triggers send failure
      
      const requestPromise = handler.sendRequest('connector-123', 'test.method', {});
      jest.advanceTimersByTime(20);
      
      await expect(requestPromise).rejects.toThrow('Request send failed');
      
      const stats = handler.getStats();
      expect(stats.failedRequests).toBe(1);
      
      Math.random = originalRandom;
    });

    it('should update connection activity on successful request', async () => {
      const initialActivity = connection.lastActivity;
      
      const requestPromise = handler.sendRequest('connector-123', 'test.method', {});
      jest.advanceTimersByTime(150);
      await requestPromise;
      
      expect(connection.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
      expect(connection.requestCount).toBe(1);
    });
  });

  describe('handleResponse', () => {
    it('should handle successful response', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      await connectionPromise;
      
      const requestPromise = handler.sendRequest('connector-123', 'test.method', {});
      
      // Manually handle response
      const response: MCPResponse = {
        jsonrpc: '2.0',
        id: 'test-request-id',
        result: { data: 'test-data' }
      };
      
      // Get the pending request ID
      const pendingRequests = (handler as any).pendingRequests;
      const requestId = Array.from(pendingRequests.keys())[0];
      
      handler.handleResponse({ ...response, id: requestId });
      
      jest.advanceTimersByTime(150);
      const result = await requestPromise;
      
      expect(result).toEqual({ data: 'test-data' });
    });

    it('should handle error response', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      await connectionPromise;
      
      const requestPromise = handler.sendRequest('connector-123', 'test.method', {});
      
      const pendingRequests = (handler as any).pendingRequests;
      const requestId = Array.from(pendingRequests.keys())[0];
      
      const errorResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -1,
          message: 'Test error'
        }
      };
      
      handler.handleResponse(errorResponse);
      
      await expect(requestPromise).rejects.toThrow('MCP Error: Test error');
    });

    it('should handle response for unknown request', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const response: MCPResponse = {
        jsonrpc: '2.0',
        id: 'unknown-request-id',
        result: {}
      };
      
      handler.handleResponse(response);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MCPProtocolHandler] Received response for unknown request: unknown-request-id'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      await connectionPromise;
    });

    it('should perform successful health check', async () => {
      const healthPromise = handler.healthCheck('connector-123');
      jest.advanceTimersByTime(150);
      
      const health = await healthPromise;
      
      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
      expect(health.error).toBeUndefined();
    });

    it('should handle health check failure', async () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.01); // Trigger request failure
      
      const healthPromise = handler.healthCheck('connector-123');
      jest.advanceTimersByTime(20);
      
      const health = await healthPromise;
      
      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
      expect(health.latency).toBeUndefined();
      
      Math.random = originalRandom;
    });
  });

  describe('reconnect', () => {
    it('should successfully reconnect to server', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection = await connectionPromise;
      
      // Simulate connection failure
      (connection as any).status = 'error';
      
      const reconnectedSpy = jest.fn();
      handler.on('reconnected', reconnectedSpy);
      
      const reconnectPromise = handler.reconnect(connection.id);
      jest.advanceTimersByTime(200);
      
      const reconnectedConnection = await reconnectPromise;
      
      expect(reconnectedConnection.status).toBe('connected');
      expect(reconnectedConnection.reconnectAttempts).toBe(0); // Reset on success
      expect(reconnectedSpy).toHaveBeenCalled();
    });

    it('should handle max reconnection attempts reached', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection = await connectionPromise;
      
      // Set connection to max attempts
      (connection as any).reconnectAttempts = mockConfig.maxReconnectAttempts;
      
      await expect(handler.reconnect(connection.id)).rejects.toThrow(
        'Max reconnection attempts reached for mcp-starship-456-github'
      );
    });

    it('should handle reconnection failure and schedule retry', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection = await connectionPromise;
      
      const reconnectionFailedSpy = jest.fn();
      handler.on('reconnectionFailed', reconnectionFailedSpy);
      
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.05); // Trigger connection failure
      
      const reconnectPromise = handler.reconnect(connection.id);
      jest.advanceTimersByTime(200);
      
      await expect(reconnectPromise).rejects.toThrow('Connection refused');
      expect(reconnectionFailedSpy).toHaveBeenCalled();
      expect(connection.reconnectAttempts).toBe(1);
      
      Math.random = originalRandom;
    });
  });

  describe('getStats', () => {
    it('should return current statistics', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      await connectionPromise;
      
      const requestPromise = handler.sendRequest('connector-123', 'test.method', {});
      jest.advanceTimersByTime(150);
      await requestPromise;
      
      const stats = handler.getStats();
      
      expect(stats.totalConnections).toBe(1);
      expect(stats.activeConnections).toBe(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
      expect(stats.averageResponseTime).toBeGreaterThan(0);
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe('getActiveConnections', () => {
    it('should return only connected connections', async () => {
      const connectionPromise1 = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection1 = await connectionPromise1;
      
      const mockConnector2 = { ...mockConnector, id: 'connector-456', dockerServiceName: 'mcp-starship-456-slack' };
      const connectionPromise2 = handler.connect(mockConnector2);
      jest.advanceTimersByTime(200);
      await connectionPromise2;
      
      // Disconnect first connection
      await handler.disconnect(connection1.id);
      
      const activeConnections = handler.getActiveConnections();
      expect(activeConnections).toHaveLength(1);
      expect(activeConnections[0].connectorId).toBe('connector-456');
    });
  });

  describe('connection pool management', () => {
    it('should return connection pool usage', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      await connectionPromise;
      
      const poolUsage = handler.getConnectionPoolUsage();
      
      expect(poolUsage.used).toBe(1);
      expect(poolUsage.available).toBe(4); // 5 - 1
      expect(poolUsage.utilization).toBe(0.2); // 1/5
    });

    it('should set connection priority', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection = await connectionPromise;
      
      handler.setConnectionPriority(connection.id, 'high');
      
      expect((connection as any).priority).toBe('high');
    });
  });

  describe('bulk operations', () => {
    it('should connect to multiple servers', async () => {
      const connectors = [
        mockConnector,
        { ...mockConnector, id: 'connector-456', dockerServiceName: 'mcp-starship-456-slack' },
        { ...mockConnector, id: 'connector-789', dockerServiceName: 'mcp-starship-456-notion' }
      ];
      
      const resultPromise = handler.connectMultiple(connectors);
      jest.advanceTimersByTime(200);
      
      const result = await resultPromise;
      
      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it('should handle partial failures in bulk connect', async () => {
      const connectors = [
        mockConnector,
        { ...mockConnector, id: 'connector-456', dockerServiceName: undefined } // Invalid
      ];
      
      const result = await handler.connectMultiple(connectors);
      
      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.message).toContain('Docker service name is required');
    });

    it('should disconnect multiple connections', async () => {
      const connectionPromise1 = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection1 = await connectionPromise1;
      
      const mockConnector2 = { ...mockConnector, id: 'connector-456', dockerServiceName: 'mcp-starship-456-slack' };
      const connectionPromise2 = handler.connect(mockConnector2);
      jest.advanceTimersByTime(200);
      const connection2 = await connectionPromise2;
      
      await handler.disconnectMultiple([connection1.id, connection2.id]);
      
      const activeConnections = handler.getActiveConnections();
      expect(activeConnections).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      await connectionPromise;
      
      // Add pending request
      const requestPromise = handler.sendRequest('connector-123', 'test.method', {});
      
      await handler.shutdown();
      
      await expect(requestPromise).rejects.toThrow('Protocol handler is shutting down');
      
      const stats = handler.getStats();
      expect(stats.activeConnections).toBe(0);
    });
  });

  describe('heartbeat monitoring', () => {
    it('should perform heartbeat checks', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection = await connectionPromise;
      
      // Set last activity to be old
      connection.lastActivity = new Date(Date.now() - mockConfig.heartbeatInterval * 3);
      
      const healthCheckFailedSpy = jest.fn();
      handler.on('healthCheckFailed', healthCheckFailedSpy);
      
      // Trigger heartbeat
      jest.advanceTimersByTime(mockConfig.heartbeatInterval);
      
      // Let health check complete
      jest.advanceTimersByTime(150);
      
      // Should have performed health check but not failed (connection is healthy)
      expect(healthCheckFailedSpy).not.toHaveBeenCalled();
    });
  });

  describe('connection info', () => {
    it('should return detailed connection info', async () => {
      const connectionPromise = handler.connect(mockConnector);
      jest.advanceTimersByTime(200);
      const connection = await connectionPromise;
      
      // Send a request to update stats
      const requestPromise = handler.sendRequest('connector-123', 'test.method', {});
      jest.advanceTimersByTime(150);
      await requestPromise;
      
      const info = handler.getConnectionInfo(connection.id);
      
      expect(info).not.toBeNull();
      expect(info?.connection.id).toBe(connection.id);
      expect(info?.requestsPerMinute).toBeGreaterThanOrEqual(0);
      expect(info?.errorRate).toBe(0);
      expect(info?.averageResponseTime).toBeGreaterThan(0);
    });

    it('should return null for non-existent connection', () => {
      const info = handler.getConnectionInfo('non-existent-id');
      expect(info).toBeNull();
    });
  });
});