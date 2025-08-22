import { getConnection } from '../connection';
import {
  Starship,
  StarshipRepository as StarshipRepositoryInterface,
  StarshipClass,
  StarshipStatus,
  BillingPeriod,
  Agent,
  MCPServerOption,
  MCPServerConnector,
  MCPServerConnectorRepository,
} from '../types';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based starship repository
 */
export class StarshipRepository extends BaseRepository implements StarshipRepositoryInterface {
  private mcpServerConnectorRepository: MCPServerConnectorRepository;

  constructor(mcpServerConnectorRepository?: MCPServerConnectorRepository) {
    super('StarshipRepository');
    // For backward compatibility, we'll lazy-load the repository if not provided
    this.mcpServerConnectorRepository =
      mcpServerConnectorRepository as MCPServerConnectorRepository;
  }

  /**
   * Validate UUID format
   */
  private validateUUID(id: string, fieldName: string): void {
    if (!id || typeof id !== 'string') {
      this.handleValidationError([{ field: fieldName, message: `${fieldName} is required and must be a string` }]);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      this.handleValidationError([{ field: fieldName, message: `${fieldName} must be a valid UUID format` }]);
    }
  }

  /**
   * Validate starship class
   */
  private validateStarshipClass(starshipClass: Starship['class']): void {
    const validClasses: Starship['class'][] = ['scout', 'cruiser', 'draught'];
    if (!validClasses.includes(starshipClass)) {
      this.handleValidationError([{ 
        field: 'class', 
        message: `Starship class must be one of: ${validClasses.join(', ')}. Got: ${starshipClass}`,
        value: starshipClass
      }]);
    }
  }

  /**
   * Validate starship status
   */
  private validateStarshipStatus(status: Starship['status']): void {
    const validStatuses: Starship['status'][] = ['active', 'inactive', 'restricted', 'disabled', 'pending_payment'];
    if (!validStatuses.includes(status)) {
      this.handleValidationError([{ 
        field: 'status', 
        message: `Starship status must be one of: ${validStatuses.join(', ')}. Got: ${status}`,
        value: status
      }]);
    }
  }


  /**
   * Get the MCPServerConnectorRepository instance, creating it if needed
   * This ensures backward compatibility while supporting dependency injection
   */
  private getMCPServerConnectorRepository(): MCPServerConnectorRepository {
    if (!this.mcpServerConnectorRepository) {
      // Import here to avoid circular dependencies
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MCPServerConnectorRepository } = require('./MCPServerConnectorRepository');
      this.mcpServerConnectorRepository = new MCPServerConnectorRepository();
    }
    return this.mcpServerConnectorRepository;
  }
  async findAll(): Promise<Starship[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC'
      );
      return result.map((record) => record.s);
    }, 'findAll', 'Starship');
  }

  async findById(id: string): Promise<Starship | null> {
    this.validateRequired({ id }, ['id'], 'findById');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.id = $id RETURN s',
        { id }
      );
      return result[0]?.s || null;
    }, 'findById', 'Starship', id);
  }

  async findBySlug(slug: string, ownerId: string): Promise<Starship | null> {
    this.validateRequired({ slug, ownerId }, ['slug', 'ownerId'], 'findBySlug');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
        { slug, ownerId }
      );
      return result[0]?.s || null;
    }, 'findBySlug', 'Starship', slug);
  }

  async findByOwner(ownerId: string): Promise<Starship[]> {
    this.validateRequired({ ownerId }, ['ownerId'], 'findByOwner');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
        { ownerId }
      );
      return result.map((record) => record.s);
    }, 'findByOwner', 'Starship');
  }

  async create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & { slug?: string }): Promise<Starship> {
    this.validateRequired(entity, ['name', 'ownerId', 'class'], 'create');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();

      // Set maxAgents based on class (Scout: 3, Cruiser: 5, Draught: 10)
      const maxAgents = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 5 : 10;
      
      // Set maxActiveMissions based on class (Scout: 3, Cruiser: 6, Draught: 10)
      const maxActiveMissions = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 6 : 10;
      
      // Generate unique slug if not provided
      const slug = entity.slug || await this.generateUniqueSlug(entity.name, entity.ownerId);
      
      // Validate status using the validation method
      if (entity.status) {
        this.validateStarshipStatus(entity.status);
      }
      
      const starship: Starship = {
        ...entity,
        id: uuidv4(),
        slug,
        maxAgents,
        maxActiveMissions,
        status: entity.status || 'active', // Default to active
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
    }, 'create', 'Starship');
  }

  async update(id: string, updates: Partial<Starship>): Promise<Starship | null> {
    this.validateRequired({ id }, ['id'], 'update');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();

      // Handle slug updates
      if (updates.name && !updates.slug) {
        const existingStarship = await this.findById(id);
        if (existingStarship) {
          updates.slug = await this.generateUniqueSlug(updates.name, existingStarship.ownerId);
        }
      }
      
      // Validate status using the validation method
      if (updates.status) {
        this.validateStarshipStatus(updates.status);
      }
      
      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const result = await connection.executeWrite<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.id = $id SET s += $updates RETURN s',
        { id, updates: updateProps }
      );

      return result[0]?.s || null;
    }, 'update', 'Starship', id);
  }

  async delete(id: string): Promise<boolean> {
    this.validateRequired({ id }, ['id'], 'delete');
    
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
        { id }
      );

      return result[0]?.deletedCount > 0;
    }, 'delete', 'Starship', id);
  }

  async getDeployedAgents(starshipId: string): Promise<Agent[]> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       RETURN a ORDER BY a.name`,
      { starshipId }
    );
    return result.map((record) => record.a);
  }

  async deployAgent(starshipId: string, agentId: string): Promise<boolean> {
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    const connection = getConnection();

    // Check if starship has available slots
    const availableSlots = await this.getAvailableSlots(starshipId);
    if (availableSlots <= 0) {
      throw new Error('No available slots on this starship');
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
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }
    if (!agentId) {
      throw new Error('Agent ID is required');
    }

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
    if (!starshipId) {
      throw new Error('Starship ID is required');
    }

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


  async updateStatus(starshipId: string, status: Starship['status']): Promise<boolean> {
    const connection = getConnection();
    
    // Validate status using the validation method
    this.validateStarshipStatus(status);
    
    const result = await connection.executeWrite<{ count: number }>(
      `MATCH (s:Starship) WHERE s.id = $starshipId
       SET s.status = $status, s.updatedAt = $timestamp
       RETURN count(s) as count`,
      {
        starshipId,
        status,
        timestamp: new Date().toISOString()
      }
    );
    
    return result[0]?.count > 0;
  }

  async generateUniqueSlug(name: string, ownerId: string): Promise<string> {
    if (!name) {
      throw new Error('Name parameter is required');
    }
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const uuidSuffix = require('uuid').v4().substring(0, 8);
    const fallbackSlug = `${baseSlug}-${uuidSuffix}`;

    console.log('[STARSHIP-SLUG] Using fallback slug:', fallbackSlug);
    return fallbackSlug;
  }

  async isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean> {
    if (!slug) {
      throw new Error('Slug parameter is required');
    }
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

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

  // NEW: Updated MCP Server Connector Instance Methods

  /**
   * Get all connector instances deployed on a starship
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to array of connector instances
   */
  async getConnectorInstances(starshipId: string): Promise<MCPServerConnector[]> {
    if (!starshipId) {
      throw new Error('Starship ID parameter is required');
    }

    try {
      console.log(`[StarshipRepository] Getting connector instances for starship: ${starshipId}`);

      // Validate starship exists
      const starship = await this.findById(starshipId);
      if (!starship) {
        throw new Error(`Starship with ID ${starshipId} not found`);
      }

      // Use MCPServerConnectorRepository to get connector instances
      const mcpConnectorRepo = this.getMCPServerConnectorRepository();
      const connectorInstances = await mcpConnectorRepo.findByStarship(starshipId);

      console.log(
        `[StarshipRepository] Found ${connectorInstances.length} connector instances for starship: ${starshipId}`
      );
      return connectorInstances;
    } catch (error) {
      console.error(
        `[StarshipRepository] Error getting connector instances for starship ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to retrieve connector instances: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a new connector instance from a template and deploy it on a starship
   * @param starshipId - The ID of the starship
   * @param templateId - The ID of the MCP server template
   * @returns Promise resolving to the created connector instance
   */
  async createConnectorInstance(
    starshipId: string,
    templateId: string
  ): Promise<MCPServerConnector> {
    return this.executeWithErrorHandling(async () => {
      // Enhanced validation
      this.validateUUID(starshipId, 'starshipId');
      this.validateUUID(templateId, 'templateId');

      console.log(
        `[StarshipRepository] Creating connector instance from template ${templateId} for starship ${starshipId}`
      );

      // Validate starship exists
      const starship = await this.findById(starshipId);
      if (!starship) {
        this.handleNotFound('Starship', starshipId, 'createConnectorInstance');
      }

      // Use MCPServerConnectorRepository to create the connector instance
      const mcpConnectorRepo = this.getMCPServerConnectorRepository();

      // Check for existing connector instance with same starship and template
      const existingConnector = await mcpConnectorRepo.findByStarshipAndTemplate(
        starshipId,
        templateId
      );
      if (existingConnector) {
        this.handleConflict(
          'MCPServerConnector',
          `Connector instance already exists for starship ${starshipId} and template ${templateId}. Only one connector instance per template is allowed per starship.`,
          'createConnectorInstance',
          `${starshipId}-${templateId}`
        );
      }

      const connectorInstance = await mcpConnectorRepo.createFromTemplate(starshipId, templateId);

      console.log(
        `[StarshipRepository] Successfully created connector instance ${connectorInstance.id} for starship ${starshipId}`
      );
      return connectorInstance;
    }, 'createConnectorInstance', 'MCPServerConnector');
  }

  /**
   * Remove a connector instance from a starship
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance to remove
   * @returns Promise resolving to true if successful, false otherwise
   */
  async removeConnectorInstance(starshipId: string, connectorId: string): Promise<boolean> {
    // Enhanced validation
    this.validateUUID(starshipId, 'starshipId');
    this.validateUUID(connectorId, 'connectorId');

    // eslint-disable-next-line no-useless-catch
    try {
      console.log(
        `[StarshipRepository] Removing connector instance ${connectorId} from starship ${starshipId}`
      );

      // Validate starship exists
      const starship = await this.findById(starshipId);
      if (!starship) {
        this.handleNotFound('Starship', starshipId, 'removeConnectorInstance');
      }

      // Use MCPServerConnectorRepository to validate ownership and delete
      const mcpConnectorRepo = this.getMCPServerConnectorRepository();

      // First, verify the connector belongs to this starship
      const connector = await mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        console.log(`[StarshipRepository] No connector instance found with ID ${connectorId}`);
        return false;
      }

      if (connector.starshipId !== starshipId) {
        this.handleConflict(
          'MCPServerConnector',
          `Connector instance ${connectorId} does not belong to starship ${starshipId}. Cannot remove connector from different starship.`,
          'removeConnectorInstance',
          connectorId
        );
      }

      // Delete the connector instance
      const success = await mcpConnectorRepo.delete(connectorId);

      if (success) {
        console.log(
          `[StarshipRepository] Successfully removed connector instance ${connectorId} from starship ${starshipId}`
        );
      } else {
        console.log(
          `[StarshipRepository] Failed to remove connector instance ${connectorId} from starship ${starshipId}`
        );
      }

      return success;
    } catch (error) {
      // BaseRepository will handle error conversion
      throw error;
    }
  }

  /**
   * Update a connector instance with partial updates
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance
   * @param updates - Partial updates to apply to the connector instance
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async updateConnectorInstance(
    starshipId: string,
    connectorId: string,
    updates: Partial<MCPServerConnector>
  ): Promise<MCPServerConnector | null> {
    if (!starshipId) {
      throw new Error('Starship ID parameter is required');
    }
    if (!connectorId) {
      throw new Error('Connector ID parameter is required');
    }

    try {
      console.log(
        `[StarshipRepository] Updating connector instance ${connectorId} on starship ${starshipId}`
      );

      // Validate starship exists
      const starship = await this.findById(starshipId);
      if (!starship) {
        throw new Error(`Starship with ID ${starshipId} not found`);
      }

      // Use MCPServerConnectorRepository to validate ownership and update
      const mcpConnectorRepo = this.getMCPServerConnectorRepository();

      // First, verify the connector belongs to this starship
      const connector = await mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        console.log(`[StarshipRepository] No connector instance found with ID ${connectorId}`);
        return null;
      }

      if (connector.starshipId !== starshipId) {
        throw new Error(
          `Connector instance ${connectorId} does not belong to starship ${starshipId}. Cannot update connector from different starship.`
        );
      }

      // Prevent updating immutable fields
      const { id, starshipId: _, templateId, createdAt, ...allowedUpdates } = updates;
      if (Object.keys(allowedUpdates).length === 0) {
        console.log(
          `[StarshipRepository] No valid updates provided for connector instance ${connectorId}`
        );
        return connector;
      }

      // Update the connector instance
      const updatedConnector = await mcpConnectorRepo.update(connectorId, allowedUpdates);

      if (updatedConnector) {
        console.log(
          `[StarshipRepository] Successfully updated connector instance ${connectorId} on starship ${starshipId}`
        );
      } else {
        console.log(
          `[StarshipRepository] Failed to update connector instance ${connectorId} on starship ${starshipId}`
        );
      }

      return updatedConnector;
    } catch (error) {
      console.error(
        `[StarshipRepository] Error updating connector instance ${connectorId} on starship ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to update connector instance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ============================================================================
  // STRIPE INTEGRATION METHODS
  // ============================================================================

  async findBySubscriptionId(subscriptionId: string): Promise<Starship | null> {
    // eslint-disable-next-line no-useless-catch
    try {
      const connection = getConnection();
      const result = await connection.executeQuery<{ starship: Starship }>(
        `MATCH (starship:Starship {subscriptionId: $subscriptionId})
         RETURN starship`,
        { subscriptionId }
      );
      
      return result[0]?.starship || null;
    } catch (error) {
      throw error;
    }
  }

  async updateSubscription(
    starshipId: string, 
    updates: {
      subscriptionId?: string;
      status?: 'active' | 'inactive' | 'restricted' | 'disabled' | 'pending_payment';
      plan?: 'scout' | 'cruiser' | 'draught';
      billingPeriod?: 'monthly' | 'yearly';
    }
  ): Promise<void> {
    // eslint-disable-next-line no-useless-catch
    try {
      const connection = getConnection();
      const setClause = Object.entries(updates)
        .map(([key]) => `starship.${key} = $${key}`)
        .join(', ');
        
      await connection.executeWrite(
        `MATCH (starship:Starship {id: $starshipId})
         SET ${setClause}, starship.updatedAt = $timestamp`,
        { starshipId, ...updates, timestamp: new Date().toISOString() }
      );
    } catch (error) {
      throw error;
    }
  }

  async countFreeStarships(userId: string): Promise<number> {
    // eslint-disable-next-line no-useless-catch
    try {
      const connection = getConnection();
      const result = await connection.executeQuery<{ count: number }>(
        `MATCH (user:User {id: $userId})-[:OWNS]->(starship:Starship {plan: 'scout'})
         RETURN count(starship) as count`,
        { userId }
      );
      
      return result[0]?.count || 0;
    } catch (error) {
      throw error;
    }
  }

  // ============================================================================
  // WEBHOOK IDEMPOTENCY METHODS
  // ============================================================================

  /**
   * Check if a Stripe webhook event has already been processed
   * @param eventId - The Stripe event ID
   * @returns true if event was already processed
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeQuery(
      'MATCH (e:StripeEvent {eventId: $eventId}) RETURN e LIMIT 1',
      { eventId }
    );
    return result.length > 0;
  }

  /**
   * Mark a Stripe webhook event as processed
   * @param eventId - The Stripe event ID
   * @param eventType - The type of Stripe event
   */
  async markEventProcessed(eventId: string, eventType?: string): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      `CREATE (e:StripeEvent {
        eventId: $eventId, 
        eventType: $eventType,
        processedAt: datetime()
      })`,
      { eventId, eventType: eventType || 'unknown' }
    );
  }

  /**
   * Update Starship with Stripe Customer ID
   * @param starshipId - The Starship ID
   * @param stripeCustomerId - The Stripe Customer ID
   */
  async updateStripeCustomer(
    starshipId: string, 
    stripeCustomerId: string
  ): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      `MATCH (s:Starship {id: $id}) 
       SET s.stripeCustomerId = $customerId,
           s.updatedAt = datetime()`,
      { id: starshipId, customerId: stripeCustomerId }
    );
  }

  /**
   * Find Starship by Stripe Customer ID
   * @param customerId - The Stripe Customer ID
   */
  async findByStripeCustomerId(customerId: string): Promise<Starship | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship {stripeCustomerId: $customerId}) RETURN s LIMIT 1',
      { customerId }
    );
    return result[0]?.s || null;
  }

  /**
   * Find all pending payment starships older than specified hours
   * @param hours - Number of hours to consider a starship abandoned
   * @returns Array of abandoned starships
   */
  async findAbandonedPendingStarships(hours: number = 24): Promise<Starship[]> {
    const connection = getConnection();
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const result = await connection.executeQuery<{ s: Starship }>(
      `MATCH (s:Starship)
       WHERE s.status = 'pending_payment' 
       AND s.createdAt < $cutoffTime
       RETURN s
       ORDER BY s.createdAt DESC`,
      { cutoffTime }
    );
    
    return result.map(record => record.s);
  }

  /**
   * Clean up abandoned pending starships
   * @param starshipId - The starship ID to clean up
   */
  async cleanupAbandonedStarship(starshipId: string): Promise<void> {
    const connection = getConnection();
    
    // Delete associated vision first
    await connection.executeWrite(
      `MATCH (v:Vision {starshipId: $starshipId})
       DELETE v`,
      { starshipId }
    );
    
    // Then delete the starship
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId})
       DELETE s`,
      { starshipId }
    );
  }

  /**
   * Update starship payment status
   * @param starshipId - The starship ID
   * @param status - New status
   * @param additionalFields - Additional fields to update
   */
  async updatePaymentStatus(
    starshipId: string, 
    status: 'active' | 'restricted' | 'disabled' | 'pending_payment',
    additionalFields?: Partial<Starship>
  ): Promise<void> {
    const connection = getConnection();
    const updates = {
      status,
      ...additionalFields,
      updatedAt: new Date().toISOString()
    };
    
    await connection.executeWrite(
      `MATCH (s:Starship {id: $id})
       SET s += $updates`,
      { id: starshipId, updates }
    );
  }

  async findByClass(starshipClass: StarshipClass): Promise<Starship[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.class = $starshipClass RETURN s ORDER BY s.createdAt DESC',
        { starshipClass }
      );
      return result.map((record) => record.s);
    }, 'findByClass', 'Starship', starshipClass);
  }

  async findByStatus(status: StarshipStatus): Promise<Starship[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.status = $status RETURN s ORDER BY s.createdAt DESC',
        { status }
      );
      return result.map((record) => record.s);
    }, 'findByStatus', 'Starship', status);
  }

  async findWithPendingPayments(): Promise<Starship[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.status = "pending_payment" RETURN s ORDER BY s.createdAt DESC'
      );
      return result.map((record) => record.s);
    }, 'findWithPendingPayments', 'Starship');
  }

  async updateBillingInfo(
    id: string,
    billingInfo: {
      subscriptionId?: string;
      plan?: StarshipClass;
      billingPeriod?: BillingPeriod;
      stripeCustomerId?: string;
    }
  ): Promise<Starship | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const updates = {
        ...billingInfo,
        updatedAt: new Date().toISOString(),
      };
      
      const result = await connection.executeWrite<{ s: Starship }>(
        'MATCH (s:Starship) WHERE s.id = $id SET s += $updates RETURN s',
        { id, updates }
      );
      
      return result[0]?.s || null;
    }, 'updateBillingInfo', 'Starship', id);
  }

  async upgradeClass(id: string, newClass: StarshipClass): Promise<Starship | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const capacity = this.getCapacityLimits(newClass);
      
      const result = await connection.executeWrite<{ s: Starship }>(
        `MATCH (s:Starship) WHERE s.id = $id 
         SET s.class = $newClass, 
             s.maxAgents = $maxAgents, 
             s.maxActiveMissions = $maxActiveMissions,
             s.updatedAt = $timestamp
         RETURN s`,
        {
          id,
          newClass,
          maxAgents: capacity.maxAgents,
          maxActiveMissions: capacity.maxActiveMissions,
          timestamp: new Date().toISOString(),
        }
      );
      
      return result[0]?.s || null;
    }, 'upgradeClass', 'Starship', id);
  }

  async findOverCapacity(): Promise<Starship[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ s: Starship }>(
        `MATCH (s:Starship)
         OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:Agent)
         WITH s, count(a) as deployedCount
         WHERE deployedCount > s.maxAgents
         RETURN s ORDER BY deployedCount DESC`
      );
      return result.map((record) => record.s);
    }, 'findOverCapacity', 'Starship');
  }

  private getCapacityLimits(starshipClass: StarshipClass): { maxAgents: number; maxActiveMissions: number } {
    const limits = {
      scout: { maxAgents: 3, maxActiveMissions: 3 },
      cruiser: { maxAgents: 5, maxActiveMissions: 6 },
      draught: { maxAgents: 10, maxActiveMissions: 10 }
    };
    return limits[starshipClass] || limits.scout;
  }
}
