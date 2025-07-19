/**
 * MCP Server management routes for Aether Core
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { StarshipRepository, MCPServerOptionRepository } from '@starships/models';
import { authMiddleware } from '../middleware/auth';

const router: Router = Router();

// Temporary in-memory repositories until we connect the full dependency injection
// TODO: Replace with proper dependency injection pattern
let starshipRepo: StarshipRepository;
let mcpServerRepo: MCPServerOptionRepository;

export function initializeMCPServerRoutes(deps: {
  starshipRepository: StarshipRepository;
  mcpServerOptionRepository: MCPServerOptionRepository;
}) {
  starshipRepo = deps.starshipRepository;
  mcpServerRepo = deps.mcpServerOptionRepository;
}

// GET /mcp-servers - List all available MCP server options
router.get('/mcp-servers', authMiddleware, async (req: Request, res: Response) => {
  try {
    console.log('[MCP-SERVERS] Fetching all available MCP server options');

    const mcpServers = await mcpServerRepo.findAll();

    console.log(`[MCP-SERVERS] Found ${mcpServers.length} MCP server options`);

    res.json({ mcpServers });
  } catch (error) {
    console.error('[MCP-SERVERS] Error fetching MCP server options:', error);
    res.status(500).json({ error: 'Failed to fetch MCP server options' });
  }
});

// GET /starships/:id/connectors - Get connected MCP servers for starship
router.get('/starships/:id/connectors', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: starshipIdOrSlug } = req.params;
    const userId = req.user!.id;

    console.log(
      `[MCP-SERVERS] Fetching connectors for starship: ${starshipIdOrSlug}, user: ${userId}`
    );

    // Validate starship ID/slug
    if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
      res.status(400).json({ error: 'Starship ID or slug is required' });
      return;
    }

    // Try to find starship by ID first, then by slug
    let starship = await starshipRepo.findById(starshipIdOrSlug);
    if (!starship) {
      starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
    }

    if (!starship) {
      console.log(`[MCP-SERVERS] Starship not found: ${starshipIdOrSlug}`);
      res.status(404).json({ error: 'Starship not found' });
      return;
    }

    if (starship.ownerId !== userId) {
      console.log(
        `[MCP-SERVERS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
      );
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get connected MCP servers using the actual starship ID
    const connectedServers = await starshipRepo.getConnectedMCPServers(starship.id);

    // Transform the response to match the API specification
    const connectedConnectors = connectedServers.map((server) => ({
      id: server.id,
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env,
      connectedAt: (server as any)._connectionMetadata?.connectedAt || new Date().toISOString(),
      isActive: (server as any)._connectionMetadata?.isActive ?? true,
    }));

    console.log(
      `[MCP-SERVERS] Found ${connectedConnectors.length} connected connectors for starship: ${starship.id}`
    );

    res.json({
      starshipId: starship.id,
      connectedConnectors,
    });
  } catch (error) {
    console.error(`[MCP-SERVERS] Error fetching connectors for starship ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch starship connectors' });
  }
});

// POST /starships/:id/connectors/:mcpServerId - Connect MCP server to starship
router.post(
  '/starships/:id/connectors/:mcpServerId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, mcpServerId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[MCP-SERVERS] Connecting MCP server ${mcpServerId} to starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Validate parameters
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        res.status(400).json({ error: 'Starship ID or slug is required' });
        return;
      }

      if (!mcpServerId || mcpServerId.trim().length === 0) {
        res.status(400).json({ error: 'MCP Server ID is required' });
        return;
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[MCP-SERVERS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[MCP-SERVERS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify MCP server exists
      const mcpServer = await mcpServerRepo.findById(mcpServerId);
      if (!mcpServer) {
        console.log(`[MCP-SERVERS] MCP server not found: ${mcpServerId}`);
        res.status(404).json({ error: 'MCP server not found' });
        return;
      }

      // Check if already connected
      const connectedServers = await starshipRepo.getConnectedMCPServers(starship.id);
      const alreadyConnected = connectedServers.some((server) => server.id === mcpServerId);

      if (alreadyConnected) {
        console.log(
          `[MCP-SERVERS] MCP server ${mcpServerId} already connected to starship ${starship.id}`
        );
        res.status(409).json({ error: 'MCP server is already connected to this starship' });
        return;
      }

      // Connect the MCP server
      const connected = await starshipRepo.connectMCPServer(starship.id, mcpServerId);

      if (!connected) {
        console.error(
          `[MCP-SERVERS] Failed to connect MCP server ${mcpServerId} to starship ${starship.id}`
        );
        res.status(500).json({ error: 'Failed to connect MCP server' });
        return;
      }

      console.log(
        `[MCP-SERVERS] Successfully connected MCP server ${mcpServerId} to starship ${starship.id}`
      );

      res.status(201).json({
        message: 'MCP server connected successfully',
        starshipId: starship.id,
        mcpServerId,
        connectedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `[MCP-SERVERS] Error connecting MCP server ${req.params.mcpServerId} to starship ${req.params.id}:`,
        error
      );

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('already connected')) {
          res.status(409).json({ error: error.message });
          return;
        }
      }

      res.status(500).json({ error: 'Failed to connect MCP server' });
    }
  }
);

// DELETE /starships/:id/connectors/:mcpServerId - Disconnect MCP server from starship
router.delete(
  '/starships/:id/connectors/:mcpServerId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug, mcpServerId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[MCP-SERVERS] Disconnecting MCP server ${mcpServerId} from starship ${starshipIdOrSlug}, user: ${userId}`
      );

      // Validate parameters
      if (!starshipIdOrSlug || starshipIdOrSlug.trim().length === 0) {
        res.status(400).json({ error: 'Starship ID or slug is required' });
        return;
      }

      if (!mcpServerId || mcpServerId.trim().length === 0) {
        res.status(400).json({ error: 'MCP Server ID is required' });
        return;
      }

      // Try to find starship by ID first, then by slug
      let starship = await starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        console.log(`[MCP-SERVERS] Starship not found: ${starshipIdOrSlug}`);
        res.status(404).json({ error: 'Starship not found' });
        return;
      }

      if (starship.ownerId !== userId) {
        console.log(
          `[MCP-SERVERS] Access denied for starship ${starshipIdOrSlug}, user ${userId} is not owner`
        );
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Verify MCP server exists
      const mcpServer = await mcpServerRepo.findById(mcpServerId);
      if (!mcpServer) {
        console.log(`[MCP-SERVERS] MCP server not found: ${mcpServerId}`);
        res.status(404).json({ error: 'MCP server not found' });
        return;
      }

      // Disconnect the MCP server
      const disconnected = await starshipRepo.disconnectMCPServer(starship.id, mcpServerId);

      if (!disconnected) {
        console.log(
          `[MCP-SERVERS] No active connection found between MCP server ${mcpServerId} and starship ${starship.id}`
        );
        res.status(404).json({ error: 'MCP server is not connected to this starship' });
        return;
      }

      console.log(
        `[MCP-SERVERS] Successfully disconnected MCP server ${mcpServerId} from starship ${starship.id}`
      );

      res.json({
        message: 'MCP server disconnected successfully',
        starshipId: starship.id,
        mcpServerId,
        disconnectedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `[MCP-SERVERS] Error disconnecting MCP server ${req.params.mcpServerId} from starship ${req.params.id}:`,
        error
      );

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
      }

      res.status(500).json({ error: 'Failed to disconnect MCP server' });
    }
  }
);

export default router;
