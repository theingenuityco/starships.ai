import { getConnection } from '../connection';
import { ConnectorConfigHistory, ConnectorInstanceConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ConnectorConfigHistoryRepository {
  /**
   * Create a configuration history entry
   */
  async createEntry(
    connectorId: string,
    config: ConnectorInstanceConfig,
    changedBy: string,
    changeSummary?: string,
    changeReason?: string
  ): Promise<ConnectorConfigHistory> {
    if (!connectorId || !config || !changedBy) {
      throw new Error('Connector ID, config, and changedBy are required fields');
    }

    const connection = getConnection();
    const historyEntry: ConnectorConfigHistory = {
      id: uuidv4(),
      connectorId,
      config,
      changedBy,
      changeSummary,
      changeReason,
      createdAt: new Date().toISOString(),
    };

    try {
      await connection.executeWrite(`CREATE (h:ConnectorConfigHistory $props) RETURN h`, {
        props: {
          ...historyEntry,
          config: JSON.stringify(historyEntry.config),
        },
      });

      console.log(
        `[ConnectorConfigHistoryRepository] Created configuration history entry for connector: ${connectorId} (${historyEntry.id})`
      );
      return historyEntry;
    } catch (error) {
      console.error('[ConnectorConfigHistoryRepository] Error in createEntry:', error);
      throw new Error(
        `Failed to create configuration history entry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find all configuration history entries
   */
  async findAll(): Promise<ConnectorConfigHistory[]> {
    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ h: any }>(
        'MATCH (h:ConnectorConfigHistory) RETURN h ORDER BY h.createdAt DESC'
      );

      return result.map((record) => this.nodeToHistory(record.h));
    } catch (error) {
      console.error('[ConnectorConfigHistoryRepository] Error in findAll:', error);
      throw new Error(
        `Failed to retrieve configuration history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find configuration history by ID
   */
  async findById(id: string): Promise<ConnectorConfigHistory | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ h: any }>(
        'MATCH (h:ConnectorConfigHistory) WHERE h.id = $id RETURN h',
        { id }
      );

      return result[0] ? this.nodeToHistory(result[0].h) : null;
    } catch (error) {
      console.error(`[ConnectorConfigHistoryRepository] Error in findById for id ${id}:`, error);
      throw new Error(
        `Failed to retrieve configuration history entry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find configuration history for a specific connector
   */
  async findByConnector(connectorId: string, limit?: number): Promise<ConnectorConfigHistory[]> {
    if (!connectorId) {
      throw new Error('Connector ID parameter is required');
    }

    const connection = getConnection();
    try {
      let cypher =
        'MATCH (h:ConnectorConfigHistory) WHERE h.connectorId = $connectorId RETURN h ORDER BY h.createdAt DESC';
      const parameters: any = { connectorId };

      if (limit && limit > 0) {
        cypher += ' LIMIT $limit';
        parameters.limit = limit;
      }

      const result = await connection.executeQuery<{ h: any }>(cypher, parameters);
      return result.map((record) => this.nodeToHistory(record.h));
    } catch (error) {
      console.error(
        `[ConnectorConfigHistoryRepository] Error in findByConnector for connectorId ${connectorId}:`,
        error
      );
      throw new Error(
        `Failed to find configuration history by connector: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Find configuration changes by user
   */
  async findByUser(userId: string, limit?: number): Promise<ConnectorConfigHistory[]> {
    if (!userId) {
      throw new Error('User ID parameter is required');
    }

    const connection = getConnection();
    try {
      let cypher =
        'MATCH (h:ConnectorConfigHistory) WHERE h.changedBy = $userId RETURN h ORDER BY h.createdAt DESC';
      const parameters: any = { userId };

      if (limit && limit > 0) {
        cypher += ' LIMIT $limit';
        parameters.limit = limit;
      }

      const result = await connection.executeQuery<{ h: any }>(cypher, parameters);
      return result.map((record) => this.nodeToHistory(record.h));
    } catch (error) {
      console.error(
        `[ConnectorConfigHistoryRepository] Error in findByUser for userId ${userId}:`,
        error
      );
      throw new Error(
        `Failed to find configuration history by user: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update configuration history entry
   */
  async update(
    id: string,
    updates: Partial<Omit<ConnectorConfigHistory, 'id' | 'createdAt'>>
  ): Promise<ConnectorConfigHistory | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      // Prepare updates with JSON stringified config if present
      const processedUpdates: any = { ...updates };
      if (updates.config) {
        processedUpdates.config = JSON.stringify(updates.config);
      }

      const result = await connection.executeWrite<{ h: any }>(
        'MATCH (h:ConnectorConfigHistory) WHERE h.id = $id SET h += $updates RETURN h',
        { id, updates: processedUpdates }
      );

      const updatedHistory = result[0] ? this.nodeToHistory(result[0].h) : null;
      if (updatedHistory) {
        console.log(
          `[ConnectorConfigHistoryRepository] Updated configuration history entry: ${id}`
        );
      }

      return updatedHistory;
    } catch (error) {
      console.error(`[ConnectorConfigHistoryRepository] Error in update for id ${id}:`, error);
      throw new Error(
        `Failed to update configuration history entry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete configuration history entry
   */
  async delete(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (h:ConnectorConfigHistory) WHERE h.id = $id DETACH DELETE h RETURN count(h) as deletedCount',
        { id }
      );

      const deleted = result[0]?.deletedCount > 0;
      if (deleted) {
        console.log(
          `[ConnectorConfigHistoryRepository] Deleted configuration history entry with id: ${id}`
        );
      }

      return deleted;
    } catch (error) {
      console.error(`[ConnectorConfigHistoryRepository] Error in delete for id ${id}:`, error);
      throw new Error(
        `Failed to delete configuration history entry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the latest configuration for a connector
   */
  async getLatestConfig(connectorId: string): Promise<ConnectorConfigHistory | null> {
    if (!connectorId) {
      throw new Error('Connector ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ h: any }>(
        'MATCH (h:ConnectorConfigHistory) WHERE h.connectorId = $connectorId RETURN h ORDER BY h.createdAt DESC LIMIT 1',
        { connectorId }
      );

      return result[0] ? this.nodeToHistory(result[0].h) : null;
    } catch (error) {
      console.error(
        `[ConnectorConfigHistoryRepository] Error in getLatestConfig for connectorId ${connectorId}:`,
        error
      );
      throw new Error(
        `Failed to get latest configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clean up old history entries (keep only the latest N entries per connector)
   */
  async cleanupOldEntries(connectorId: string, keepCount: number = 10): Promise<number> {
    if (!connectorId) {
      throw new Error('Connector ID parameter is required');
    }

    if (keepCount < 1) {
      throw new Error('Keep count must be at least 1');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeWrite<{ deletedCount: number }>(
        `
        MATCH (h:ConnectorConfigHistory)
        WHERE h.connectorId = $connectorId
        WITH h ORDER BY h.createdAt DESC
        SKIP $keepCount
        DETACH DELETE h
        RETURN count(h) as deletedCount
        `,
        { connectorId, keepCount }
      );

      const deletedCount = result[0]?.deletedCount || 0;
      if (deletedCount > 0) {
        console.log(
          `[ConnectorConfigHistoryRepository] Cleaned up ${deletedCount} old history entries for connector: ${connectorId}`
        );
      }

      return deletedCount;
    } catch (error) {
      console.error(
        `[ConnectorConfigHistoryRepository] Error in cleanupOldEntries for connectorId ${connectorId}:`,
        error
      );
      throw new Error(
        `Failed to cleanup old history entries: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Convert Neo4j node to ConnectorConfigHistory
   */
  private nodeToHistory(node: any): ConnectorConfigHistory {
    return {
      id: node.id,
      connectorId: node.connectorId,
      config: JSON.parse(node.config),
      changedBy: node.changedBy,
      changeSummary: node.changeSummary || undefined,
      changeReason: node.changeReason || undefined,
      createdAt: node.createdAt,
    };
  }
}
