import neo4j, { Driver, Session, auth, ManagedTransaction } from 'neo4j-driver';

export interface Neo4jConfig {
  uri: string;
  username: string;
  [DEFAULT-PASSWORD]: string;
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
        auth.basic(this.config.username, this.config.[DEFAULT-PASSWORD]),
        {
          connectionTimeout: 5000, // 5 second timeout
          maxConnectionLifetime: 30000, // 30 second max lifetime
          maxConnectionPoolSize: 100,
          connectionAcquisitionTimeout: 10000 // 10 second acquisition timeout
        }
      );

      // Add timeout to connectivity check
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Neo4j connection timeout')), 5000);
      });

      await Promise.race([
        this.driver.verifyConnectivity(),
        timeoutPromise
      ]);
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
      database: this.config.database || 'neo4j'
    });
  }

  async executeQuery<T = any>(
    cypher: string, 
    parameters: any = {}
  ): Promise<T[]> {
    const session = this.getSession();
    
    try {
      const result = await session.executeRead((tx: ManagedTransaction) => 
        tx.run(cypher, parameters)
      );
      
      return result.records.map(record => {
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

  async executeWrite<T = any>(
    cypher: string, 
    parameters: any = {}
  ): Promise<T[]> {
    const session = this.getSession();
    
    try {
      const result = await session.executeWrite((tx: ManagedTransaction) => 
        tx.run(cypher, parameters)
      );
      
      return result.records.map(record => {
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
        'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
        'CREATE CONSTRAINT channel_id_unique IF NOT EXISTS FOR (c:Channel) REQUIRE c.id IS UNIQUE',
        'CREATE CONSTRAINT starship_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.id IS UNIQUE',
        'CREATE CONSTRAINT starship_slug_owner_unique IF NOT EXISTS FOR (s:Starship) REQUIRE (s.slug, s.ownerId) IS UNIQUE',
        'CREATE CONSTRAINT codex_id_unique IF NOT EXISTS FOR (c:Codex) REQUIRE c.id IS UNIQUE',
        'CREATE CONSTRAINT vision_id_unique IF NOT EXISTS FOR (v:Vision) REQUIRE v.id IS UNIQUE',
        'CREATE CONSTRAINT constraint_id_unique IF NOT EXISTS FOR (con:Constraint) REQUIRE con.id IS UNIQUE',
        'CREATE CONSTRAINT concept_id_unique IF NOT EXISTS FOR (concept:Concept) REQUIRE concept.id IS UNIQUE',
        'CREATE CONSTRAINT meta_anchor_id_unique IF NOT EXISTS FOR (m:MetaAnchor) REQUIRE m.id IS UNIQUE',
        
        // Expedition system constraints
        'CREATE CONSTRAINT expedition_id_unique IF NOT EXISTS FOR (e:Expedition) REQUIRE e.id IS UNIQUE',
        'CREATE CONSTRAINT expedition_task_id_unique IF NOT EXISTS FOR (t:ExpeditionTask) REQUIRE t.id IS UNIQUE',
        'CREATE CONSTRAINT expedition_message_id_unique IF NOT EXISTS FOR (m:ExpeditionMessage) REQUIRE m.id IS UNIQUE',
        'CREATE CONSTRAINT expedition_result_id_unique IF NOT EXISTS FOR (r:ExpeditionResult) REQUIRE r.id IS UNIQUE',
      ];

      for (const constraint of constraints) {
        await session.run(constraint);
      }

      const indexes = [
        'CREATE INDEX agent_name_index IF NOT EXISTS FOR (a:Agent) ON (a.name)',
        'CREATE INDEX user_username_index IF NOT EXISTS FOR (u:User) ON (u.username)',
        'CREATE INDEX user_email_index IF NOT EXISTS FOR (u:User) ON (u.email)',
        'CREATE INDEX channel_guild_index IF NOT EXISTS FOR (c:Channel) ON (c.guildId)',
        'CREATE INDEX llm_provider_index IF NOT EXISTS FOR (l:LLM) ON (l.provider)',
        'CREATE INDEX starship_owner_index IF NOT EXISTS FOR (s:Starship) ON (s.ownerId)',
        'CREATE INDEX codex_starship_index IF NOT EXISTS FOR (c:Codex) ON (c.starshipId)',
        'CREATE INDEX codex_active_index IF NOT EXISTS FOR (c:Codex) ON (c.isActive)',
        'CREATE INDEX vision_codex_index IF NOT EXISTS FOR (v:Vision) ON (v.codexId)',
        'CREATE INDEX constraint_codex_index IF NOT EXISTS FOR (con:Constraint) ON (con.codexId)',
        'CREATE INDEX constraint_active_index IF NOT EXISTS FOR (con:Constraint) ON (con.isActive)',
        'CREATE INDEX concept_codex_index IF NOT EXISTS FOR (concept:Concept) ON (concept.codexId)',
        'CREATE INDEX concept_category_index IF NOT EXISTS FOR (concept:Concept) ON (concept.category)',
        'CREATE INDEX meta_anchor_codex_index IF NOT EXISTS FOR (m:MetaAnchor) ON (m.codexId)',
        
        // Expedition system indexes
        'CREATE INDEX expedition_starship_index IF NOT EXISTS FOR (e:Expedition) ON (e.starshipId)',
        'CREATE INDEX expedition_status_index IF NOT EXISTS FOR (e:Expedition) ON (e.status)',
        'CREATE INDEX expedition_priority_index IF NOT EXISTS FOR (e:Expedition) ON (e.priority)',
        'CREATE INDEX expedition_created_by_index IF NOT EXISTS FOR (e:Expedition) ON (e.createdBy)',
        'CREATE INDEX expedition_created_at_index IF NOT EXISTS FOR (e:Expedition) ON (e.createdAt)',
        
        'CREATE INDEX expedition_task_expedition_index IF NOT EXISTS FOR (t:ExpeditionTask) ON (t.expeditionId)',
        'CREATE INDEX expedition_task_status_index IF NOT EXISTS FOR (t:ExpeditionTask) ON (t.status)',
        'CREATE INDEX expedition_task_priority_index IF NOT EXISTS FOR (t:ExpeditionTask) ON (t.priority)',
        'CREATE INDEX expedition_task_assigned_agent_index IF NOT EXISTS FOR (t:ExpeditionTask) ON (t.assignedAgentId)',
        
        'CREATE INDEX expedition_message_expedition_index IF NOT EXISTS FOR (m:ExpeditionMessage) ON (m.expeditionId)',
        'CREATE INDEX expedition_message_role_index IF NOT EXISTS FOR (m:ExpeditionMessage) ON (m.role)',
        'CREATE INDEX expedition_message_type_index IF NOT EXISTS FOR (m:ExpeditionMessage) ON (m.messageType)',
        'CREATE INDEX expedition_message_timestamp_index IF NOT EXISTS FOR (m:ExpeditionMessage) ON (m.timestamp)',
        'CREATE INDEX expedition_message_agent_index IF NOT EXISTS FOR (m:ExpeditionMessage) ON (m.agentId)',
        'CREATE INDEX expedition_message_user_index IF NOT EXISTS FOR (m:ExpeditionMessage) ON (m.userId)',
        'CREATE INDEX expedition_message_thread_index IF NOT EXISTS FOR (m:ExpeditionMessage) ON (m.threadId)',
        
        'CREATE INDEX expedition_result_expedition_index IF NOT EXISTS FOR (r:ExpeditionResult) ON (r.expeditionId)',
        'CREATE INDEX expedition_result_type_index IF NOT EXISTS FOR (r:ExpeditionResult) ON (r.resultType)',
        'CREATE INDEX expedition_result_format_index IF NOT EXISTS FOR (r:ExpeditionResult) ON (r.format)',
        'CREATE INDEX expedition_result_created_by_index IF NOT EXISTS FOR (r:ExpeditionResult) ON (r.createdBy)',
        'CREATE INDEX expedition_result_quality_index IF NOT EXISTS FOR (r:ExpeditionResult) ON (r.quality)',
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