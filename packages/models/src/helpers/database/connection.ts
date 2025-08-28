import neo4j, { Driver, Session, auth, ManagedTransaction, isInt, int } from 'neo4j-driver';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

/**
 * Neo4j database connection manager
 */
export class Neo4jConnection {
  private driver: Driver | null = null;
  private config: Neo4jConfig;

  constructor(config: Neo4jConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.driver) {
      return;
    }

    try {
      this.driver = neo4j.driver(
        this.config.uri,
        auth.basic(this.config.username, this.config.password),
        {
          connectionTimeout: 5000, // 5 second timeout
          maxConnectionLifetime: 30000, // 30 second max lifetime
          maxConnectionPoolSize: 100,
          connectionAcquisitionTimeout: 10000, // 10 second acquisition timeout
          encrypted: false, // Disable encryption for local development
          trust: 'TRUST_ALL_CERTIFICATES' // Trust all certificates for local development
        }
      );

      // Add timeout to connectivity check
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Neo4j connection timeout')), 5000);
      });

      await Promise.race([this.driver.verifyConnectivity(), timeoutPromise]);
    } catch (error) {
      console.error('Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver is not connected. Call connect() first.');
    }

    return this.driver.session({
      database: this.config.database || 'neo4j',
    });
  }

  async executeQuery<T = any>(cypher: string, parameters: any = {}): Promise<T[]> {
    const session = this.getSession();

    try {
      // Convert any Map objects to plain objects for Neo4j compatibility
      const sanitizedParameters = this.sanitizeParameters(parameters);
      
      const result = await session.executeRead((tx: ManagedTransaction) =>
        tx.run(cypher, sanitizedParameters)
      );

      return result.records.map((record) => {
        const obj = record.toObject();
        // Extract properties from Neo4j nodes
        const processedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value && typeof value === 'object' && value.properties) {
            // This is a Neo4j node, extract its properties
            processedObj[key] = value.properties;
          } else {
            // This is a regular value or relationship
            processedObj[key] = value;
          }
        }
        return processedObj as T;
      });
    } finally {
      await session.close();
    }
  }

  async executeWrite<T = any>(cypher: string, parameters: any = {}): Promise<T[]> {
    const session = this.getSession();

    try {
      // Convert any Map objects to plain objects for Neo4j compatibility
      const sanitizedParameters = this.sanitizeParameters(parameters);
      
      const result = await session.executeWrite((tx: ManagedTransaction) =>
        tx.run(cypher, sanitizedParameters)
      );

      return result.records.map((record) => {
        const obj = record.toObject();
        // Extract properties from Neo4j nodes
        const processedObj: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value && typeof value === 'object' && value.properties) {
            // This is a Neo4j node, extract its properties
            processedObj[key] = value.properties;
          } else {
            // This is a regular value or relationship
            processedObj[key] = value;
          }
        }
        return processedObj as T;
      });
    } finally {
      await session.close();
    }
  }

  async initializeSchema(): Promise<void> {
    const session = this.getSession();

    try {
      const constraints = [
        'CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE',
        'CREATE CONSTRAINT llm_id_unique IF NOT EXISTS FOR (l:LLM) REQUIRE l.id IS UNIQUE',
        'CREATE CONSTRAINT llm_name_unique IF NOT EXISTS FOR (l:LLM) REQUIRE l.name IS UNIQUE',
        'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
        'CREATE CONSTRAINT user_kinde_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.kindeId IS UNIQUE',
        'CREATE CONSTRAINT starship_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.id IS UNIQUE',
        'CREATE CONSTRAINT starship_slug_owner_unique IF NOT EXISTS FOR (s:Starship) REQUIRE (s.slug, s.ownerId) IS UNIQUE',
        'CREATE CONSTRAINT vision_id_unique IF NOT EXISTS FOR (v:Vision) REQUIRE v.id IS UNIQUE',
        // 'CREATE CONSTRAINT constraint_id_unique IF NOT EXISTS FOR (con:Constraint) REQUIRE con.id IS UNIQUE',
        // 'CREATE CONSTRAINT concept_id_unique IF NOT EXISTS FOR (concept:Concept) REQUIRE concept.id IS UNIQUE',
        // 'CREATE CONSTRAINT meta_anchor_id_unique IF NOT EXISTS FOR (m:MetaAnchor) REQUIRE m.id IS UNIQUE',
        
        // Mission system constraints
        'CREATE CONSTRAINT mission_id_unique IF NOT EXISTS FOR (m:Mission) REQUIRE m.id IS UNIQUE',
        'CREATE CONSTRAINT mission_clarity_id_unique IF NOT EXISTS FOR (mc:MissionClarity) REQUIRE mc.id IS UNIQUE',
      ];

      for (const constraint of constraints) {
        await session.run(constraint);
      }

      const indexes = [
        'CREATE INDEX agent_name_index IF NOT EXISTS FOR (a:Agent) ON (a.name)',
        'CREATE INDEX user_username_index IF NOT EXISTS FOR (u:User) ON (u.username)',
        'CREATE INDEX user_email_index IF NOT EXISTS FOR (u:User) ON (u.email)',
        'CREATE INDEX llm_provider_index IF NOT EXISTS FOR (l:LLM) ON (l.provider)',
        'CREATE INDEX starship_owner_index IF NOT EXISTS FOR (s:Starship) ON (s.ownerId)',
        // 'CREATE INDEX codex_starship_index IF NOT EXISTS FOR (c:Codex) ON (c.starshipId)',
        // 'CREATE INDEX codex_active_index IF NOT EXISTS FOR (c:Codex) ON (c.isActive)',
        // 'CREATE INDEX vision_codex_index IF NOT EXISTS FOR (v:Vision) ON (v.codexId)',
        // 'CREATE INDEX constraint_codex_index IF NOT EXISTS FOR (con:Constraint) ON (con.codexId)',
        // 'CREATE INDEX constraint_active_index IF NOT EXISTS FOR (con:Constraint) ON (con.isActive)',
        // 'CREATE INDEX concept_codex_index IF NOT EXISTS FOR (concept:Concept) ON (concept.codexId)',
        // 'CREATE INDEX concept_category_index IF NOT EXISTS FOR (concept:Concept) ON (concept.category)',
        // 'CREATE INDEX meta_anchor_codex_index IF NOT EXISTS FOR (m:MetaAnchor) ON (m.codexId)',
        'CREATE INDEX vision_starship_index IF NOT EXISTS FOR (v:Vision) ON (v.starshipId)',
        
        
        // Mission system indexes
        'CREATE INDEX mission_starship_index IF NOT EXISTS FOR (m:Mission) ON (m.starshipId)',
        'CREATE INDEX mission_status_index IF NOT EXISTS FOR (m:Mission) ON (m.status)',
        'CREATE INDEX mission_phase_index IF NOT EXISTS FOR (m:Mission) ON (m.phase)',
        'CREATE INDEX mission_created_by_index IF NOT EXISTS FOR (m:Mission) ON (m.createdBy)',
        
        'CREATE INDEX mission_clarity_mission_index IF NOT EXISTS FOR (mc:MissionClarity) ON (mc.missionId)',
        'CREATE INDEX mission_clarity_score_index IF NOT EXISTS FOR (mc:MissionClarity) ON (mc.overallScore)',
        'CREATE INDEX mission_clarity_iteration_index IF NOT EXISTS FOR (mc:MissionClarity) ON (mc.iteration)',
      ];

      for (const index of indexes) {
        await session.run(index);
      }
    } catch (error) {
      console.error('Failed to initialize Neo4j schema:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Recursively converts Map objects and other incompatible types to Neo4j-compatible values
   * - Converts Map objects to plain objects
   * - Preserves Neo4j Integer objects as-is
   * - Preserves primitive types and Neo4j-compatible objects
   */
  private sanitizeParameters(params: any, depth: number = 0): any {
    // Prevent infinite recursion
    if (depth > 10) {
      console.warn('[Neo4j] Maximum sanitization depth reached, returning value as-is:', typeof params);
      return params;
    }
    if (params === null || params === undefined) {
      return params;
    }

    // Handle Neo4j Integer objects - keep them as-is since Neo4j expects them
    if (isInt(params)) {
      return params;
    }

    // Handle Map objects - convert to plain objects
    if (params instanceof Map) {
      const obj: any = {};
      for (const [key, value] of params.entries()) {
        obj[key] = this.sanitizeParameters(value, depth + 1);
      }
      return obj;
    }

    // Handle arrays
    if (Array.isArray(params)) {
      return params.map(item => this.sanitizeParameters(item, depth + 1));
    }

    // Handle plain objects (but not Neo4j objects like Node, Relationship, etc.)
    if (typeof params === 'object' && params.constructor === Object) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(params)) {
        // Special handling for limit parameter - ensure it's a Neo4j Integer
        if (key === 'limit' && typeof value === 'number' && Number.isInteger(value)) {
          sanitized[key] = int(value);
        } else {
          sanitized[key] = this.sanitizeParameters(value, depth + 1);
        }
      }
      return sanitized;
    }

    // Handle numbers that should be Neo4j integers (particularly for LIMIT clauses)
    if (typeof params === 'number' && Number.isInteger(params)) {
      return int(params);
    }

    // For primitives (string, number, boolean) and Neo4j objects (Node, Relationship, etc.), return as-is
    return params;
  }
}

let connectionInstance: Neo4jConnection | null = null;

export function createConnection(config: Neo4jConfig): Neo4jConnection {
  if (!connectionInstance) {
    connectionInstance = new Neo4jConnection(config);
  }
  return connectionInstance;
}

export function getConnection(): Neo4jConnection {
  if (!connectionInstance) {
    throw new Error('Neo4j connection not initialized. Call createConnection() first.');
  }
  return connectionInstance;
}