import { getConnection } from '../connection';
import {
  Starship,
  StarshipRepository as StarshipRepositoryInterface,
  Agent,
  MCPServerOption,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based starship repository
 */
export class StarshipRepository implements StarshipRepositoryInterface {
  async findAll(): Promise<Starship[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC'
    );
    return result.map((record) => record.s);
  }

  async findById(id: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.id = $id RETURN s',
      { id }
    );
    return result[0]?.s || null;
  }

  async findBySlug(slug: string, ownerId: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
      { slug, ownerId }
    );
    return result[0]?.s || null;
  }

  async findByOwner(ownerId: string): Promise<Starship[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
      { ownerId }
    );
    return result.map((record) => record.s);
  }

  async create(
    entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt'>
  ): Promise<Starship> {
    const connection = getConnection();

    // Set maxAgents based on class
    const maxAgents = entity.class === 'scout' ? 3 : 6;

    // Generate unique slug if not provided
    const slug = entity.slug || (await this.generateUniqueSlug(entity.name, entity.ownerId));

    const starship: Starship = {
      ...entity,
      id: uuidv4(),
      slug,
      maxAgents,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await connection.executeWrite('CREATE (s:Starship $props) RETURN s', { props: starship });

    // Create relationship with owner
    await connection.executeWrite(
      `MATCH (u:User {id: $ownerId}), (s:Starship {id: $starshipId})
       CREATE (u)-[:OWNS {ownedSince: $timestamp}]->(s)`,
      {
        ownerId: starship.ownerId,
        starshipId: starship.id,
        timestamp: starship.createdAt,
      }
    );

    return starship;
  }

  async update(id: string, updates: Partial<Starship>): Promise<Starship | null> {
    const connection = getConnection();

    // Handle slug updates
    if (updates.name && !updates.slug) {
      const existingStarship = await this.findById(id);
      if (existingStarship) {
        updates.slug = await this.generateUniqueSlug(updates.name, existingStarship.ownerId);
      }
    }

    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const result = await connection.executeWrite<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.id = $id SET s += $updates RETURN s',
      { id, updates: updateProps }
    );

    return result[0]?.s || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  async getDeployedAgents(starshipId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       RETURN a ORDER BY a.name`,
      { starshipId }
    );
    return result.map((record) => record.a);
  }

  async deployAgent(starshipId: string, agentId: string): Promise<boolean> {
    const connection = getConnection();

    // Check if starship has available slots
    const availableSlots = await this.getAvailableSlots(starshipId);
    if (availableSlots <= 0) {
      throw new Error('No available agent slots on this starship');
    }

    // Check if agent is already deployed
    const existingDeployment = await connection.executeQuery(
      `MATCH (s:Starship {id: $starshipId})<-[r:DEPLOYED_ON]-(a:Agent {id: $agentId})
       RETURN r`,
      { starshipId, agentId }
    );

    if (existingDeployment.length > 0) {
      throw new Error('Agent is already deployed on this starship');
    }

    // Deploy agent
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
       CREATE (a)-[:DEPLOYED_ON {
         deployedAt: $timestamp,
         isActive: true
       }]->(s)`,
      {
        starshipId,
        agentId,
        timestamp: new Date().toISOString(),
      }
    );

    return true;
  }

  async removeAgent(starshipId: string, agentId: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (s:Starship {id: $starshipId})<-[r:DEPLOYED_ON]-(a:Agent {id: $agentId})
       DELETE r
       RETURN count(r) as deletedCount`,
      { starshipId, agentId }
    );

    return result[0]?.deletedCount > 0;
  }

  async getAvailableSlots(starshipId: string): Promise<number> {
    const connection = getConnection();
    const result = await connection.executeQuery<{
      maxAgents: number;
      deployedCount: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})
       OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:Agent)
       RETURN s.maxAgents as maxAgents, count(a) as deployedCount`,
      { starshipId }
    );

    const { maxAgents, deployedCount } = result[0] || { maxAgents: 0, deployedCount: 0 };
    return maxAgents - Number(deployedCount);
  }

  async generateUniqueSlug(name: string, ownerId: string): Promise<string> {
    console.log('[STARSHIP-SLUG] Starting slug generation for name:', name, 'ownerId:', ownerId);

    // Create base slug from name
    const baseSlug = this.createSlugFromName(name);
    console.log('[STARSHIP-SLUG] Base slug created:', baseSlug);

    // Check if base slug is available
    console.log('[STARSHIP-SLUG] Checking if base slug is available...');
    if (await this.isSlugAvailable(baseSlug, ownerId)) {
      console.log('[STARSHIP-SLUG] Base slug is available, returning:', baseSlug);
      return baseSlug;
    }

    console.log('[STARSHIP-SLUG] Base slug not available, using optimized generation...');

    // OPTIMIZED: Use random suffix instead of sequential to avoid collisions
    const timestamp = Date.now().toString(36); // Base36 timestamp
    const randomSuffix = Math.random().toString(36).substring(2, 8); // 6 random chars
    const optimizedSlug = `${baseSlug}-${timestamp}-${randomSuffix}`;

    // Double-check the optimized slug is available
    if (await this.isSlugAvailable(optimizedSlug, ownerId)) {
      console.log('[STARSHIP-SLUG] Optimized slug available:', optimizedSlug);
      return optimizedSlug;
    }

    // FALLBACK: If somehow still collides, use UUID suffix
    const uuidSuffix = require('uuid').v4().substring(0, 8);
    const fallbackSlug = `${baseSlug}-${uuidSuffix}`;

    console.log('[STARSHIP-SLUG] Using fallback slug:', fallbackSlug);
    return fallbackSlug;
  }

  async isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean> {
    const connection = getConnection();

    let query = 'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId';
    const params: any = { slug, ownerId };

    if (excludeId) {
      query += ' AND s.id <> $excludeId';
      params.excludeId = excludeId;
    }

    query += ' RETURN count(s) as count';

    const result = await connection.executeQuery<{ count: number }>(query, params);
    return result[0]?.count === 0;
  }

  createSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  // NEW: MCP Server Connector Methods

  async getConnectedMCPServers(starshipId: string): Promise<MCPServerOption[]> {
    if (!starshipId) {
      throw new Error('Starship ID parameter is required');
    }

    const connection = getConnection();
    try {
      console.log(`[StarshipRepository] Getting connected MCP servers for starship: ${starshipId}`);

      const result = await connection.executeQuery<{
        m: MCPServerOption;
        r: { connectedAt: string; isActive: boolean };
      }>(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_CONNECTOR]->(m:MCPServerOption)
         WHERE r.isActive = true
         RETURN m, r
         ORDER BY r.connectedAt DESC`,
        { starshipId }
      );

      const connectedServers = result.map((record) => ({
        ...record.m,
        // Add relationship metadata for potential future use
        _connectionMetadata: {
          connectedAt: record.r.connectedAt,
          isActive: record.r.isActive,
        },
      }));

      console.log(
        `[StarshipRepository] Found ${connectedServers.length} connected MCP servers for starship: ${starshipId}`
      );
      return connectedServers;
    } catch (error) {
      console.error(
        `[StarshipRepository] Error getting connected MCP servers for starship ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to retrieve connected MCP servers: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async connectMCPServer(starshipId: string, mcpServerId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID parameter is required');
    }
    if (!mcpServerId) {
      throw new Error('MCP Server ID parameter is required');
    }

    const connection = getConnection();
    try {
      console.log(
        `[StarshipRepository] Connecting MCP server ${mcpServerId} to starship ${starshipId}`
      );

      // Use MERGE to handle concurrency - this is atomic and prevents race conditions
      const result = await connection.executeWrite<{
        starshipExists: number;
        mcpServerExists: number;
        connectionCreated: boolean;
        wasExisting: boolean;
      }>(
        `// First validate both entities exist
         MATCH (s:Starship {id: $starshipId})
         WITH s, count(s) as starshipExists
         MATCH (m:MCPServerOption {id: $mcpServerId})
         WITH s, m, starshipExists, count(m) as mcpServerExists
         
         // Use MERGE to atomically create or find existing relationship
         MERGE (s)-[r:HAS_CONNECTOR]->(m)
         ON CREATE SET
           r.connectedAt = $timestamp,
           r.isActive = true
         ON MATCH SET
           r.isActive = true  // Reactivate if it was inactive
         
         // Determine if this was a new connection or existing
         WITH s, m, r, starshipExists, mcpServerExists,
              CASE WHEN r.connectedAt = $timestamp THEN true ELSE false END as connectionCreated,
              CASE WHEN r.connectedAt <> $timestamp THEN true ELSE false END as wasExisting
         
         RETURN starshipExists, mcpServerExists, connectionCreated, wasExisting`,
        {
          starshipId,
          mcpServerId,
          timestamp: new Date().toISOString(),
        }
      );

      const { starshipExists, mcpServerExists, connectionCreated, wasExisting } = result[0] || {};

      // Validate entities exist
      if (starshipExists === 0) {
        throw new Error(`Starship with ID ${starshipId} not found`);
      }
      if (mcpServerExists === 0) {
        throw new Error(`MCP Server with ID ${mcpServerId} not found`);
      }

      if (wasExisting) {
        console.log(
          `[StarshipRepository] MCP server ${mcpServerId} is already connected to starship ${starshipId}`
        );
        return false; // Idempotent - return false for duplicate connections
      }

      if (connectionCreated) {
        console.log(
          `[StarshipRepository] Successfully connected MCP server ${mcpServerId} to starship ${starshipId}`
        );
        return true;
      }

      // This shouldn't happen, but handle it gracefully
      console.log(
        `[StarshipRepository] Unexpected state when connecting ${mcpServerId} to starship ${starshipId}`
      );
      return false;
    } catch (error) {
      console.error(
        `[StarshipRepository] Error connecting MCP server ${mcpServerId} to starship ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to connect MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async disconnectMCPServer(starshipId: string, mcpServerId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID parameter is required');
    }
    if (!mcpServerId) {
      throw new Error('MCP Server ID parameter is required');
    }

    const connection = getConnection();
    try {
      console.log(
        `[StarshipRepository] Disconnecting MCP server ${mcpServerId} from starship ${starshipId}`
      );

      const result = await connection.executeWrite<{ deletedCount: number }>(
        `MATCH (s:Starship {id: $starshipId})-[r:HAS_CONNECTOR]->(m:MCPServerOption {id: $mcpServerId})
         WHERE r.isActive = true
         DELETE r
         RETURN count(r) as deletedCount`,
        { starshipId, mcpServerId }
      );

      const deletedCount = result[0]?.deletedCount || 0;
      const success = deletedCount > 0;

      if (success) {
        console.log(
          `[StarshipRepository] Successfully disconnected MCP server ${mcpServerId} from starship ${starshipId}`
        );
      } else {
        console.log(
          `[StarshipRepository] No active connection found between MCP server ${mcpServerId} and starship ${starshipId}`
        );
      }

      return success;
    } catch (error) {
      console.error(
        `[StarshipRepository] Error disconnecting MCP server ${mcpServerId} from starship ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to disconnect MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
