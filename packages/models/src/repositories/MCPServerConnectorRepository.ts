import { getConnection } from '../connection';
import {
  MCPServerConnector,
  MCPServerConnectorRepository as MCPServerConnectorRepositoryInterface,
  ValidationError,
  ConstraintViolationError,
  NotFoundError,
} from '../types';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based MCP Server Connector repository
 *
 * This repository manages connector instances that represent deployed MCP server
 * connectors on specific starships. Each connector instance is created from a
 * template (MCPServerOption) and maintains its own lifecycle and status.
 */
export class MCPServerConnectorRepository extends BaseRepository implements MCPServerConnectorRepositoryInterface {
  constructor() {
    super('MCPServerConnectorRepository');
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
   * Validate connector status
   */
  private validateStatus(status: MCPServerConnector['status']): void {
    const validStatuses: MCPServerConnector['status'][] = [
      'active',
      'inactive',
      'error',
      'connecting',
    ];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(
        `Status must be one of: ${validStatuses.join(', ')}. Got: ${status}`,
        'status'
      );
    }
  }

  /**
   * Handle Neo4j constraint violations and convert to user-friendly errors
   */
  private handleConstraintViolation(error: any, context: string): never {
    const errorMessage = error.message || '';

    // Handle unique constraint violations
    if (
      errorMessage.includes('already exists with label') ||
      errorMessage.includes('ConstraintValidationFailed')
    ) {
      if (errorMessage.includes('MCPServerConnector') && errorMessage.includes('id')) {
        throw new ConstraintViolationError(
          'A connector instance with this ID already exists. Each connector instance must have a unique ID.',
          'unique'
        );
      }

      if (errorMessage.includes('starshipId') && errorMessage.includes('templateId')) {
        throw new ConstraintViolationError(
          'A connector instance already exists for this starship and template combination. Only one connector instance per template is allowed per starship.',
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
   * Find all connector instances
   * @returns Promise resolving to array of all connector instances
   */
  async findAll(): Promise<MCPServerConnector[]> {
    const connection = getConnection();
    try {
      console.log('[MCPServerConnectorRepository] Finding all connector instances');

      const result = await connection.executeQuery<{ c: MCPServerConnector }>(
        'MATCH (c:MCPServerConnector) RETURN c ORDER BY c.createdAt DESC'
      );

      const connectors = result.map((record) => record.c);
      console.log(`[MCPServerConnectorRepository] Found ${connectors.length} connector instances`);

      return connectors;
    } catch (error) {
      console.error('[MCPServerConnectorRepository] Error in findAll:', error);
      throw new Error(
        `Failed to retrieve connector instances: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find a connector instance by ID
   * @param id - The ID of the connector instance
   * @returns Promise resolving to the connector instance or null if not found
   */
  async findById(id: string): Promise<MCPServerConnector | null> {
    // Enhanced validation
    this.validateUUID(id, 'id');

    const connection = getConnection();
    try {
      console.log(`[MCPServerConnectorRepository] Finding connector instance by ID: ${id}`);

      const result = await connection.executeQuery<{ c: MCPServerConnector }>(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id RETURN c',
        { id }
      );

      const connector = result[0]?.c || null;
      if (connector) {
        console.log(`[MCPServerConnectorRepository] Found connector instance: ${connector.id}`);
      } else {
        console.log(`[MCPServerConnectorRepository] No connector instance found with ID: ${id}`);
      }

      return connector;
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in findById for id ${id}:`, error);
      this.handleConstraintViolation(error, 'Failed to retrieve connector instance');
    }
  }

  /**
   * Create a new connector instance
   * @param data - Partial connector data (id, createdAt, updatedAt will be auto-generated)
   * @returns Promise resolving to the created connector instance
   */
  async create(data: Partial<MCPServerConnector>): Promise<MCPServerConnector> {
    // Enhanced validation for required fields
    if (!data.starshipId) {
      throw new ValidationError('starshipId is required', 'starshipId');
    }
    if (!data.templateId) {
      throw new ValidationError('templateId is required', 'templateId');
    }

    // Validate UUID formats
    this.validateUUID(data.starshipId, 'starshipId');
    this.validateUUID(data.templateId, 'templateId');

    // Validate status if provided
    if (data.status) {
      this.validateStatus(data.status);
    }

    // Validate boolean fields
    if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean value', 'isActive');
    }

    // Validate env field if provided
    if (data.env !== undefined) {
      if (data.env !== null && typeof data.env !== 'string') {
        throw new ValidationError('env must be a string or null', 'env');
      }
      console.log('[MCPServerConnectorRepository] Env validation passed');
    }

    const connection = getConnection();
    const now = new Date().toISOString();

    console.log('[MCPServerConnectorRepository] Env field:', {
      originalEnv: data.env,
    });

    const connector: MCPServerConnector = {
      id: uuidv4(),
      starshipId: data.starshipId,
      templateId: data.templateId,
      status: data.status || 'connecting',
      isActive: data.isActive ?? true,
      connectedAt: data.connectedAt || now,
      lastUsed: data.lastUsed,
      errorMessage: data.errorMessage,
      env: data.env,
      configTemplateId: data.configTemplateId,
      configVersion: data.configVersion || (data.env ? 1 : 0),
      createdAt: now,
      updatedAt: now,
    };

    try {
      console.log(
        `[MCPServerConnectorRepository] Creating connector instance: ${connector.id} for starship ${connector.starshipId} from template ${connector.templateId}`
      );
      console.log(
        '[MCPServerConnectorRepository] Connector object being created:',
        JSON.stringify(connector, null, 2)
      );
      console.log('[MCPServerConnectorRepository] Env field present:', !!connector.env);
      if (connector.env) {
        console.log('[MCPServerConnectorRepository] Env content:', connector.env);
      }

      // Validate that starship and template exist before creating connector
      const validationResult = await connection.executeQuery<{
        starshipExists: number;
        templateExists: number;
      }>(
        `OPTIONAL MATCH (s:Starship {id: $starshipId})
         OPTIONAL MATCH (t:MCPServerOption {id: $templateId})
         RETURN 
           count(s) as starshipExists,
           count(t) as templateExists`,
        { starshipId: connector.starshipId, templateId: connector.templateId }
      );

      const { starshipExists, templateExists } = validationResult[0] || {
        starshipExists: 0,
        templateExists: 0,
      };

      if (starshipExists === 0) {
        throw new NotFoundError(
          `Starship with ID ${connector.starshipId} not found`,
          'Starship',
          connector.starshipId
        );
      }
      if (templateExists === 0) {
        throw new NotFoundError(
          `MCP Server template with ID ${connector.templateId} not found`,
          'MCPServerOption',
          connector.templateId
        );
      }

      // Check for existing connector instance with same starship and template
      const existingConnector = await this.findByStarshipAndTemplate(
        connector.starshipId,
        connector.templateId
      );
      if (existingConnector) {
        throw new ConstraintViolationError(
          `Connector instance already exists for starship ${connector.starshipId} and template ${connector.templateId}. Only one connector instance per template is allowed per starship.`,
          'unique'
        );
      }

      // Create the connector instance and relationships in a single transaction
      console.log('[MCPServerConnectorRepository] About to execute Neo4j write operation');
      console.log(
        '[MCPServerConnectorRepository] Connector props being sent to Neo4j:',
        JSON.stringify(connector, null, 2)
      );

      try {
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId})
           MATCH (t:MCPServerOption {id: $templateId})
           CREATE (c:MCPServerConnector $connectorProps)
           CREATE (s)-[:HAS_CONNECTOR_INSTANCE {createdAt: $timestamp}]->(c)
           CREATE (c)-[:CREATED_FROM {createdAt: $timestamp}]->(t)
           RETURN c`,
          {
            starshipId: connector.starshipId,
            templateId: connector.templateId,
            connectorProps: connector,
            timestamp: connector.createdAt,
          }
        );
        console.log('[MCPServerConnectorRepository] Neo4j write operation completed successfully');
      } catch (dbError: any) {
        console.error('[MCPServerConnectorRepository] Neo4j database error:', dbError);
        console.error('[MCPServerConnectorRepository] Error details:', {
          message: dbError?.message || 'Unknown error',
          code: dbError?.code || 'Unknown code',
          name: dbError?.name || 'Unknown name',
          stack: dbError?.stack || 'No stack trace',
        });
        throw dbError;
      }

      console.log(
        `[MCPServerConnectorRepository] Successfully created connector instance: ${connector.id}`
      );
      return connector;
    } catch (error) {
      console.error('[MCPServerConnectorRepository] Error in create:', error);

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
   * Update a connector instance
   * @param id - The ID of the connector instance
   * @param data - Partial updates to apply
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async update(id: string, data: Partial<MCPServerConnector>): Promise<MCPServerConnector | null> {
    // Enhanced validation
    this.validateUUID(id, 'id');

    if (!data || Object.keys(data).length === 0) {
      throw new ValidationError('Update data is required and cannot be empty', 'data');
    }

    // Validate status if provided
    if (data.status) {
      this.validateStatus(data.status);
    }

    // Validate boolean fields
    if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
      throw new ValidationError('isActive must be a boolean value', 'isActive');
    }

    // Prevent updating immutable fields
    const { id: _, createdAt: __, starshipId: ___, templateId: ____, ...updates } = data;

    // Warn about immutable field attempts
    if (data.id && data.id !== id) {
      console.warn(`[MCPServerConnectorRepository] Attempt to update immutable field 'id' ignored`);
    }
    if (data.starshipId) {
      console.warn(
        `[MCPServerConnectorRepository] Attempt to update immutable field 'starshipId' ignored`
      );
    }
    if (data.templateId) {
      console.warn(
        `[MCPServerConnectorRepository] Attempt to update immutable field 'templateId' ignored`
      );
    }
    if (data.createdAt) {
      console.warn(
        `[MCPServerConnectorRepository] Attempt to update immutable field 'createdAt' ignored`
      );
    }

    const connection = getConnection();
    try {
      console.log(`[MCPServerConnectorRepository] Updating connector instance: ${id}`);

      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const result = await connection.executeWrite<{ c: MCPServerConnector }>(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id SET c += $updates RETURN c',
        { id, updates: updateProps }
      );

      const updatedConnector = result[0]?.c || null;
      if (updatedConnector) {
        console.log(
          `[MCPServerConnectorRepository] Successfully updated connector instance: ${id}`
        );
      } else {
        console.log(`[MCPServerConnectorRepository] No connector instance found with ID: ${id}`);
      }

      return updatedConnector;
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in update for id ${id}:`, error);

      // Re-throw custom errors as-is
      if (
        error instanceof ValidationError ||
        error instanceof ConstraintViolationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }

      // Handle database constraint violations
      this.handleConstraintViolation(error, 'Failed to update connector instance');
    }
  }

  /**
   * Delete a connector instance
   * @param id - The ID of the connector instance
   * @returns Promise resolving to true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    // Enhanced validation
    this.validateUUID(id, 'id');

    const connection = getConnection();
    try {
      console.log(`[MCPServerConnectorRepository] Deleting connector instance: ${id}`);

      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
        { id }
      );

      const deleted = result[0]?.deletedCount > 0;
      if (deleted) {
        console.log(
          `[MCPServerConnectorRepository] Successfully deleted connector instance: ${id}`
        );
      } else {
        console.log(`[MCPServerConnectorRepository] No connector instance found with ID: ${id}`);
      }

      return deleted;
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in delete for id ${id}:`, error);

      // Re-throw custom errors as-is
      if (
        error instanceof ValidationError ||
        error instanceof ConstraintViolationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }

      // Handle database constraint violations
      this.handleConstraintViolation(error, 'Failed to delete connector instance');
    }
  }

  /**
   * Find all connector instances deployed on a specific starship
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to array of connector instances
   */
  async findByStarship(starshipId: string): Promise<MCPServerConnector[]> {
    if (!starshipId) {
      throw new Error('starshipId parameter is required');
    }

    const connection = getConnection();
    try {
      console.log(
        `[MCPServerConnectorRepository] Finding connector instances for starship: ${starshipId}`
      );

      const result = await connection.executeQuery<{ c: MCPServerConnector }>(
        `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(c:MCPServerConnector)
         RETURN c
         ORDER BY c.createdAt DESC`,
        { starshipId }
      );

      const connectors = result.map((record) => record.c);

      console.log(
        `[MCPServerConnectorRepository] Found ${connectors.length} connector instances for starship: ${starshipId}`
      );

      return connectors;
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in findByStarship for starshipId ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to find connector instances by starship: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find all connector instances created from a specific template
   * @param templateId - The ID of the MCP server template
   * @returns Promise resolving to array of connector instances
   */
  async findByTemplate(templateId: string): Promise<MCPServerConnector[]> {
    if (!templateId) {
      throw new Error('templateId parameter is required');
    }

    const connection = getConnection();
    try {
      console.log(
        `[MCPServerConnectorRepository] Finding connector instances for template: ${templateId}`
      );

      const result = await connection.executeQuery<{ c: MCPServerConnector }>(
        `MATCH (c:MCPServerConnector)-[:CREATED_FROM]->(t:MCPServerOption {id: $templateId})
         RETURN c
         ORDER BY c.createdAt DESC`,
        { templateId }
      );

      const connectors = result.map((record) => record.c);
      console.log(
        `[MCPServerConnectorRepository] Found ${connectors.length} connector instances for template: ${templateId}`
      );

      return connectors;
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in findByTemplate for templateId ${templateId}:`,
        error
      );
      throw new Error(
        `Failed to find connector instances by template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create a new connector instance from an MCP server template
   * @param starshipId - The ID of the starship to deploy the connector on
   * @param templateId - The ID of the MCP server template to instantiate
   * @param config - Optional initial configuration for the connector instance
   * @returns Promise resolving to the created connector instance
   */
  async createFromTemplate(
    starshipId: string,
    templateId: string,
    env?: string
  ): Promise<MCPServerConnector> {
    if (!starshipId) {
      throw new Error('starshipId parameter is required');
    }
    if (!templateId) {
      throw new Error('templateId parameter is required');
    }

    console.log(
      `[MCPServerConnectorRepository] Creating connector instance from template ${templateId} for starship ${starshipId}`
    );
    console.log(
      '[MCPServerConnectorRepository] Environment variables provided:',
      env ? 'YES' : 'NO'
    );
    if (env) {
      console.log('[MCPServerConnectorRepository] Environment variables:', env);
    }

    // Use the create method which already handles validation and relationship creation
    return this.create({
      starshipId,
      templateId,
      status: 'connecting',
      isActive: true,
      env,
    });
  }

  /**
   * Update the status of a connector instance
   * @param id - The ID of the connector instance
   * @param status - The new status to set
   * @param errorMessage - Optional error message if status is 'error'
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async updateStatus(
    id: string,
    status: MCPServerConnector['status'],
    errorMessage?: string
  ): Promise<MCPServerConnector | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }
    if (!status) {
      throw new Error('status parameter is required');
    }

    console.log(`[MCPServerConnectorRepository] Updating status of connector ${id} to ${status}`);

    const updates: Partial<MCPServerConnector> = {
      status,
      errorMessage: status === 'error' ? errorMessage : undefined,
    };

    // Update lastUsed timestamp if status is becoming active
    if (status === 'active') {
      updates.lastUsed = new Date().toISOString();
    }

    return this.update(id, updates);
  }

  /**
   * Deactivate a connector instance (sets isActive to false)
   * @param id - The ID of the connector instance
   * @returns Promise resolving to true if successful, false otherwise
   */
  async deactivate(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    console.log(`[MCPServerConnectorRepository] Deactivating connector instance: ${id}`);

    const updatedConnector = await this.update(id, {
      isActive: false,
      status: 'inactive',
    });

    return updatedConnector !== null;
  }

  /**
   * Activate a connector instance (sets isActive to true)
   * @param id - The ID of the connector instance
   * @returns Promise resolving to true if successful, false otherwise
   */
  async activate(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    console.log(`[MCPServerConnectorRepository] Activating connector instance: ${id}`);

    const updatedConnector = await this.update(id, {
      isActive: true,
      status: 'active',
      lastUsed: new Date().toISOString(),
    });

    return updatedConnector !== null;
  }

  /**
   * Find a specific connector instance by starship and template
   * @param starshipId - The ID of the starship
   * @param templateId - The ID of the MCP server template
   * @returns Promise resolving to the connector instance or null if not found
   */
  async findByStarshipAndTemplate(
    starshipId: string,
    templateId: string
  ): Promise<MCPServerConnector | null> {
    if (!starshipId) {
      throw new Error('starshipId parameter is required');
    }
    if (!templateId) {
      throw new Error('templateId parameter is required');
    }

    const connection = getConnection();
    try {
      console.log(
        `[MCPServerConnectorRepository] Finding connector instance for starship ${starshipId} and template ${templateId}`
      );

      const result = await connection.executeQuery<{ c: MCPServerConnector }>(
        `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(c:MCPServerConnector)-[:CREATED_FROM]->(t:MCPServerOption {id: $templateId})
         RETURN c`,
        { starshipId, templateId }
      );

      const connector = result[0]?.c || null;
      if (connector) {
        console.log(
          `[MCPServerConnectorRepository] Found connector instance: ${connector.id} for starship ${starshipId} and template ${templateId}`
        );
      } else {
        console.log(
          `[MCPServerConnectorRepository] No connector instance found for starship ${starshipId} and template ${templateId}`
        );
      }

      return connector;
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in findByStarshipAndTemplate for starshipId ${starshipId} and templateId ${templateId}:`,
        error
      );
      throw new Error(
        `Failed to find connector instance by starship and template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update the environment variables of a connector instance
   * @param id - The ID of the connector instance
   * @param env - The new environment variables as JSON string
   * @param changedBy - ID of the user making the change
   * @param changeSummary - Optional summary of what was changed
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async updateEnv(
    id: string,
    env: string,
    changedBy: string,
    changeSummary?: string
  ): Promise<MCPServerConnector | null> {
    this.validateUUID(id, 'id');

    if (!env || typeof env !== 'string') {
      throw new ValidationError('Environment variables are required and must be a string', 'env');
    }

    if (!changedBy) {
      throw new ValidationError('changedBy parameter is required', 'changedBy');
    }

    console.log(
      `[MCPServerConnectorRepository] Updating environment variables for connector: ${id}`
    );

    try {
      // First, get the current connector to create a history entry
      const currentConnector = await this.findById(id);
      if (!currentConnector) {
        console.log(`[MCPServerConnectorRepository] No connector instance found with ID: ${id}`);
        return null;
      }

      // Create configuration history entry (if we had the history repository)
      // For now, we'll just log the change
      console.log(
        `[MCPServerConnectorRepository] Environment variables updated by user: ${changedBy}${changeSummary ? `, Summary: ${changeSummary}` : ''}`
      );

      // Update the connector with new environment variables
      const updates: Partial<MCPServerConnector> = {
        env,
        configVersion: (currentConnector.configVersion || 0) + 1,
      };

      return this.update(id, updates);
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in updateEnv for id ${id}:`, error);

      if (
        error instanceof ValidationError ||
        error instanceof ConstraintViolationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }

      throw new Error(
        `Failed to update connector environment variables: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // NEW: Docker-specific repository methods

  /**
   * Update Docker deployment status and related fields
   * @param id - The ID of the connector instance
   * @param dockerStatus - The new Docker status
   * @param containerInfo - Optional container information
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async updateDockerStatus(
    id: string,
    dockerStatus: MCPServerConnector['dockerStatus'],
    containerInfo?: {
      containerId?: string;
      serviceName?: string;
      networkName?: string;
      imageName?: string;
      errorMessage?: string;
    }
  ): Promise<MCPServerConnector | null> {
    this.validateUUID(id, 'id');

    if (!dockerStatus) {
      throw new ValidationError('dockerStatus parameter is required', 'dockerStatus');
    }

    // Validate Docker status
    const validDockerStatuses: MCPServerConnector['dockerStatus'][] = [
      'pending',
      'building',
      'running',
      'stopped',
      'error',
    ];
    if (!validDockerStatuses.includes(dockerStatus)) {
      throw new ValidationError(
        `dockerStatus must be one of: ${validDockerStatuses.join(', ')}. Got: ${dockerStatus}`,
        'dockerStatus'
      );
    }

    console.log(
      `[MCPServerConnectorRepository] Updating Docker status of connector ${id} to ${dockerStatus}`
    );

    const updates: Partial<MCPServerConnector> = {
      dockerStatus,
      dockerContainerId: containerInfo?.containerId,
      dockerServiceName: containerInfo?.serviceName,
      dockerNetworkName: containerInfo?.networkName,
      dockerImageName: containerInfo?.imageName,
      dockerErrorMessage: dockerStatus === 'error' ? containerInfo?.errorMessage : undefined,
    };

    // If Docker status is running, also update main status to active
    if (dockerStatus === 'running') {
      updates.status = 'active';
      updates.isActive = true;
      updates.lastUsed = new Date().toISOString();
    } else if (dockerStatus === 'error') {
      updates.status = 'error';
      updates.isActive = false;
      updates.errorMessage = containerInfo?.errorMessage;
    } else if (dockerStatus === 'stopped') {
      updates.status = 'inactive';
      updates.isActive = false;
    }

    try {
      return await this.update(id, updates);
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in updateDockerStatus for id ${id}:`, error);
      throw new Error(
        `Failed to update Docker status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update Docker health status
   * @param id - The ID of the connector instance
   * @param healthStatus - The new health status
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async updateDockerHealth(
    id: string,
    healthStatus: MCPServerConnector['dockerHealthStatus']
  ): Promise<MCPServerConnector | null> {
    this.validateUUID(id, 'id');

    if (!healthStatus) {
      throw new ValidationError('healthStatus parameter is required', 'healthStatus');
    }

    // Validate health status
    const validHealthStatuses: MCPServerConnector['dockerHealthStatus'][] = [
      'healthy',
      'unhealthy',
      'starting',
    ];
    if (!validHealthStatuses.includes(healthStatus)) {
      throw new ValidationError(
        `dockerHealthStatus must be one of: ${validHealthStatuses.join(', ')}. Got: ${healthStatus}`,
        'dockerHealthStatus'
      );
    }

    console.log(
      `[MCPServerConnectorRepository] Updating Docker health status of connector ${id} to ${healthStatus}`
    );

    const updates: Partial<MCPServerConnector> = {
      dockerHealthStatus: healthStatus,
      dockerLastHealthCheck: new Date().toISOString(),
    };

    // If health becomes unhealthy, update main status accordingly
    if (healthStatus === 'unhealthy') {
      updates.status = 'error';
      updates.isActive = false;
      updates.errorMessage = 'Container health check failed';
    } else if (healthStatus === 'healthy' && updates.dockerStatus === 'running') {
      updates.status = 'active';
      updates.isActive = true;
      updates.errorMessage = undefined;
    }

    try {
      return await this.update(id, updates);
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in updateDockerHealth for id ${id}:`, error);
      throw new Error(
        `Failed to update Docker health status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find connector instances by Docker status
   * @param dockerStatus - The Docker status to filter by
   * @returns Promise resolving to array of connector instances
   */
  async findByDockerStatus(
    dockerStatus: MCPServerConnector['dockerStatus']
  ): Promise<MCPServerConnector[]> {
    if (!dockerStatus) {
      throw new ValidationError('dockerStatus parameter is required', 'dockerStatus');
    }

    const connection = getConnection();
    try {
      console.log(
        `[MCPServerConnectorRepository] Finding connector instances with Docker status: ${dockerStatus}`
      );

      const result = await connection.executeQuery<{ c: MCPServerConnector }>(
        'MATCH (c:MCPServerConnector) WHERE c.dockerStatus = $dockerStatus RETURN c ORDER BY c.createdAt DESC',
        { dockerStatus }
      );

      const connectors = result.map((record) => record.c);
      console.log(
        `[MCPServerConnectorRepository] Found ${connectors.length} connector instances with Docker status: ${dockerStatus}`
      );

      return connectors;
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in findByDockerStatus for status ${dockerStatus}:`,
        error
      );
      throw new Error(
        `Failed to find connector instances by Docker status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find connector instances by starship with Docker information
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to array of connector instances with Docker fields populated
   */
  async findByStarshipWithDockerInfo(starshipId: string): Promise<MCPServerConnector[]> {
    if (!starshipId) {
      throw new ValidationError('starshipId parameter is required', 'starshipId');
    }

    const connection = getConnection();
    try {
      console.log(
        `[MCPServerConnectorRepository] Finding connector instances with Docker info for starship: ${starshipId}`
      );

      const result = await connection.executeQuery<{ c: MCPServerConnector }>(
        `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(c:MCPServerConnector)
         WHERE c.dockerServiceName IS NOT NULL OR c.dockerStatus IS NOT NULL
         RETURN c
         ORDER BY c.createdAt DESC`,
        { starshipId }
      );

      const connectors = result.map((record) => record.c);
      console.log(
        `[MCPServerConnectorRepository] Found ${connectors.length} connector instances with Docker info for starship: ${starshipId}`
      );

      return connectors;
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in findByStarshipWithDockerInfo for starshipId ${starshipId}:`,
        error
      );
      throw new Error(
        `Failed to find connector instances with Docker info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update Docker container ID after deployment
   * @param id - The ID of the connector instance
   * @param containerId - The Docker container ID
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async updateDockerContainerId(
    id: string,
    containerId: string
  ): Promise<MCPServerConnector | null> {
    this.validateUUID(id, 'id');

    if (!containerId || typeof containerId !== 'string') {
      throw new ValidationError('containerId parameter is required and must be a string', 'containerId');
    }

    console.log(
      `[MCPServerConnectorRepository] Updating Docker container ID for connector ${id} to ${containerId}`
    );

    const updates: Partial<MCPServerConnector> = {
      dockerContainerId: containerId,
    };

    try {
      return await this.update(id, updates);
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in updateDockerContainerId for id ${id}:`, error);
      throw new Error(
        `Failed to update Docker container ID: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
