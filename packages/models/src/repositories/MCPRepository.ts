import { getConnection } from '../connection';
import { 
  MCPServer, 
  MCPTool, 
  MCPContainer, 
  MCPPermission, 
  AgentMCPPermission, 
  AgentToolCredentials,
  MCPRepository as MCPRepositoryInterface 
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based MCP repository
 */
export class MCPRepository implements MCPRepositoryInterface {
  // Server management
  async createMCPServer(server: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<MCPServer> {
    const connection = getConnection();
    const now = new Date().toISOString();
    const mcpServer: MCPServer = {
      ...server,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    await connection.executeWrite('CREATE (m:MCPServer $props) RETURN m', { props: mcpServer });
    return mcpServer;
  }

  async findMCPServerByUser(userId: string): Promise<MCPServer[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: MCPServer }>(
      'MATCH (u:User {id: $userId})-[:OWNS_MCP_SERVER]->(m:MCPServer) RETURN m ORDER BY m.createdAt DESC',
      { userId }
    );
    return result.map((record) => record.m);
  }

  async findMCPServerByAgent(agentId: string): Promise<MCPServer | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: MCPServer }>(
      'MATCH (a:Agent {id: $agentId})-[:HAS_MCP_SERVER]->(m:MCPServer) RETURN m',
      { agentId }
    );
    return result[0]?.m || null;
  }

  async updateMCPServer(id: string, updates: Partial<MCPServer>): Promise<MCPServer | null> {
    const connection = getConnection();
    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const result = await connection.executeWrite<{ m: MCPServer }>(
      'MATCH (m:MCPServer) WHERE m.id = $id SET m += $updates RETURN m',
      { id, updates: updateProps }
    );

    return result[0]?.m || null;
  }

  async deleteMCPServer(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (m:MCPServer) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  // Tool management
  async createTool(tool: Omit<MCPTool, 'id' | 'createdAt' | 'updatedAt'>): Promise<MCPTool> {
    const connection = getConnection();
    const now = new Date().toISOString();
    const mcpTool: MCPTool = {
      ...tool,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    await connection.executeWrite('CREATE (t:MCPTool $props) RETURN t', { props: mcpTool });
    return mcpTool;
  }

  async findToolsByServer(serverId: string): Promise<MCPTool[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: MCPTool }>(
      'MATCH (m:MCPServer {id: $serverId})-[:PROVIDES_TOOL]->(t:MCPTool) RETURN t ORDER BY t.name',
      { serverId }
    );
    return result.map((record) => record.t);
  }

  async findToolByName(serverId: string, name: string): Promise<MCPTool | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ t: MCPTool }>(
      'MATCH (m:MCPServer {id: $serverId})-[:PROVIDES_TOOL]->(t:MCPTool {name: $name}) RETURN t',
      { serverId, name }
    );
    return result[0]?.t || null;
  }

  async updateTool(id: string, updates: Partial<MCPTool>): Promise<MCPTool | null> {
    const connection = getConnection();
    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const result = await connection.executeWrite<{ t: MCPTool }>(
      'MATCH (t:MCPTool) WHERE t.id = $id SET t += $updates RETURN t',
      { id, updates: updateProps }
    );

    return result[0]?.t || null;
  }

  async deleteTool(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (t:MCPTool) WHERE t.id = $id DETACH DELETE t RETURN count(t) as deletedCount',
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  // Container management
  async createContainer(container: Omit<MCPContainer, 'id' | 'createdAt'>): Promise<MCPContainer> {
    const connection = getConnection();
    const mcpContainer: MCPContainer = {
      ...container,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };

    await connection.executeWrite('CREATE (c:MCPContainer $props) RETURN c', { props: mcpContainer });
    return mcpContainer;
  }

  async findContainersByUser(userId: string): Promise<MCPContainer[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: MCPContainer }>(
      'MATCH (u:User {id: $userId})-[:OWNS_MCP_SERVER]->(m:MCPServer)-[:RUNS_IN_CONTAINER]->(c:MCPContainer) RETURN c ORDER BY c.createdAt DESC',
      { userId }
    );
    return result.map((record) => record.c);
  }

  async findContainerByServer(serverId: string): Promise<MCPContainer | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: MCPContainer }>(
      'MATCH (m:MCPServer {id: $serverId})-[:RUNS_IN_CONTAINER]->(c:MCPContainer) RETURN c',
      { serverId }
    );
    return result[0]?.c || null;
  }

  async updateContainer(id: string, updates: Partial<MCPContainer>): Promise<MCPContainer | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ c: MCPContainer }>(
      'MATCH (c:MCPContainer) WHERE c.id = $id SET c += $updates RETURN c',
      { id, updates }
    );

    return result[0]?.c || null;
  }

  async deleteContainer(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (c:MCPContainer) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  // Permission management
  async grantPermission(permission: Omit<MCPPermission, 'id' | 'grantedAt'>): Promise<MCPPermission> {
    const connection = getConnection();
    const mcpPermission: MCPPermission = {
      ...permission,
      id: uuidv4(),
      grantedAt: new Date().toISOString(),
    };

    await connection.executeWrite('CREATE (p:MCPPermission $props) RETURN p', { props: mcpPermission });
    return mcpPermission;
  }

  async revokePermission(userId: string, toolName: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (p:MCPPermission) WHERE p.userId = $userId AND p.toolName = $toolName DELETE p RETURN count(p) as deletedCount',
      { userId, toolName }
    );

    return result[0]?.deletedCount > 0;
  }

  async checkPermission(userId: string, toolName: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ hasPermission: boolean }>(
      'MATCH (p:MCPPermission) WHERE p.userId = $userId AND p.toolName = $toolName AND p.granted = true RETURN p.granted as hasPermission',
      { userId, toolName }
    );

    return result[0]?.hasPermission || false;
  }

  async listUserPermissions(userId: string): Promise<MCPPermission[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ p: MCPPermission }>(
      'MATCH (p:MCPPermission) WHERE p.userId = $userId RETURN p ORDER BY p.grantedAt DESC',
      { userId }
    );
    return result.map((record) => record.p);
  }

  // Agent-specific permissions
  async grantAgentPermission(permission: Omit<AgentMCPPermission, 'id' | 'grantedAt'>): Promise<AgentMCPPermission> {
    const connection = getConnection();
    const agentPermission: AgentMCPPermission = {
      ...permission,
      id: uuidv4(),
      grantedAt: new Date().toISOString(),
    };

    await connection.executeWrite('CREATE (p:AgentMCPPermission $props) RETURN p', { props: agentPermission });
    return agentPermission;
  }

  async revokeAgentPermission(userId: string, agentId: string, toolName: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (p:AgentMCPPermission) WHERE p.userId = $userId AND p.agentId = $agentId AND p.toolName = $toolName DELETE p RETURN count(p) as deletedCount',
      { userId, agentId, toolName }
    );

    return result[0]?.deletedCount > 0;
  }

  async checkAgentPermission(userId: string, agentId: string, toolName: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ hasPermission: boolean }>(
      'MATCH (p:AgentMCPPermission) WHERE p.userId = $userId AND p.agentId = $agentId AND p.toolName = $toolName AND p.granted = true RETURN p.granted as hasPermission',
      { userId, agentId, toolName }
    );

    return result[0]?.hasPermission || false;
  }

  async listAgentPermissions(userId: string, agentId: string): Promise<AgentMCPPermission[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ p: AgentMCPPermission }>(
      'MATCH (p:AgentMCPPermission) WHERE p.userId = $userId AND p.agentId = $agentId RETURN p ORDER BY p.grantedAt DESC',
      { userId, agentId }
    );
    return result.map((record) => record.p);
  }

  // Agent-specific credentials
  async setAgentCredentials(credentials: Omit<AgentToolCredentials, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentToolCredentials> {
    const connection = getConnection();
    const now = new Date().toISOString();
    
    // First, try to find existing credentials
    const existing = await this.getAgentCredentials(credentials.userId, credentials.agentId, credentials.toolName);
    
    if (existing) {
      // Update existing credentials
      const updated = await this.updateAgentCredentials(
        credentials.userId, 
        credentials.agentId, 
        credentials.toolName, 
        credentials.encryptedCredentials
      );
      return updated!;
    } else {
      // Create new credentials
      const agentCredentials: AgentToolCredentials = {
        ...credentials,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      };

      await connection.executeWrite('CREATE (c:AgentToolCredentials $props) RETURN c', { props: agentCredentials });
      return agentCredentials;
    }
  }

  async getAgentCredentials(userId: string, agentId: string, toolName: string): Promise<AgentToolCredentials | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: AgentToolCredentials }>(
      'MATCH (c:AgentToolCredentials) WHERE c.userId = $userId AND c.agentId = $agentId AND c.toolName = $toolName RETURN c',
      { userId, agentId, toolName }
    );
    return result[0]?.c || null;
  }

  async updateAgentCredentials(userId: string, agentId: string, toolName: string, encryptedCredentials: string): Promise<AgentToolCredentials | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ c: AgentToolCredentials }>(
      'MATCH (c:AgentToolCredentials) WHERE c.userId = $userId AND c.agentId = $agentId AND c.toolName = $toolName SET c.encryptedCredentials = $encryptedCredentials, c.updatedAt = $updatedAt RETURN c',
      { userId, agentId, toolName, encryptedCredentials, updatedAt: new Date().toISOString() }
    );

    return result[0]?.c || null;
  }

  async deleteAgentCredentials(userId: string, agentId: string, toolName: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (c:AgentToolCredentials) WHERE c.userId = $userId AND c.agentId = $agentId AND c.toolName = $toolName DELETE c RETURN count(c) as deletedCount',
      { userId, agentId, toolName }
    );

    return result[0]?.deletedCount > 0;
  }
}