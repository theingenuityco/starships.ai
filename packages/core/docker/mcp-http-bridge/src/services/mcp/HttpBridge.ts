/**
 * HttpBridge - HTTP to MCP Protocol Bridge Service
 * 
 * This service provides an HTTP interface for MCP (Model Context Protocol) servers,
 * translating HTTP requests to JSON-RPC protocol and managing the MCP server process lifecycle.
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import express, { Request, Response, Router } from 'express';
import { isValidJsonRpcMessage, parseJsonRpcMessage } from '../../utils/message-filter';
// UUID generation - use crypto.randomUUID if available, fallback to simple implementation
const uuidv4 = (() => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return () => crypto.randomUUID();
  }
  // Simple UUID v4 implementation
  return () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
})();
import { Readable, Writable } from 'stream';

export interface MCPBridgeConfig {
  mcpServerCmd: string;
  mcpServerArgs: string[];
  httpPort: number;
  healthCheckTimeout: number;
  logLevel: string;
  maxConcurrentRequests: number;
  environment?: Record<string, string>;
}

export interface PendingRequest {
  id: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
  method: string;
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

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

// MCP Error Code → HTTP Status Code mapping
const MCP_TO_HTTP_STATUS: Record<number, number> = {
  // MCP Standard Error Codes
  [-32700]: 400, // Parse error
  [-32600]: 400, // Invalid Request
  [-32601]: 404, // Method not found
  [-32602]: 422, // Invalid params
  [-32603]: 500, // Internal error
  
  // MCP Application Error Codes (1000-1999)
  [1001]: 401,   // Unauthorized (invalid API key)
  [1002]: 403,   // Forbidden (rate limited)
  [1003]: 404,   // Resource not found
  [1004]: 429,   // Too many requests
  [1005]: 503,   // Service unavailable
};

export class MCPHttpBridge extends EventEmitter {
  private mcpProcess: ChildProcess | null = null;
  private requestQueue: Map<string, PendingRequest> = new Map();
  private isInitialized: boolean = false;
  private config: MCPBridgeConfig;
  private activeRequests: number = 0;
  private processStartTime: number = 0;
  private restartCount: number = 0;
  private maxRestarts: number = 5;
  private lastError: string | null = null;
  private availableTools: string[] = [];
  private availableResources: string[] = [];
  private capabilities: any = {};
  private stdin: Writable | null = null;
  private stdout: Readable | null = null;
  private buffer: string = '';

  constructor(config: MCPBridgeConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the MCP server process
   */
  async startMCPServer(env?: Record<string, string>): Promise<void> {
    if (this.mcpProcess) {
      throw new Error('MCP server is already running');
    }

    console.log(`[HttpBridge] Starting MCP server: ${this.config.mcpServerCmd} ${this.config.mcpServerArgs.join(' ')}`);

    try {
      // Spawn the MCP server process
      this.mcpProcess = spawn(this.config.mcpServerCmd, this.config.mcpServerArgs, {
        env: { ...process.env, ...this.config.environment, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.stdin = this.mcpProcess.stdin!;
      this.stdout = this.mcpProcess.stdout!;
      
      this.processStartTime = Date.now();

      // Handle stdout data
      this.stdout.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      // Handle stderr
      this.mcpProcess.stderr?.on('data', (data: Buffer) => {
        const message = data.toString();
        if (this.config.logLevel === 'debug' || this.config.logLevel === 'info') {
          console.error(`[HttpBridge] MCP stderr: ${message}`);
        }
      });

      // Handle process exit
      this.mcpProcess.on('exit', (code, signal) => {
        console.log(`[HttpBridge] MCP process exited with code ${code}, signal ${signal}`);
        this.handleProcessExit(code || 0);
      });

      // Handle process errors
      this.mcpProcess.on('error', (error) => {
        console.error('[HttpBridge] MCP process error:', error);
        this.lastError = error.message;
        this.emit('error', error);
      });

      // Initialize the MCP connection
      await this.initializeMCP();
      
      console.log('[HttpBridge] MCP server started successfully');
    } catch (error) {
      console.error('[HttpBridge] Failed to start MCP server:', error);
      throw error;
    }
  }

  /**
   * Initialize MCP connection and discover capabilities
   */
  private async initializeMCP(): Promise<void> {
    try {
      console.log('[HttpBridge] Starting MCP initialization...');
      
      // Send initialize request
      const initResponse = await this.sendMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'http-bridge',
          version: '1.0.0'
        }
      });

      console.log('[HttpBridge] Initialize response received:', initResponse);
      this.capabilities = initResponse.capabilities || {};
      
      // Send initialized notification
      await this.sendMCPNotification('initialized', {});

      // Discover available tools
      try {
        const toolsResponse = await this.sendMCPRequest('tools/list', {});
        this.availableTools = (toolsResponse.tools || []).map((t: any) => t.name);
        console.log(`[HttpBridge] Discovered ${this.availableTools.length} tools`);
      } catch (error) {
        console.warn('[HttpBridge] Failed to list tools:', error);
      }

      // Discover available resources
      try {
        const resourcesResponse = await this.sendMCPRequest('resources/list', {});
        this.availableResources = (resourcesResponse.resources || []).map((r: any) => r.uri);
        console.log(`[HttpBridge] Discovered ${this.availableResources.length} resources`);
      } catch (error) {
        console.warn('[HttpBridge] Failed to list resources:', error);
      }

      this.isInitialized = true;
      console.log('[HttpBridge] MCP initialization completed successfully');
    } catch (error) {
      console.error('[HttpBridge] Failed to initialize MCP:', error);
      console.error('[HttpBridge] Process state during error:', {
        processExists: !!this.mcpProcess,
        processKilled: this.mcpProcess?.killed,
        processPid: this.mcpProcess?.pid,
        activeRequests: this.activeRequests,
        queueSize: this.requestQueue.size,
        isInitialized: this.isInitialized
      });
      throw error;
    }
  }

  /**
   * Stop the MCP server process
   */
  async stopMCPServer(): Promise<void> {
    if (!this.mcpProcess) {
      return;
    }

    console.log('[HttpBridge] Stopping MCP server...');

    // Cancel all pending requests
    for (const [id, request] of this.requestQueue) {
      clearTimeout(request.timeout);
      request.reject(new Error('MCP server is shutting down'));
    }
    this.requestQueue.clear();

    // Kill the process
    this.mcpProcess.kill('SIGTERM');
    
    // Give it time to gracefully shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.mcpProcess) {
          this.mcpProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.mcpProcess!.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.mcpProcess = null;
    this.isInitialized = false;
    this.stdin = null;
    this.stdout = null;
    this.buffer = '';
  }

  /**
   * Restart the MCP server process
   */
  async restartMCPServer(): Promise<void> {
    console.log('[HttpBridge] Restarting MCP server...');
    await this.stopMCPServer();
    await this.startMCPServer();
  }

  /**
   * Process buffered stdout data for complete JSON-RPC messages
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim() && isValidJsonRpcMessage(line)) {
        const response = parseJsonRpcMessage(line);
        if (response) {
          this.handleMCPResponse(response as MCPResponse);
        }
      }
    }
  }

  /**
   * Send MCP request and wait for response
   */
  async sendMCPRequest(method: string, params: any, requestId?: string): Promise<any> {
    if (!this.mcpProcess) {
      throw new Error('MCP server is not running');
    }

    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      throw new Error('Too many concurrent requests');
    }

    const id = requestId || uuidv4();
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      // Use longer timeout for initialization and tools/list requests
      const timeoutDuration = method === 'initialize' || method === 'tools/list' 
        ? this.config.healthCheckTimeout * 3  // 3x longer for initialization
        : this.config.healthCheckTimeout;
      
      // Create timeout
      const timeout = setTimeout(() => {
        this.requestQueue.delete(id);
        this.activeRequests--;
        reject(new Error(`Request timeout for method: ${method} (${timeoutDuration}ms)`));
      }, timeoutDuration);

      // Queue the request
      this.requestQueue.set(id, {
        id,
        resolve,
        reject,
        timeout,
        timestamp: Date.now(),
        method
      });

      this.activeRequests++;

      // Send the request
      try {
        this.stdin!.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.requestQueue.delete(id);
        this.activeRequests--;
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Send MCP notification (no response expected)
   */
  private async sendMCPNotification(method: string, params: any): Promise<void> {
    if (!this.mcpProcess) {
      throw new Error('MCP server is not running');
    }

    const notification: MCPRequest = {
      jsonrpc: '2.0',
      id: null as any,
      method,
      params
    };

    this.stdin!.write(JSON.stringify(notification) + '\n');
  }

  /**
   * Handle MCP response
   */
  private handleMCPResponse(response: MCPResponse): void {
    const id = String(response.id);
    const pendingRequest = this.requestQueue.get(id);

    if (!pendingRequest) {
      // Could be a notification or unsolicited message
      if (this.config.logLevel === 'debug') {
        console.log('[HttpBridge] Received unsolicited MCP message:', response);
      }
      return;
    }

    // Remove from queue
    this.requestQueue.delete(id);
    this.activeRequests--;
    clearTimeout(pendingRequest.timeout);

    // Resolve or reject based on response
    if (response.error) {
      pendingRequest.reject(response.error);
    } else {
      pendingRequest.resolve(response.result);
    }
  }

  /**
   * Handle MCP error
   */
  private handleMCPError(error: MCPError): void {
    console.error('[HttpBridge] MCP error:', error);
    this.lastError = error.message;
    this.emit('mcp-error', error);
  }

  /**
   * Map MCP error to HTTP status and message
   */
  private mapMCPErrorToHTTP(mcpError: MCPError): { status: number; message: string } {
    const status = MCP_TO_HTTP_STATUS[mcpError.code] || 500;
    return {
      status,
      message: mcpError.message || 'Unknown error'
    };
  }

  /**
   * Handle process exit with restart logic
   */
  private async handleProcessExit(code: number): Promise<void> {
    this.mcpProcess = null;
    this.isInitialized = false;
    
    // Don't restart if it was a clean shutdown
    if (code === 0) {
      console.log('[HttpBridge] MCP process exited cleanly');
      return;
    }

    // Check if we should restart
    if (this.restartCount < this.maxRestarts) {
      this.restartCount++;
      const backoffTime = Math.min(1000 * Math.pow(2, this.restartCount - 1), 30000);
      
      console.log(`[HttpBridge] Restarting MCP server in ${backoffTime}ms (attempt ${this.restartCount}/${this.maxRestarts})`);
      
      setTimeout(async () => {
        try {
          await this.startMCPServer();
          // Reset restart count on successful start
          this.restartCount = 0;
        } catch (error) {
          console.error('[HttpBridge] Failed to restart MCP server:', error);
          this.emit('fatal-error', error);
        }
      }, backoffTime);
    } else {
      console.error(`[HttpBridge] Max restart attempts exceeded (${this.maxRestarts})`);
      this.emit('fatal-error', new Error('Max restart attempts exceeded'));
    }
  }

  /**
   * HTTP endpoint handlers
   */
  
  async listTools(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isInitialized) {
        res.status(503).json({
          error: {
            code: 1005,
            message: 'MCP server is not initialized',
            type: 'service_unavailable'
          }
        });
        return;
      }

      const result = await this.sendMCPRequest('tools/list', {});
      res.json({
        tools: result.tools || [],
        execution_time_ms: Date.now() - this.processStartTime
      });
    } catch (error: any) {
      const httpError = error.code ? this.mapMCPErrorToHTTP(error) : { status: 500, message: error.message };
      res.status(httpError.status).json({
        error: {
          code: error.code || -32603,
          message: httpError.message,
          type: 'mcp_error'
        },
        mcp_error: error
      });
    }
  }

  async callTool(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isInitialized) {
        res.status(503).json({
          error: {
            code: 1005,
            message: 'MCP server is not initialized',
            type: 'service_unavailable'
          }
        });
        return;
      }

      const { toolName } = req.params;
      const { arguments: args } = req.body;

      const startTime = Date.now();
      const result = await this.sendMCPRequest('tools/call', {
        name: toolName,
        arguments: args
      });

      res.json({
        result: result.content || result,
        execution_time_ms: Date.now() - startTime
      });
    } catch (error: any) {
      const httpError = error.code ? this.mapMCPErrorToHTTP(error) : { status: 500, message: error.message };
      res.status(httpError.status).json({
        error: {
          code: error.code || -32603,
          message: httpError.message,
          type: 'mcp_error'
        },
        mcp_error: error
      });
    }
  }

  async listResources(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isInitialized) {
        res.status(503).json({
          error: {
            code: 1005,
            message: 'MCP server is not initialized',
            type: 'service_unavailable'
          }
        });
        return;
      }

      const result = await this.sendMCPRequest('resources/list', {});
      res.json({
        resources: result.resources || [],
        execution_time_ms: Date.now() - this.processStartTime
      });
    } catch (error: any) {
      const httpError = error.code ? this.mapMCPErrorToHTTP(error) : { status: 500, message: error.message };
      res.status(httpError.status).json({
        error: {
          code: error.code || -32603,
          message: httpError.message,
          type: 'mcp_error'
        },
        mcp_error: error
      });
    }
  }

  async getResource(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isInitialized) {
        res.status(503).json({
          error: {
            code: 1005,
            message: 'MCP server is not initialized',
            type: 'service_unavailable'
          }
        });
        return;
      }

      const { uri } = req.params;
      const startTime = Date.now();
      
      const result = await this.sendMCPRequest('resources/read', { uri });
      res.json({
        contents: result.contents || [],
        execution_time_ms: Date.now() - startTime
      });
    } catch (error: any) {
      const httpError = error.code ? this.mapMCPErrorToHTTP(error) : { status: 500, message: error.message };
      res.status(httpError.status).json({
        error: {
          code: error.code || -32603,
          message: httpError.message,
          type: 'mcp_error'
        },
        mcp_error: error
      });
    }
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    const status = this.getHealthStatus();
    const httpStatus = status.status === 'healthy' ? 200 : 503;
    res.status(httpStatus).json(status);
  }

  async validateConfig(req: Request, res: Response): Promise<void> {
    try {
      if (!this.isInitialized) {
        res.status(503).json({
          error: {
            code: 1005,
            message: 'MCP server is not initialized',
            type: 'service_unavailable'
          }
        });
        return;
      }

      // Try to call a simple method to validate the configuration
      const startTime = Date.now();
      await this.sendMCPRequest('tools/list', {});
      
      res.json({
        valid: true,
        message: 'Configuration is valid',
        execution_time_ms: Date.now() - startTime
      });
    } catch (error: any) {
      res.status(400).json({
        valid: false,
        message: error.message || 'Configuration validation failed',
        error: error
      });
    }
  }

  async getStatus(req: Request, res: Response): Promise<void> {
    res.json({
      status: this.isInitialized ? 'running' : 'stopped',
      initialized: this.isInitialized,
      uptime_ms: this.mcpProcess ? Date.now() - this.processStartTime : 0,
      restart_count: this.restartCount,
      active_requests: this.activeRequests,
      capabilities: this.capabilities,
      available_tools: this.availableTools,
      available_resources: this.availableResources,
      last_error: this.lastError
    });
  }

  async getCapabilities(req: Request, res: Response): Promise<void> {
    res.json({
      capabilities: this.capabilities,
      tools: this.availableTools,
      resources: this.availableResources
    });
  }

  /**
   * Get health status
   */
  private getHealthStatus(): any {
    const now = new Date();
    const isHealthy = this.isInitialized && this.mcpProcess !== null;
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: now.toISOString(),
      checks: {
        mcp_process: this.mcpProcess ? 'running' : 'stopped',
        mcp_protocol: this.isInitialized ? 'responsive' : 'not_initialized',
        api_validation: this.availableTools.length > 0 ? 'valid' : 'no_tools',
        response_time_ms: this.activeRequests > 0 ? 'measuring' : 0
      },
      tools: this.availableTools,
      resources: this.availableResources,
      last_error: this.lastError,
      restart_count: this.restartCount,
      uptime_ms: this.mcpProcess ? Date.now() - this.processStartTime : 0
    };
  }

  /**
   * Create Express router for HTTP endpoints
   */
  createRouter(): Router {
    const router = Router();

    // Bind all methods to preserve 'this' context
    router.get('/health', this.healthCheck.bind(this));
    router.get('/tools', this.listTools.bind(this));
    router.post('/tools/:toolName', this.callTool.bind(this));
    router.get('/resources', this.listResources.bind(this));
    router.get('/resources/:uri', this.getResource.bind(this));
    router.post('/validate', this.validateConfig.bind(this));
    router.get('/status', this.getStatus.bind(this));
    router.get('/capabilities', this.getCapabilities.bind(this));

    return router;
  }
}