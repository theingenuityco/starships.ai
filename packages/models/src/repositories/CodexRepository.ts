import { getConnection } from '../connection';
import { Codex, CodexRepository as CodexRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based codex repository with versioning support
 */
export class CodexRepository implements CodexRepositoryInterface {
  async findAll(): Promise<Codex[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Codex }>(
      'MATCH (c:Codex) RETURN c ORDER BY c.timestamp DESC'
    );
    return result.map(record => record.c);
  }

  async findById(id: string): Promise<Codex | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Codex }>(
      'MATCH (c:Codex) WHERE c.id = $id RETURN c',
      { id }
    );
    return result[0]?.c || null;
  }

  async findActiveByStarship(starshipId: string): Promise<Codex | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Codex }>(
      'MATCH (c:Codex) WHERE c.starshipId = $starshipId AND c.isActive = true RETURN c',
      { starshipId }
    );
    return result[0]?.c || null;
  }

  async getVersionHistory(starshipId: string): Promise<Codex[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ c: Codex }>(
      'MATCH (c:Codex) WHERE c.starshipId = $starshipId RETURN c ORDER BY c.timestamp DESC',
      { starshipId }
    );
    return result.map(record => record.c);
  }

  async create(entity: Omit<Codex, 'id' | 'createdAt'>): Promise<Codex> {
    const connection = getConnection();
    const codex: Codex = {
      ...entity,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };

    await connection.executeWrite(
      'CREATE (c:Codex $props) RETURN c',
      { props: codex }
    );

    // Create relationship with starship if active
    if (codex.isActive) {
      await connection.executeWrite(
        `MATCH (s:Starship {id: $starshipId}), (c:Codex {id: $codexId})
         CREATE (s)-[:HAS_ACTIVE_CODEX {activatedAt: $timestamp}]->(c)`,
        { 
          starshipId: codex.starshipId, 
          codexId: codex.id, 
          timestamp: codex.createdAt 
        }
      );
    }

    return codex;
  }

  async createVersion(
    starshipId: string, 
    author: string, 
    changeSummary: string
  ): Promise<Codex> {
    // Deactivate current version first
    await this.deactivateCurrentVersion(starshipId);

    // Generate next version number
    const nextVersion = await this.generateNextVersion(starshipId);

    // Create new version
    const codex = await this.create({
      starshipId,
      version: nextVersion,
      timestamp: new Date().toISOString(),
      author,
      changeSummary,
      isActive: true
    });

    return codex;
  }

  async deactivateCurrentVersion(starshipId: string): Promise<void> {
    const connection = getConnection();
    
    // Remove active codex relationship
    await connection.executeWrite(
      `MATCH (s:Starship {id: $starshipId})-[r:HAS_ACTIVE_CODEX]->(c:Codex)
       DELETE r`,
      { starshipId }
    );

    // Mark all versions as inactive
    await connection.executeWrite(
      'MATCH (c:Codex) WHERE c.starshipId = $starshipId SET c.isActive = false',
      { starshipId }
    );
  }

  async update(id: string, updates: Partial<Codex>): Promise<Codex | null> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ c: Codex }>(
      'MATCH (c:Codex) WHERE c.id = $id SET c += $updates RETURN c',
      { id, updates }
    );
    
    return result[0]?.c || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (c:Codex) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
      { id }
    );
    
    return result[0]?.deletedCount > 0;
  }

  private async generateNextVersion(starshipId: string): Promise<string> {
    const history = await this.getVersionHistory(starshipId);
    if (history.length === 0) return 'v1.0';
    
    const latestVersion = history[0].version;
    const versionParts = latestVersion.replace('v', '').split('.');
    const majorVersion = parseInt(versionParts[0]);
    const minorVersion = parseInt(versionParts[1]) + 1;
    
    return `v${majorVersion}.${minorVersion}`;
  }
} 