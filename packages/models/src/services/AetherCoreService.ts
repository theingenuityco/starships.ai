import { RepositoryFactory } from '../repositories';
import type { Starship, Codex } from '../types';

/**
 * AetherCoreService - Business logic layer for Aether Core operations
 * Handles Starship and Codex management with proper versioning
 */
export class AetherCoreService {
  private static starshipRepo = RepositoryFactory.getStarshipRepository();
  private static codexRepo = RepositoryFactory.getCodexRepository();
  private static visionRepo = RepositoryFactory.getVisionRepository();
  private static constraintRepo = RepositoryFactory.getConstraintRepository();
  private static conceptRepo = RepositoryFactory.getConceptRepository();
  private static metaAnchorRepo = RepositoryFactory.getMetaAnchorRepository();

  /**
   * Initialize starship with default codex structure
   * PATTERN: Follows existing UserService.syncUser() pattern
   */
  static async initializeStarship(ownerId: string, starshipData: {
    name: string;
    class: 'scout' | 'cruiser';
  }): Promise<{ starship: Starship; codex: Codex }> {
    // Create starship
    const starship = await this.starshipRepo.create({
      ownerId,
      name: starshipData.name,
      class: starshipData.class,
      powerLevel: 85,
      activeExpeditions: 0,
      sibilInsights: 0,
      status: 'active'
    });

    // Create initial codex
    const codex = await this.codexRepo.create({
      starshipId: starship.id,
      version: 'v1.0',
      timestamp: new Date().toISOString(),
      author: ownerId,
      changeSummary: 'Initial starship creation',
      isActive: true
    });

    // Create default vision
    await this.visionRepo.create({
      codexId: codex.id,
      statement: '',
      confidence: 0,
      lastRefined: new Date().toISOString(),
      refinementCount: 0
    });

    return { starship, codex };
  }

  /**
   * Get projection for specific lens
   * INTEGRATION POINT: Used by agent-engine for context
   */
  static async getProjection(starshipId: string, lens: 'telos' | 'ethos' | 'full' = 'telos') {
    const codex = await this.codexRepo.findActiveByStarship(starshipId);
    if (!codex) return null;

    const vision = await this.visionRepo.findByCodex(codex.id);
    const constraints = await this.constraintRepo.findByCodex(codex.id);
    const concepts = await this.conceptRepo.findByCodex(codex.id);

    switch (lens) {
      case 'telos':
        return {
          vision: vision?.statement || '',
          constraints: constraints.filter((c: any) => c.isActive && c.type === 'business')
        };
      case 'ethos':
        return {
          vision: vision?.statement || '',
          constraints: constraints.filter((c: any) => c.isActive && c.type === 'ethical'),
          concepts: concepts.filter((c: any) => c.category === 'idea')
        };
      case 'full':
        return { vision, constraints, concepts };
      default:
        return null;
    }
  }

  /**
   * Mutate codex entities with versioning
   * PATTERN: Similar to existing repository update patterns
   */
  static async mutateCodex(starshipId: string, mutations: {
    vision?: { statement: string };
    constraints?: Array<{ description: string; type: 'resource' | 'ethical' | 'technical' | 'business' }>;
  }, author: string) {
    // Create new codex version
    const newCodex = await this.codexRepo.createVersion(
      starshipId,
      author,
      'Codex updated via API'
    );

    // Apply mutations
    if (mutations.vision) {
      await this.visionRepo.create({
        codexId: newCodex.id,
        statement: mutations.vision.statement,
        confidence: Math.min(100, mutations.vision.statement.length * 2),
        lastRefined: new Date().toISOString(),
        refinementCount: 0
      });
    }


    if (mutations.constraints) {
      for (const constraint of mutations.constraints) {
        await this.constraintRepo.create({
          codexId: newCodex.id,
          type: constraint.type,
          description: constraint.description,
          severity: 'medium',
          isActive: true,
          updatedAt: new Date().toISOString()
        });
      }
    }

    return newCodex;
  }

  /**
   * Get active codex for a starship with all related entities
   */
  static async getActiveCodex(starshipId: string) {
    const codex = await this.codexRepo.findActiveByStarship(starshipId);
    if (!codex) return null;

    // Get all related entities
    const [vision, constraints, concepts] = await Promise.all([
      this.visionRepo.findByCodex(codex.id),
      this.constraintRepo.findByCodex(codex.id),
      this.conceptRepo.findByCodex(codex.id)
    ]);

    return {
      ...codex,
      vision,
      constraints,
      concepts
    };
  }

  /**
   * Check if agent is deployed on starship
   * Used for context injection validation
   */
  static async isAgentDeployedOnStarship(starshipId: string, agentId: string): Promise<boolean> {
    try {
      const deployedAgents = await this.starshipRepo.getDeployedAgents(starshipId);
      return deployedAgents.some((agent: any) => agent.id === agentId);
    } catch (error) {
      console.error('Error checking agent deployment:', error);
      return false;
    }
  }
} 