import { getConnection } from '../connection';
import {
  Starship,
  StarshipRepository as StarshipRepositoryInterface,
  Agent,
  MCPServerOption,
  MCPServerConnector,
  MCPServerConnectorRepository,
  ValidationError,
  ConstraintViolationError,
  NotFoundError,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based starship repository
 */
export class StarshipRepository implements StarshipRepositoryInterface {
  private mcpServerConnectorRepository: MCPServerConnectorRepository;

  constructor(mcpServerConnectorRepository?: MCPServerConnectorRepository) {
    // For backward compatibility, we'll lazy-load the repository if not provided
    this.mcpServerConnectorRepository =
      mcpServerConnectorRepository as MCPServerConnectorRepository;
  }

  /**
   * Validate UUID format
   */
  private validateUUID(id: string, fieldName: string): void {
    if (!id || typeof id !== 'string') {
      throw new ValidationError(`${fieldName} is required and must be a string`, fieldName);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new ValidationError(`${fieldName} must be a valid UUID format`, fieldName);
    }
  }

  /**
   * Validate starship class
   */
  private validateStarshipClass(starshipClass: Starship['class']): void {
    const validClasses: Starship['class'][] = ['scout', 'cruiser', 'draught'];
    if (!validClasses.includes(starshipClass)) {
      throw new ValidationError(
        `Starship class must be one of: ${validClasses.join(', ')}. Got: ${starshipClass}`,
        'class'
      );
    }
  }

  /**
   * Validate starship status
   */
  private validateStarshipStatus(status: Starship['status']): void {
    const validStatuses: Starship['status'][] = ['active', 'inactive', 'restricted', 'disabled'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(
        `Starship status must be one of: ${validStatuses.join(', ')}. Got: ${status}`,
        'status'
      );
    }
  }

  /**
   * Handle constraint violations and convert to user-friendly errors
   */
  private handleConstraintViolation(error: any, context: string): never {
    const errorMessage = error.message || '';

    // Handle unique constraint violations
    if (
      errorMessage.includes('already exists with label') ||
      errorMessage.includes('ConstraintValidationFailed')
    ) {
      if (errorMessage.includes('Starship') && errorMessage.includes('slug')) {
        throw new ConstraintViolationError(
          'A starship with this name already exists for your account. Please choose a different name.',
          'unique'
        );
      }

      throw new ConstraintViolationError(
        'This operation violates a uniqueness constraint. Please check your data for duplicates.',
        'unique'
      );
    }

    // Handle foreign key constraint violations
    if (errorMessage.includes('Node') && errorMessage.includes('not found')) {
      throw new ConstraintViolationError(
        'Referenced entity does not exist. Please ensure all related entities exist before creating relationships.',
        'foreign_key'
      );
    }

    // Re-throw the original error if it's not a recognized constraint violation
    throw new Error(`${context}: ${errorMessage}`);
  }

  /**
   * Get the MCPServerConnectorRepository instance, creating it if needed
   * This ensures backward compatibility while supporting dependency injection
   */
  private getMCPServerConnectorRepository(): MCPServerConnectorRepository {
    if (!this.mcpServerConnectorRepository) {
      // Import here to avoid circular dependencies
      const { MCPServerConnectorRepository } = require('./MCPServerConnectorRepository');
      this.mcpServerConnectorRepository = new MCPServerConnectorRepository();
    }
    return this.mcpServerConnectorRepository;
  }
  async findAll(): Promise<Starship[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) RETURN s ORDER BY s.createdAt DESC'
    );
    return result.map((record) => record.s);
  }

  async findById(id: string): Promise<Starship | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.id = $id RETURN s',
      { id }
    );
    return result[0]?.s || null;
  }

  async findBySlug(slug: string, ownerId: string): Promise<Starship | null> {
    if (!slug) {
      throw new Error('Slug parameter is required');
    }
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.slug = $slug AND s.ownerId = $ownerId RETURN s',
      { slug, ownerId }
    );
    return result[0]?.s || null;
  }

  async findByOwner(ownerId: string): Promise<Starship[]> {
    if (!ownerId) {
      throw new Error('Owner ID parameter is required');
    }

    const connection = getConnection();
    const result = await connection.executeQuery<{ s: Starship }>(
      'MATCH (s:Starship) WHERE s.ownerId = $ownerId RETURN s ORDER BY s.createdAt DESC',
      { ownerId }
    );
    return result.map((record) => record.s);
  }

  async create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt' | 'slug'> & { slug?: string }): Promise<Starship> {
    const connection = getConnection();

    // Set maxAgents based on class (Scout: 3, Cruiser: 5, Draught: 10)
    const maxAgents = entity.class === 'scout' ? 3 : entity.class === 'cruiser' ? 5 : 10;
    
    // Set default maxActiveExpeditions based on class if not provided (Scout: 1, Cruiser: 3, Draught: 5)
    const maxActiveExpeditions = entity.maxActiveExpeditions ?? 
      (entity.class === 'scout' ? 1 : entity.class === 'cruiser' ? 3 : 5);
    
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
      maxActiveExpeditions,
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
  }

  async update(id: string, updates: Partial<Starship>): Promise<Starship | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

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
  }

  async delete(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (s:Starship) WHERE s.id = $id DETACH DELETE s RETURN count(s) as deletedCount',
      { id }
    );

    return result[0]?.deletedCount > 0;
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

  async updateMaxActiveExpeditions(starshipId: string, maxActiveExpeditions: number): Promise<boolean> {
    const connection = getConnection();
    
    // Validate maxActiveExpeditions is a positive number
    if (maxActiveExpeditions < 0) {
      throw new Error('maxActiveExpeditions must be a positive number');
    }
    
    const result = await connection.executeWrite<{ count: number }>(
      `MATCH (s:Starship) WHERE s.id = $starshipId
       SET s.maxActiveExpeditions = $maxActiveExpeditions, s.updatedAt = $timestamp
       RETURN count(s) as count`,
      {
        starshipId,
        maxActiveExpeditions,
        timestamp: new Date().toISOString()
      }
    );
    
    return result[0]?.count > 0;
  }

  async getMaxActiveExpeditions(starshipId: string): Promise<number | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ maxActiveExpeditions: number }>(
      'MATCH (s:Starship) WHERE s.id = $starshipId RETURN s.maxActiveExpeditions as maxActiveExpeditions',
      { starshipId }
    );
    
    return result[0]?.maxActiveExpeditions ?? null;
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
    // Enhanced validation
    this.validateUUID(starshipId, 'starshipId');
    this.validateUUID(templateId, 'templateId');

    try {
      console.log(
        `[StarshipRepository] Creating connector instance from template ${templateId} for starship ${starshipId}`
      );

      // Validate starship exists
      const starship = await this.findById(starshipId);
      if (!starship) {
        throw new NotFoundError(`Starship with ID ${starshipId} not found`, 'Starship', starshipId);
      }

      // Use MCPServerConnectorRepository to create the connector instance
      const mcpConnectorRepo = this.getMCPServerConnectorRepository();

      // Check for existing connector instance with same starship and template
      const existingConnector = await mcpConnectorRepo.findByStarshipAndTemplate(
        starshipId,
        templateId
      );
      if (existingConnector) {
        throw new ConstraintViolationError(
          `Connector instance already exists for starship ${starshipId} and template ${templateId}. Only one connector instance per template is allowed per starship.`,
          'unique'
        );
      }

      const connectorInstance = await mcpConnectorRepo.createFromTemplate(starshipId, templateId);

      console.log(
        `[StarshipRepository] Successfully created connector instance ${connectorInstance.id} for starship ${starshipId}`
      );
      return connectorInstance;
    } catch (error) {
      console.error(
        `[StarshipRepository] Error creating connector instance for starship ${starshipId}:`,
        error
      );

      // Re-throw custom errors as-is
      if (
        error instanceof ValidationError ||
        error instanceof ConstraintViolationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }

      // Handle database constraint violations
      this.handleConstraintViolation(error, 'Failed to create connector instance');
    }
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

    try {
      console.log(
        `[StarshipRepository] Removing connector instance ${connectorId} from starship ${starshipId}`
      );

      // Validate starship exists
      const starship = await this.findById(starshipId);
      if (!starship) {
        throw new NotFoundError(`Starship with ID ${starshipId} not found`, 'Starship', starshipId);
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
        throw new ConstraintViolationError(
          `Connector instance ${connectorId} does not belong to starship ${starshipId}. Cannot remove connector from different starship.`,
          'foreign_key'
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
      console.error(
        `[StarshipRepository] Error removing connector instance ${connectorId} from starship ${starshipId}:`,
        error
      );

      // Re-throw custom errors as-is
      if (
        error instanceof ValidationError ||
        error instanceof ConstraintViolationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }

      // Handle database constraint violations
      this.handleConstraintViolation(error, 'Failed to remove connector instance');
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
  // EXPEDITION INTEGRATION METHODS
  // ============================================================================

  /**
   * Update active expeditions count for a starship
   */
  async updateActiveExpeditionsCount(starshipId: string, increment: boolean = true): Promise<void> {
    const connection = getConnection();
    const operation = increment ? '+' : '-';
    
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId})
       SET s.activeExpeditions = s.activeExpeditions ${operation} 1,
           s.updatedAt = $timestamp`,
      {
        starshipId,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Get expedition capacity information for a starship
   */
  async getExpeditionCapacity(starshipId: string): Promise<{
    maxConcurrentExpeditions: number;
    currentActiveExpeditions: number;
    availableExpeditionSlots: number;
    maxAgentsPerExpedition: number;
    totalDeployedAgents: number;
    availableAgents: number;
  }> {
    const connection = getConnection();
    const result = await connection.executeQuery<{
      starshipClass: 'scout' | 'cruiser';
      maxAgents: number;
      activeExpeditions: number;
      deployedAgents: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})
       OPTIONAL MATCH (s)<-[:DEPLOYED_ON]-(a:Agent)
       RETURN s.class as starshipClass, s.maxAgents as maxAgents,
              s.activeExpeditions as activeExpeditions, count(a) as deployedAgents`,
      { starshipId }
    );

    const data = result[0];
    if (!data) {
      throw new Error('Starship not found');
    }

    // Define capacity limits based on starship class
    const maxConcurrentExpeditions = data.starshipClass === 'scout' ? 2 : 5;
    const maxAgentsPerExpedition = data.starshipClass === 'scout' ? 2 : 4;

    return {
      maxConcurrentExpeditions,
      currentActiveExpeditions: data.activeExpeditions,
      availableExpeditionSlots: Math.max(0, maxConcurrentExpeditions - data.activeExpeditions),
      maxAgentsPerExpedition,
      totalDeployedAgents: data.deployedAgents,
      availableAgents: Math.max(0, data.maxAgents - data.deployedAgents)
    };
  }

  /**
   * Check if starship can start a new expedition
   */
  async canStartNewExpedition(starshipId: string): Promise<{
    canStart: boolean;
    reason?: string;
    capacity: {
      maxConcurrentExpeditions: number;
      currentActiveExpeditions: number;
      availableExpeditionSlots: number;
    };
  }> {
    const capacity = await this.getExpeditionCapacity(starshipId);
    
    const canStart = capacity.availableExpeditionSlots > 0;
    const reason = canStart ? undefined : 'Maximum concurrent expeditions reached';

    return {
      canStart,
      reason,
      capacity: {
        maxConcurrentExpeditions: capacity.maxConcurrentExpeditions,
        currentActiveExpeditions: capacity.currentActiveExpeditions,
        availableExpeditionSlots: capacity.availableExpeditionSlots
      }
    };
  }

  /**
   * Get agent availability for expeditions
   */
  async getAgentAvailabilityForExpeditions(starshipId: string): Promise<Array<{
    agentId: string;
    agentName: string;
    category: string;
    tags: string[];
    availability: 'available' | 'busy' | 'offline';
    currentExpeditions: string[];
    workload: 'light' | 'moderate' | 'heavy';
  }>> {
    const connection = getConnection();
    const result = await connection.executeQuery<{
      agentId: string;
      agentName: string;
      category: string;
      tags: string[];
      currentExpeditions: string[];
    }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       OPTIONAL MATCH (a)-[:ASSIGNED_TO]->(e:Expedition)
       WHERE e.status IN ['planning', 'in-progress', 'review']
       RETURN a.id as agentId, a.name as agentName, a.category as category,
              a.tags as tags, collect(DISTINCT e.id) as currentExpeditions`,
      { starshipId }
    );

    return result.map(agent => {
      const expeditionCount = agent.currentExpeditions.length;
      let availability: 'available' | 'busy' | 'offline' = 'available';
      let workload: 'light' | 'moderate' | 'heavy' = 'light';

      if (expeditionCount >= 3) {
        availability = 'busy';
        workload = 'heavy';
      } else if (expeditionCount >= 2) {
        workload = 'moderate';
      }

      return {
        agentId: agent.agentId,
        agentName: agent.agentName,
        category: agent.category,
        tags: agent.tags || [],
        availability,
        currentExpeditions: agent.currentExpeditions || [],
        workload
      };
    });
  }

  /**
   * Get starship expedition statistics
   */
  async getExpeditionStats(starshipId: string, days: number = 30): Promise<{
    expeditions: {
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      averageDuration: number;
      successRate: number;
    };
    tasks: {
      total: number;
      completed: number;
      failed: number;
      averageDuration: number;
      successRate: number;
    };
    topPerformingAgents: Array<{
      agentId: string;
      agentName: string;
      tasksCompleted: number;
      successRate: number;
    }>;
  }> {
    const connection = getConnection();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.toISOString();

    // Get expedition stats
    const expeditionStats = await connection.executeQuery<{
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      avgDuration: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)
       WHERE e.createdAt >= $cutoffDate
       WITH count(e) as total,
            count(CASE WHEN e.status = 'completed' THEN 1 END) as completed,
            count(CASE WHEN e.status = 'failed' THEN 1 END) as failed,
            count(CASE WHEN e.status = 'cancelled' THEN 1 END) as cancelled,
            avg(CASE WHEN e.actualDuration IS NOT NULL THEN e.actualDuration ELSE 0 END) as avgDuration
       RETURN total, completed, failed, cancelled, avgDuration`,
      { starshipId, cutoffDate: cutoffTimestamp }
    );

    // Get task stats
    const taskStats = await connection.executeQuery<{
      total: number;
      completed: number;
      failed: number;
      avgDuration: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})-[:HAS_EXPEDITION]->(e:Expedition)-[:HAS_TASK]->(t:ExpeditionTask)
       WHERE e.createdAt >= $cutoffDate
       WITH count(t) as total,
            count(CASE WHEN t.status = 'completed' THEN 1 END) as completed,
            count(CASE WHEN t.status = 'failed' THEN 1 END) as failed,
            avg(CASE WHEN t.actualEffort IS NOT NULL THEN t.actualEffort ELSE 0 END) as avgDuration
       RETURN total, completed, failed, avgDuration`,
      { starshipId, cutoffDate: cutoffTimestamp }
    );

    // Get top performing agents
    const agentStats = await connection.executeQuery<{
      agentId: string;
      agentName: string;
      tasksCompleted: number;
      totalTasks: number;
    }>(
      `MATCH (s:Starship {id: $starshipId})<-[:DEPLOYED_ON]-(a:Agent)
       MATCH (a)-[:ASSIGNED_TO]->(t:ExpeditionTask)
       MATCH (t)<-[:HAS_TASK]-(e:Expedition)
       WHERE e.createdAt >= $cutoffDate
       WITH a.id as agentId, a.name as agentName,
            count(t) as totalTasks,
            count(CASE WHEN t.status = 'completed' THEN 1 END) as tasksCompleted
       WHERE totalTasks > 0
       RETURN agentId, agentName, tasksCompleted, totalTasks
       ORDER BY tasksCompleted DESC, (toFloat(tasksCompleted) / totalTasks) DESC
       LIMIT 10`,
      { starshipId, cutoffDate: cutoffTimestamp }
    );

    const rawExpStats = expeditionStats[0];
    const rawTskStats = taskStats[0];

    // Handle expedition stats
    let expeditionSuccessRate = 0;
    let expStatsConverted = { total: 0, completed: 0, failed: 0, cancelled: 0, avgDuration: 0 };
    
    if (rawExpStats) {
      const expTotal = Number(rawExpStats.total);
      const expCompleted = Number(rawExpStats.completed);
      const expFailed = Number(rawExpStats.failed);
      const expCancelled = Number(rawExpStats.cancelled);
      const expAvgDuration = Number(rawExpStats.avgDuration || 0);
      
      expeditionSuccessRate = expTotal > 0 ? (expCompleted / expTotal) * 100 : 0;
      expStatsConverted = {
        total: expTotal,
        completed: expCompleted,
        failed: expFailed,
        cancelled: expCancelled,
        avgDuration: expAvgDuration
      };
    }

    // Handle task stats
    let taskSuccessRate = 0;
    let tskStatsConverted = { total: 0, completed: 0, failed: 0, avgDuration: 0 };
    
    if (rawTskStats) {
      const tskTotal = Number(rawTskStats.total);
      const tskCompleted = Number(rawTskStats.completed);
      const tskFailed = Number(rawTskStats.failed);
      const tskAvgDuration = Number(rawTskStats.avgDuration || 0);
      
      taskSuccessRate = tskTotal > 0 ? (tskCompleted / tskTotal) * 100 : 0;
      tskStatsConverted = {
        total: tskTotal,
        completed: tskCompleted,
        failed: tskFailed,
        avgDuration: tskAvgDuration
      };
    }

    return {
      expeditions: {
        total: expStatsConverted.total,
        completed: expStatsConverted.completed,
        failed: expStatsConverted.failed,
        cancelled: expStatsConverted.cancelled,
        averageDuration: Math.round(expStatsConverted.avgDuration),
        successRate: Math.round(expeditionSuccessRate * 100) / 100
      },
      tasks: {
        total: tskStatsConverted.total,
        completed: tskStatsConverted.completed,
        failed: tskStatsConverted.failed,
        averageDuration: Math.round(tskStatsConverted.avgDuration),
        successRate: Math.round(taskSuccessRate * 100) / 100
      },
      topPerformingAgents: agentStats.map(agent => ({
        agentId: agent.agentId,
        agentName: agent.agentName,
        tasksCompleted: Number(agent.tasksCompleted),
        successRate: Math.round((Number(agent.tasksCompleted) / Number(agent.totalTasks)) * 10000) / 100
      }))
    };
  }

  // ============================================================================
  // STRIPE INTEGRATION METHODS
  // ============================================================================

  async findBySubscriptionId(subscriptionId: string): Promise<Starship | null> {
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
      status?: 'active' | 'inactive' | 'restricted' | 'disabled';
      plan?: 'scout' | 'cruiser' | 'draught';
      billingPeriod?: 'monthly' | 'yearly';
    }
  ): Promise<void> {
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
}
