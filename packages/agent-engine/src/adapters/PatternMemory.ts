/**
 * PatternMemory - Neo4j-based pattern storage for successful transformations
 * 
 * Stores and retrieves successful parameter transformations to build up
 * a memory of what works for each tool.
 */

import { Neo4jConnection } from '@starships/models';
import { createHash } from 'crypto';

export class PatternMemory {
  private MIN_SUCCESS_COUNT = 3; // Only use patterns that worked 3+ times
  private PATTERN_TTL_DAYS = 90; // Clean up unused patterns after 90 days
  
  constructor(private neo4j: Neo4jConnection) {}
  
  /**
   * Get a cached pattern transformation from Neo4j
   */
  async getPattern(templateSlug: string, toolName: string, input: any): Promise<any | null> {
    const inputHash = this.hashInput(input);
    const toolId = `${templateSlug}_${toolName}`;
    
    try {
      const result = await this.neo4j.executeWrite(`
        MATCH (p:ParameterPattern {
          toolId: $toolId,
          inputHash: $inputHash
        })
        WHERE p.successCount >= $minSuccess
        SET p.lastUsed = timestamp()
        RETURN p.transformation as transformation
        LIMIT 1
      `, {
        toolId,
        inputHash,
        minSuccess: this.MIN_SUCCESS_COUNT
      });
      
      if (result.length > 0) {
        const transformation = result[0].transformation;
        return JSON.parse(transformation);
      }
      
      return null;
    } catch (error) {
      console.error('[PatternMemory] Error retrieving pattern:', error);
      return null;
    }
  }
  
  /**
   * Save a successful transformation pattern
   */
  async savePattern(templateSlug: string, toolName: string, input: any, output: any): Promise<void> {
    const inputHash = this.hashInput(input);
    const toolId = `${templateSlug}_${toolName}`;
    const transformation = JSON.stringify(output);
    
    try {
      await this.neo4j.executeWrite(`
        MERGE (p:ParameterPattern {
          toolId: $toolId,
          inputHash: $inputHash
        })
        ON CREATE SET 
          p.id = randomUUID(),
          p.inputStructure = $inputStructure,
          p.transformation = $transformation,
          p.successCount = 1,
          p.createdAt = timestamp(),
          p.lastUsed = timestamp()
        ON MATCH SET
          p.successCount = p.successCount + 1,
          p.transformation = $transformation,
          p.lastUsed = timestamp()
      `, {
        toolId,
        inputHash,
        inputStructure: this.getInputStructure(input),
        transformation
      });
    } catch (error) {
      console.error('[PatternMemory] Error saving pattern:', error);
    }
  }
  
  /**
   * Record a pattern failure (optional - for future learning)
   */
  async recordFailure(templateSlug: string, toolName: string, input: any, error: string): Promise<void> {
    const inputHash = this.hashInput(input);
    const toolId = `${templateSlug}_${toolName}`;
    
    try {
      await this.neo4j.executeWrite(`
        MERGE (f:PatternFailure {
          toolId: $toolId,
          inputHash: $inputHash
        })
        ON CREATE SET
          f.id = randomUUID(),
          f.errorMessage = $error,
          f.failureCount = 1,
          f.firstSeen = timestamp(),
          f.lastSeen = timestamp()
        ON MATCH SET
          f.failureCount = f.failureCount + 1,
          f.lastSeen = timestamp(),
          f.errorMessage = $error
      `, {
        toolId,
        inputHash,
        error
      });
    } catch (err) {
      console.error('[PatternMemory] Error recording failure:', err);
    }
  }
  
  /**
   * Clean up old unused patterns
   */
  async cleanupOldPatterns(): Promise<number> {
    const cutoffTime = Date.now() - (this.PATTERN_TTL_DAYS * 24 * 60 * 60 * 1000);
    
    try {
      const result = await this.neo4j.executeWrite(`
        MATCH (p:ParameterPattern)
        WHERE p.lastUsed < $cutoff
        WITH p LIMIT 1000
        DELETE p
        RETURN count(p) as deleted
      `, { cutoff: cutoffTime });
      
      const deleted = result[0]?.deleted || 0;
      console.log(`[PatternMemory] Cleaned up ${deleted} old patterns`);
      return deleted;
    } catch (error) {
      console.error('[PatternMemory] Error cleaning patterns:', error);
      return 0;
    }
  }
  
  /**
   * Get statistics about stored patterns
   */
  async getStats(): Promise<any> {
    try {
      const result = await this.neo4j.executeQuery(`
        MATCH (p:ParameterPattern)
        RETURN 
          count(p) as totalPatterns,
          avg(p.successCount) as avgSuccessCount,
          max(p.successCount) as maxSuccessCount,
          count(DISTINCT p.toolId) as uniqueTools
      `);
      
      return result[0] || {};
    } catch (error) {
      console.error('[PatternMemory] Error getting stats:', error);
      return {};
    }
  }
  
  /**
   * Create a hash of the input structure (not values)
   */
  private hashInput(input: any): string {
    const structure = this.getInputStructure(input);
    return createHash('sha256').update(structure).digest('hex').substring(0, 16);
  }
  
  /**
   * Get the structure of input (keys and types, not values)
   */
  private getInputStructure(input: any): string {
    const getStructure = (obj: any): any => {
      if (obj === null) return 'null';
      if (obj === undefined) return 'undefined';
      if (Array.isArray(obj)) return 'array';
      if (typeof obj !== 'object') return typeof obj;
      
      const structure: any = {};
      for (const key of Object.keys(obj).sort()) {
        structure[key] = getStructure(obj[key]);
      }
      return structure;
    };
    
    return JSON.stringify(getStructure(input));
  }
}