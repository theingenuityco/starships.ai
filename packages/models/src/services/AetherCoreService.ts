import { RepositoryFactory } from '../repositories';
import type { Starship, Codex } from '../types';

/**
 * AetherCoreService - Business logic layer for Aether Core operations
 * Handles Starship and Codex management with proper versioning
 */
export class AetherCoreService {
  private static starshipRepo: Promise<any> = RepositoryFactory.getStarshipRepository();
  private static codexRepo: Promise<any> = RepositoryFactory.getCodexRepository();
  private static visionRepo: Promise<any> = RepositoryFactory.getVisionRepository();
  private static constraintRepo: Promise<any> = RepositoryFactory.getConstraintRepository();
  private static conceptRepo: Promise<any> = RepositoryFactory.getConceptRepository();
  private static metaAnchorRepo: Promise<any> = RepositoryFactory.getMetaAnchorRepository();

  /**
   * Initialize starship with default codex structure
   * PATTERN: Follows existing UserService.syncUser() pattern
   */
  static async initializeStarship(
    ownerId: string,
    starshipData: {
      name: string;
      class: 'scout' | 'cruiser';
    }
  ): Promise<{ starship: Starship; codex: Codex }> {
    // Generate unique slug for the starship
    const starshipRepo = await this.starshipRepo;
    const slug = await starshipRepo.generateUniqueSlug(starshipData.name, ownerId);

    // Create starship
    const starship = await starshipRepo.create({
      ownerId,
      name: starshipData.name,
      class: starshipData.class,
      slug,
      powerLevel: 85,
      activeExpeditions: 0,
      sibilInsights: 0,
      status: 'active',
    });

    // Create initial codex
    const codexRepo = await this.codexRepo;
    const codex = await codexRepo.create({
      starshipId: starship.id,
      version: 'v1.0',
      timestamp: new Date().toISOString(),
      author: ownerId,
      changeSummary: 'Initial starship creation',
      isActive: true,
    });

    // Create default vision
    const visionRepo = await this.visionRepo;
    await visionRepo.create({
      codexId: codex.id,
      statement: '',
      confidence: 0,
      lastRefined: new Date().toISOString(),
      refinementCount: 0,
    });

    return { starship, codex };
  }

  /**
   * Get projection for specific lens
   * INTEGRATION POINT: Used by agent-engine for context
   */
  static async getProjection(starshipId: string, lens: 'telos' | 'ethos' | 'full' = 'telos') {
    const codexRepo = await this.codexRepo;
    const codex = await codexRepo.findActiveByStarship(starshipId);
    if (!codex) return null;

    const visionRepo = await this.visionRepo;
    const constraintRepo = await this.constraintRepo;
    const conceptRepo = await this.conceptRepo;
    const vision = await visionRepo.findByCodex(codex.id);
    const constraints = await constraintRepo.findByCodex(codex.id);
    const concepts = await conceptRepo.findByCodex(codex.id);

    switch (lens) {
      case 'telos':
        return {
          vision: vision?.statement || '',
          constraints: constraints.filter((c: any) => c.isActive && c.type === 'business'),
        };
      case 'ethos':
        return {
          vision: vision?.statement || '',
          constraints: constraints.filter((c: any) => c.isActive && c.type === 'ethical'),
          concepts: concepts.filter((c: any) => c.category === 'idea'),
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
  static async mutateCodex(
    starshipId: string,
    mutations: {
      vision?: { statement: string };
      constraints?: Array<{
        description: string;
        type: 'resource' | 'ethical' | 'technical' | 'business';
      }>;
    },
    author: string
  ) {
    // Create new codex version
    const codexRepo = await this.codexRepo;
    const newCodex = await codexRepo.createVersion(starshipId, author, 'Codex updated via API');

    // Apply mutations
    if (mutations.vision) {
      const visionRepo = await this.visionRepo;
      await visionRepo.create({
        codexId: newCodex.id,
        statement: mutations.vision.statement,
        confidence: Math.min(100, mutations.vision.statement.length * 2),
        lastRefined: new Date().toISOString(),
        refinementCount: 0,
      });
    }

    if (mutations.constraints) {
      const constraintRepo = await this.constraintRepo;
      for (const constraint of mutations.constraints) {
        await constraintRepo.create({
          codexId: newCodex.id,
          type: constraint.type,
          description: constraint.description,
          severity: 'medium',
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return newCodex;
  }

  /**
   * Get active codex for a starship with all related entities
   */
  static async getActiveCodex(starshipId: string) {
    const codexRepo = await this.codexRepo;
    const codex = await codexRepo.findActiveByStarship(starshipId);
    if (!codex) return null;

    // Get all related entities
    const visionRepo = await this.visionRepo;
    const constraintRepo = await this.constraintRepo;
    const conceptRepo = await this.conceptRepo;
    const [vision, constraints, concepts] = await Promise.all([
      visionRepo.findByCodex(codex.id),
      constraintRepo.findByCodex(codex.id),
      conceptRepo.findByCodex(codex.id),
    ]);

    return {
      ...codex,
      vision,
      constraints,
      concepts,
    };
  }

  /**
   * Check if agent is deployed on starship
   * Used for context injection validation
   */
  static async isAgentDeployedOnStarship(starshipId: string, agentId: string): Promise<boolean> {
    try {
      const starshipRepo = await this.starshipRepo;
      const deployedAgents = await starshipRepo.getDeployedAgents(starshipId);
      return deployedAgents.some((agent: any) => agent.id === agentId);
    } catch (error) {
      console.error('Error checking agent deployment:', error);
      return false;
    }
  }
}
