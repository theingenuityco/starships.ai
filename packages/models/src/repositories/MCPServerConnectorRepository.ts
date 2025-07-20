import { getConnection } from '../connection';
import {
  MCPServerConnector,
  MCPServerConnectorRepository as MCPServerConnectorRepositoryInterface,
  ConnectorInstanceConfig,
  ConnectorConfigTemplate,
  ConnectorConfigHistory,
  DEFAULT_CONNECTOR_CONFIG,
  ValidationError,
  ConstraintViolationError,
  NotFoundError,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based MCP Server Connector repository
 *
 * This repository manages connector instances that represent deployed MCP server
 * connectors on specific starships. Each connector instance is created from a
 * template (MCPServerOption) and maintains its own lifecycle and status.
 */
export class MCPServerConnectorRepository implements MCPServerConnectorRepositoryInterface {
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

    const connection = getConnection();
    const now = new Date().toISOString();

    const connector: MCPServerConnector = {
      id: uuidv4(),
      starshipId: data.starshipId,
      templateId: data.templateId,
      status: data.status || 'connecting',
      isActive: data.isActive ?? true,
      connectedAt: data.connectedAt || now,
      lastUsed: data.lastUsed,
      errorMessage: data.errorMessage,
      createdAt: now,
      updatedAt: now,
    };

    try {
      console.log(
        `[MCPServerConnectorRepository] Creating connector instance: ${connector.id} for starship ${connector.starshipId} from template ${connector.templateId}`
      );

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
    config?: ConnectorInstanceConfig
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

    // Use the create method which already handles validation and relationship creation
    return this.create({
      starshipId,
      templateId,
      status: 'connecting',
      isActive: true,
      config,
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
   * Update the configuration of a connector instance
   * @param id - The ID of the connector instance
   * @param config - The new configuration to apply
   * @param changedBy - ID of the user making the change
   * @param changeSummary - Optional summary of what was changed
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async updateConfig(
    id: string,
    config: ConnectorInstanceConfig,
    changedBy: string,
    changeSummary?: string
  ): Promise<MCPServerConnector | null> {
    this.validateUUID(id, 'id');

    if (!config || typeof config !== 'object') {
      throw new ValidationError('Configuration is required and must be an object', 'config');
    }

    if (!changedBy) {
      throw new ValidationError('changedBy parameter is required', 'changedBy');
    }

    console.log(`[MCPServerConnectorRepository] Updating configuration for connector: ${id}`);

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
        `[MCPServerConnectorRepository] Configuration updated by user: ${changedBy}${changeSummary ? `, Summary: ${changeSummary}` : ''}`
      );

      // Update the connector with new configuration
      const updates: Partial<MCPServerConnector> = {
        config,
        configVersion: (currentConnector.configVersion || 0) + 1,
      };

      return this.update(id, updates);
    } catch (error) {
      console.error(`[MCPServerConnectorRepository] Error in updateConfig for id ${id}:`, error);

      if (
        error instanceof ValidationError ||
        error instanceof ConstraintViolationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }

      throw new Error(
        `Failed to update connector configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Apply a configuration template to a connector instance
   * @param id - The ID of the connector instance
   * @param templateId - The ID of the configuration template to apply
   * @param changedBy - ID of the user making the change
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  async applyConfigTemplate(
    id: string,
    templateId: string,
    changedBy: string
  ): Promise<MCPServerConnector | null> {
    this.validateUUID(id, 'id');
    this.validateUUID(templateId, 'templateId');

    if (!changedBy) {
      throw new ValidationError('changedBy parameter is required', 'changedBy');
    }

    console.log(
      `[MCPServerConnectorRepository] Applying configuration template ${templateId} to connector: ${id}`
    );

    try {
      // For now, we'll use a placeholder implementation since we don't have the template repository yet
      // In a full implementation, we would:
      // 1. Fetch the configuration template
      // 2. Apply its configuration to the connector
      // 3. Update the configTemplateId field

      console.warn(
        `[MCPServerConnectorRepository] Configuration template application not fully implemented yet. Template ID: ${templateId}`
      );

      // Placeholder: just update the configTemplateId for now
      const updates: Partial<MCPServerConnector> = {
        configTemplateId: templateId,
        configVersion: 1, // Reset version when applying template
      };

      return this.update(id, updates);
    } catch (error) {
      console.error(
        `[MCPServerConnectorRepository] Error in applyConfigTemplate for id ${id}:`,
        error
      );

      if (
        error instanceof ValidationError ||
        error instanceof ConstraintViolationError ||
        error instanceof NotFoundError
      ) {
        throw error;
      }

      throw new Error(
        `Failed to apply configuration template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
