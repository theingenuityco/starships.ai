/**
 * MCP Server template management routes for Aether Core
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { MCPServerOptionRepository } from '@starships/models';
import { authMiddleware } from '../middleware/auth';

const router: Router = Router();

// Temporary in-memory repositories until we connect the full dependency injection
// TODO: Replace with proper dependency injection pattern
let mcpServerRepo: MCPServerOptionRepository;

export function initializeMCPServerRoutes(deps: {
  mcpServerOptionRepository: MCPServerOptionRepository;
}) {
  mcpServerRepo = deps.mcpServerOptionRepository;
}

// GET /mcp-servers - List all available MCP server templates
router.get('/mcp-servers', authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log('[MCP-SERVERS] Fetching all available MCP server templates');

    const mcpServers = await mcpServerRepo.findAll();

    console.log(`[MCP-SERVERS] Found ${mcpServers.length} MCP server templates`);

    res.json({ mcpServers });
  } catch (error) {
    console.error('[MCP-SERVERS] Error fetching MCP server templates:', error);
    res.status(500).json({ error: 'Failed to fetch MCP server templates' });
  }
});

// GET /mcp-servers/:id - Get specific MCP server template
router.get('/mcp-servers/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`[MCP-SERVERS] Fetching MCP server template: ${id}`);

    // Validate parameter
    if (!id || id.trim().length === 0) {
      res.status(400).json({ error: 'MCP Server template ID is required' });
      return;
    }

    const mcpServer = await mcpServerRepo.findById(id);

    if (!mcpServer) {
      console.log(`[MCP-SERVERS] MCP server template not found: ${id}`);
      res.status(404).json({ error: 'MCP server template not found' });
      return;
    }

    console.log(`[MCP-SERVERS] Found MCP server template: ${mcpServer.name}`);

    res.json({ mcpServer });
  } catch (error) {
    console.error(`[MCP-SERVERS] Error fetching MCP server template ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch MCP server template' });
  }
});

export default router;
