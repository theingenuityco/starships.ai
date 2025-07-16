import { Router } from 'express';
import { MCPService } from '../services/MCPService';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  mcpRateLimit,
  toolExecutionRateLimit,
  mcpSecurityHeaders,
  sanitizeMCPConfiguration,
  sanitizeToolExecution,
  auditMCPOperation
} from '../middleware/mcpSecurity';

const router: Router = Router();

// Apply security headers to all MCP routes
router.use(mcpSecurityHeaders);

// Configure MCP server for user
router.post('/configure',
  mcpRateLimit,
  authMiddleware,
  auditMCPOperation('mcp_configure'),
  sanitizeMCPConfiguration,
  async (req: Request, res: Response) => {
  try {
    const config = req.body as any;
    
    // Add user ID from auth context
    const mcpConfig = {
      ...config,
      userId: req.user!.id,
    };

    console.log(`[MCP] Configuring MCP server for user: ${req.user!.id}`);
    const mcpServer = await MCPService.createUserMCPServer(req.user!.id, mcpConfig);
    
    console.log(`[MCP] MCP server configured successfully: ${mcpServer.id}`);
    res.status(201).json({
      success: true,
      serverId: mcpServer.id,
      server: mcpServer
    });
  } catch (error) {
    console.error('Error configuring MCP server:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to configure MCP server',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get MCP server status for user
router.get('/status',
  mcpRateLimit,
  authMiddleware,
  auditMCPOperation('mcp_status'),
  async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    console.log(`[MCP] Getting MCP status for user: ${userId}`);
    
    const mcpServer = await MCPService.getMCPServerForUser(userId);
    
    if (!mcpServer) {
      res.status(404).json({ 
        error: 'No MCP server found for user',
        hasServer: false
      });
      return;
    }

    // Get available tools
    const tools = await MCPService.getUserAvailableTools(userId);

    res.json({
      hasServer: true,
      server: mcpServer,
      toolCount: tools.length,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        category: tool.category
      }))
    });
  } catch (error) {
    console.error('Error getting MCP status:', error);
    res.status(500).json({ 
      error: 'Failed to get MCP status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get available tools for user
router.get('/tools', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const agentId = req.query.agentId as string;
    
    console.log(`[MCP] Getting tools for user: ${userId}, agent: ${agentId || 'all'}`);
    
    let tools;
    if (agentId) {
      // Get tools available to specific agent
      tools = await MCPService.getAgentAvailableTools(userId, agentId);
    } else {
      // Get all user tools
      tools = await MCPService.getUserAvailableTools(userId);
    }

    res.json({
      tools,
      count: tools.length
    });
  } catch (error) {
    console.error('Error getting MCP tools:', error);
    res.status(500).json({ 
      error: 'Failed to get MCP tools',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Execute tool
router.post('/tools/execute',
  toolExecutionRateLimit,
  authMiddleware,
  auditMCPOperation('tool_execute'),
  sanitizeToolExecution,
  async (req: Request, res: Response) => {
  try {
    const toolCall = req.body as any;
    
    // Add user ID from auth context
    const toolCallWithUser = {
      ...toolCall,
      userId: req.user!.id,
    };

    console.log(`[MCP] Executing tool ${toolCall.toolName} for user: ${req.user!.id}, agent: ${toolCall.agentId}`);
    
    const result = await MCPService.executeToolWithPermissionAndCredentialCheck(
      req.user!.id,
      toolCall.agentId,
      toolCallWithUser
    );
    
    console.log(`[MCP] Tool execution ${result.success ? 'succeeded' : 'failed'}: ${toolCall.toolName}`);
    res.json(result);
  } catch (error) {
    console.error('Error executing MCP tool:', error);
    res.status(500).json({ 
      id: req.body.id || 'unknown',
      toolCallId: req.body.id || 'unknown',
      success: false,
      error: 'Failed to execute tool',
      message: error instanceof Error ? error.message : 'Unknown error',
      executionTime: 0,
      timestamp: new Date().toISOString()
    });
  }
});

// Get agent permissions
router.get('/agents/:agentId/permissions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const agentId = req.params.agentId;
    
    console.log(`[MCP] Getting permissions for agent: ${agentId}, user: ${userId}`);
    
    const tools = await MCPService.getAgentAvailableTools(userId, agentId);
    const allTools = await MCPService.getUserAvailableTools(userId);
    
    const permissions = allTools.map(tool => ({
      toolName: tool.name,
      description: tool.description,
      category: tool.category,
      hasPermission: tools.some(t => t.name === tool.name),
      hasCredentials: tools.some(t => t.name === tool.name) // If it's in available tools, it has credentials
    }));

    res.json({
      agentId,
      permissions,
      totalTools: allTools.length,
      allowedTools: tools.length
    });
  } catch (error) {
    console.error('Error getting agent permissions:', error);
    res.status(500).json({ 
      error: 'Failed to get agent permissions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Set agent permissions
router.post('/agents/:agentId/permissions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const agentId = req.params.agentId;
    const { toolNames } = req.body;
    
    if (!Array.isArray(toolNames)) {
      res.status(400).json({ error: 'toolNames must be an array' });
      return;
    }

    console.log(`[MCP] Setting permissions for agent: ${agentId}, tools: ${toolNames.join(', ')}`);
    
    await MCPService.setAgentPermissions(userId, {
      [agentId]: toolNames
    });

    res.json({
      success: true,
      agentId,
      toolNames,
      message: `Permissions updated for agent ${agentId}`
    });
  } catch (error) {
    console.error('Error setting agent permissions:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to set agent permissions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Set agent credentials
router.post('/agents/:agentId/credentials', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const agentId = req.params.agentId;
    const { toolCredentials } = req.body;
    
    if (!toolCredentials || typeof toolCredentials !== 'object') {
      res.status(400).json({ error: 'toolCredentials must be an object' });
      return;
    }

    console.log(`[MCP] Setting credentials for agent: ${agentId}, tools: ${Object.keys(toolCredentials).join(', ')}`);
    
    await MCPService.setAgentCredentials(userId, {
      [agentId]: toolCredentials
    });

    res.json({
      success: true,
      agentId,
      toolsConfigured: Object.keys(toolCredentials),
      message: `Credentials updated for agent ${agentId}`
    });
  } catch (error) {
    console.error('Error setting agent credentials:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to set agent credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  try {
    res.json({ 
      status: 'healthy',
      service: 'MCP API',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    console.error('MCP health check error:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;