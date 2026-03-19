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

export class PostgresConnection {
  private pool: Pool | null = null;
  private config: PostgresConfig;

  constructor(config: PostgresConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.pool) return;
    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.max || 10,
      idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis || 10000,
      statement_timeout: 30000,
      query_timeout: 30000,
      application_name: 'bundle-registry',
    };
    this.pool = new Pool(poolConfig);

    const test = await this.pool.connect();
    try {
      await test.query('SELECT 1');
    } finally {
      test.release();
    }
  }

  async disconnect(): Promise<void> {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
  }

  getPool(): Pool {
    if (!this.pool) throw new Error('Postgres pool not connected');
    return this.pool;
  }

  async getClient(): Promise<PoolClient> {
    return await this.getPool().connect();
  }

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.getPool().query(text, params);
    return res.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }
}

let connectionInstance: PostgresConnection | null = null;

export function createConnection(config: PostgresConfig): PostgresConnection {
  if (!connectionInstance) connectionInstance = new PostgresConnection(config);
  return connectionInstance;
}

export function getConnection(): PostgresConnection {
  if (!connectionInstance) throw new Error('Postgres connection not initialized');
  return connectionInstance;
}

export function resetConnection(): void {
  connectionInstance = null;
}

