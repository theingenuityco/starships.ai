import { Pool, PoolClient, PoolConfig } from 'pg';

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/** PostgreSQL database connection manager */
export class PostgresConnection {
  private pool: Pool | null = null;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    try {
      const poolConfig: PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: this.config.max || 20, // Maximum number of clients in the pool
        idleTimeoutMillis: this.config.idleTimeoutMillis || 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: this.config.connectionTimeoutMillis || 10000, // Return an error if no connection is available within 10 seconds
        statement_timeout: 30000, // 30 second query timeout
        query_timeout: 30000, // 30 second query timeout
        application_name: 'starships-ai',
      };

      this.pool = new Pool(poolConfig);

      // Test the connection
      const testClient = await this.pool.connect();
      await testClient.query('SELECT NOW()');
      testClient.release();

      console.log('✅ PostgreSQL connection established');
    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('✅ PostgreSQL connection closed');
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('PostgreSQL pool is not connected. Call connect() first.');
    }
    return this.pool;
  }

  /**
   * Execute a query with parameters
   */
  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const pool = this.getPool();

    // Serialize JSONB/JSON fields to strings manually to avoid double-escaping
    // The pg library has issues with nested objects in JSONB columns
    const processedParams = params.map((param) => {
      // For arrays or objects (but not null/undefined), stringify for JSONB columns
      if (param && typeof param === 'object' && !(param instanceof Date)) {
        return JSON.stringify(param);
      }
      return param;
    });

    try {
      // Debug logging for messages table with tool_calls
      if (text.includes('INSERT INTO messages') && params.length > 0) {
        const toolCallsParam = params[7]; // tool_calls is the 8th parameter (index 7)
        if (toolCallsParam) {
          console.log('[DEBUG] postgres-connection - tool_calls param:', {
            type: typeof toolCallsParam,
            isArray: Array.isArray(toolCallsParam),
            value: toolCallsParam,
            stringified: JSON.stringify(toolCallsParam),
            processedValue: processedParams[7],
          });
        }
      }

      const result = await pool.query(text, processedParams);
      return result.rows as T[];
    } catch (error) {
      console.error('PostgreSQL query error:', error);
      console.error('Query:', text);
      console.error('Params:', processedParams);
      throw error;
    }
  }

  /**
   * Execute a query within a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple queries within a transaction
   */
  async batchQuery<T = Record<string, unknown>>(queries: Array<{ text: string; params?: unknown[] }>): Promise<T[][]> {
    return this.transaction(async (client) => {
      const results: T[][] = [];

      for (const query of queries) {
        const result = await client.query(query.text, query.params || []);
        results.push(result.rows as T[]);
      }

      return results;
    });
  }

  /**
   * Get a single client for complex operations
   */
  async getClient(): Promise<PoolClient> {
    const pool = this.getPool();
    return await pool.connect();
  }

  /**
   * Execute a query that returns a single row
   */
  async queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
    const results = await this.query<T>(text, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute a query that returns a count
   */
  async queryCount(text: string, params: unknown[] = []): Promise<number> {
    const result = await this.queryOne<{ count: string }>(text, params);
    return result ? parseInt(result.count, 10) : 0;
  }

  /**
   * Check if the database connection is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1 as health_check');
      return true;
    } catch (error) {
      console.error('PostgreSQL health check failed:', error);
      return false;
    }
  }

  /**
   * Get database information
   */
  async getInfo(): Promise<{
    version: string;
    database: string;
    currentUser: string;
    totalConnections: number;
    activeConnections: number;
  }> {
    try {
      const versionResult = await this.queryOne<{ version: string }>('SELECT version()');
      const dbResult = await this.queryOne<{ current_database: string; current_user: string }>('SELECT current_database(), current_user');
      const connectionsResult = await this.queryOne<{ total: string; active: string }>(`
        SELECT 
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as total,
          (SELECT count(*)::text FROM pg_stat_activity WHERE state = 'active') as active
      `);

      return {
        version: versionResult?.version || 'Unknown',
        database: dbResult?.current_database || 'Unknown',
        currentUser: dbResult?.current_user || 'Unknown',
        totalConnections: connectionsResult ? parseInt(connectionsResult.total, 10) : 0,
        activeConnections: connectionsResult ? parseInt(connectionsResult.active, 10) : 0,
      };
    } catch (error) {
      console.error('Failed to get PostgreSQL info:', error);
      throw error;
    }
  }

  /**
   * Execute schema initialization
   */
  async initializeSchema(): Promise<void> {
    // This will be called by migration runner
    console.log('PostgreSQL schema initialization handled by migration runner');
  }
}

let connectionInstance: PostgresConnection | null = null;

export function createConnection(config: PostgresConfig): PostgresConnection {
  if (!connectionInstance) {
    connectionInstance = new PostgresConnection(config);
  }
  return connectionInstance;
}

export function getConnection(): PostgresConnection {
  if (!connectionInstance) {
    throw new Error('PostgreSQL connection not initialized. Call createConnection() first.');
  }
  return connectionInstance;
}

// Test helper function to reset connection instance
export function resetConnection(): void {
  connectionInstance = null;
}
