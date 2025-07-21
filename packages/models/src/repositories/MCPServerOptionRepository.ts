import { getConnection } from '../connection';
import {
  MCPServerOption,
  MCPServerOptionRepository as MCPServerOptionRepositoryInterface,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based MCP Server Option repository
 */
export class MCPServerOptionRepository implements MCPServerOptionRepositoryInterface {
  async findAll(): Promise<MCPServerOption[]> {
    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ m: MCPServerOption }>(
        'MATCH (m:MCPServerOption) RETURN m ORDER BY m.name ASC'
      );
      return result.map((record) => record.m);
    } catch (error) {
      console.error('[MCPServerOptionRepository] Error in findAll:', error);
      throw new Error(
        `Failed to retrieve MCP server options: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async findById(id: string): Promise<MCPServerOption | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ m: MCPServerOption }>(
        'MATCH (m:MCPServerOption) WHERE m.id = $id RETURN m',
        { id }
      );
      return result[0]?.m || null;
    } catch (error) {
      console.error(`[MCPServerOptionRepository] Error in findById for id ${id}:`, error);
      throw new Error(
        `Failed to retrieve MCP server option: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async create(entity: Omit<MCPServerOption, 'id'>): Promise<MCPServerOption> {
    if (!entity.name || !entity.command) {
      throw new Error('Name and command are required fields');
    }

    if (!Array.isArray(entity.args)) {
      throw new Error('Args must be an array');
    }

    // Validate env is valid JSON string if provided
    if (entity.env !== undefined) {
      try {
        JSON.parse(entity.env);
      } catch (error) {
        throw new Error('Environment variables must be a valid JSON string');
      }
    }

    const connection = getConnection();
    const mcpServerOption: MCPServerOption = {
      ...entity,
      id: uuidv4(),
      env: entity.env ?? '{}', // Default to empty JSON object if not provided
    };

    try {
      await connection.executeWrite('CREATE (m:MCPServerOption $props) RETURN m', {
        props: mcpServerOption,
      });

      console.log(
        `[MCPServerOptionRepository] Created MCP server option: ${mcpServerOption.name} (${mcpServerOption.id})`
      );
      return mcpServerOption;
    } catch (error) {
      console.error('[MCPServerOptionRepository] Error in create:', error);
      throw new Error(
        `Failed to create MCP server option: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async update(id: string, updates: Partial<MCPServerOption>): Promise<MCPServerOption | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    // Validate updates
    if (updates.args && !Array.isArray(updates.args)) {
      throw new Error('Args must be an array');
    }

    if (updates.env !== undefined) {
      try {
        JSON.parse(updates.env);
      } catch (error) {
        throw new Error('Environment variables must be a valid JSON string');
      }
    }

    const connection = getConnection();
    try {
      const result = await connection.executeWrite<{ m: MCPServerOption }>(
        'MATCH (m:MCPServerOption) WHERE m.id = $id SET m += $updates RETURN m',
        { id, updates }
      );

      const updatedOption = result[0]?.m || null;
      if (updatedOption) {
        console.log(
          `[MCPServerOptionRepository] Updated MCP server option: ${updatedOption.name} (${id})`
        );
      }

      return updatedOption;
    } catch (error) {
      console.error(`[MCPServerOptionRepository] Error in update for id ${id}:`, error);
      throw new Error(
        `Failed to update MCP server option: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (m:MCPServerOption) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
        { id }
      );

      const deleted = result[0]?.deletedCount > 0;
      if (deleted) {
        console.log(`[MCPServerOptionRepository] Deleted MCP server option with id: ${id}`);
      }

      return deleted;
    } catch (error) {
      console.error(`[MCPServerOptionRepository] Error in delete for id ${id}:`, error);
      throw new Error(
        `Failed to delete MCP server option: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async findByCommand(command: string): Promise<MCPServerOption[]> {
    if (!command) {
      throw new Error('Command parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ m: MCPServerOption }>(
        'MATCH (m:MCPServerOption) WHERE m.command = $command RETURN m ORDER BY m.name ASC',
        { command }
      );
      return result.map((record) => record.m);
    } catch (error) {
      console.error(
        `[MCPServerOptionRepository] Error in findByCommand for command ${command}:`,
        error
      );
      throw new Error(
        `Failed to find MCP server options by command: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async findActive(): Promise<MCPServerOption[]> {
    const connection = getConnection();
    try {
      // For now, we consider all MCP server options as potentially active
      // In the future, we might add an 'isActive' field or check for active connections
      const result = await connection.executeQuery<{ m: MCPServerOption }>(
        'MATCH (m:MCPServerOption) RETURN m ORDER BY m.name ASC'
      );
      return result.map((record) => record.m);
    } catch (error) {
      console.error('[MCPServerOptionRepository] Error in findActive:', error);
      throw new Error(
        `Failed to find active MCP server options: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async searchByName(nameQuery: string): Promise<MCPServerOption[]> {
    if (!nameQuery) {
      throw new Error('Name query parameter is required');
    }

    const connection = getConnection();
    try {
      // Use case-insensitive search with CONTAINS
      const result = await connection.executeQuery<{ m: MCPServerOption }>(
        'MATCH (m:MCPServerOption) WHERE toLower(m.name) CONTAINS toLower($nameQuery) RETURN m ORDER BY m.name ASC',
        { nameQuery }
      );
      return result.map((record) => record.m);
    } catch (error) {
      console.error(
        `[MCPServerOptionRepository] Error in searchByName for query ${nameQuery}:`,
        error
      );
      throw new Error(
        `Failed to search MCP server options by name: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
