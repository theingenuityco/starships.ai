import { getRandomStarshipName } from '@/utils/starshipNames';
import { ConflictError, NotFoundError } from '@starships/errors';
import { AgentRepository, getConnection, StarshipRepository, ToolRepository } from '@starships/models';
import { CreateStarshipRequest, StarshipModel, UpdateStarshipRequest } from '@starships/protocol';
import { AgentTemplateService } from './AgentTemplateService';

export interface CreateStarshipData extends Omit<CreateStarshipRequest, 'slug'> {
  ownerId: string;
  slug?: string;
}

export interface StarshipWithDetails extends StarshipModel {
  agents: any[];
  availableSlots: number;
  deployedCount: number;
}

/**
 * Starship Service - Layer 4
 *
 * Contains business logic and orchestrates interactions between repositories.
 * Follows the layered architecture pattern established by ConversationService.
 */
export class StarshipService {
  private starshipRepository: StarshipRepository;
  private agentRepository: AgentRepository;

  constructor() {
    this.starshipRepository = new StarshipRepository();
    this.agentRepository = new AgentRepository();
  }

  /**
   * Create a new starship
   */
  async createStarship(data: CreateStarshipData): Promise<StarshipModel> {
    const starship = await this.starshipRepository.create({
      ownerId: data.ownerId,
      name: data.name,
      class: data.class,
      slug: data.slug,
      status: 'active',
    });

    return starship;
  }

  /**
   * Create a paid starship with pending payment status
   */
  async createPaidStarship(
    data: CreateStarshipData & {
      plan: 'cruiser' | 'draught';
      billingPeriod: 'monthly' | 'yearly';
    }
  ): Promise<StarshipModel> {
    const starship = await this.starshipRepository.create({
      ownerId: data.ownerId,
      name: data.name,
      class: data.class,
      slug: data.slug,
      status: 'pending_payment',
      plan: data.plan,
      billingPeriod: data.billingPeriod,
    });

    return starship;
  }

  /**
   * Get starships by owner
   */
  async getStarshipsByOwner(ownerId: string): Promise<StarshipModel[]> {
    return this.starshipRepository.findByOwner(ownerId);
  }

  /**
   * Get starship by ID or slug
   */
  async getStarship(idOrSlug: string, ownerId?: string): Promise<StarshipModel | null> {
    // Try by ID first
    let starship = await this.starshipRepository.findById(idOrSlug);

    // If not found and ownerId provided, try by slug
    if (!starship && ownerId) {
      starship = await this.starshipRepository.findBySlug(idOrSlug, ownerId);
    }

    return starship;
  }

  /**
   * Get starship with detailed information including agents
   */
  async getStarshipWithDetails(starshipId: string): Promise<StarshipWithDetails | null> {
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) return null;

    const agents = await this.starshipRepository.getDeployedAgents(starshipId);
    const availableSlots = await this.starshipRepository.getAvailableSlots(starshipId);

    return {
      ...starship,
      agents,
      availableSlots,
      deployedCount: agents.length,
    };
  }

  /**
   * Update starship
   */
  async updateStarship(starshipId: string, updates: UpdateStarshipRequest): Promise<StarshipModel | null> {
    return this.starshipRepository.update(starshipId, updates);
  }

  /**
   * Delete starship
   */
  async deleteStarship(starshipId: string): Promise<boolean> {
    return this.starshipRepository.delete(starshipId);
  }

  /**
   * Deploy agent to starship
   */
  async deployAgent(starshipId: string, agentId: string): Promise<boolean> {
    // Verify agent exists before deployment
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    // Check starship capacity
    const availableSlots = await this.starshipRepository.getAvailableSlots(starshipId);
    if (availableSlots <= 0) {
      throw new ConflictError('No available slots on this starship');
    }

    return this.starshipRepository.deployAgent(starshipId, agentId);
  }

  /**
   * Remove agent from starship
   */
  async removeAgent(starshipId: string, agentId: string): Promise<boolean> {
    return this.starshipRepository.removeAgent(starshipId, agentId);
  }

  /**
   * Get deployed agents for starship
   */
  async getDeployedAgents(starshipId: string): Promise<any[]> {
    return this.starshipRepository.getDeployedAgents(starshipId);
  }

  /**
   * Get available agent slots
   */
  async getAvailableSlots(starshipId: string): Promise<number> {
    return this.starshipRepository.getAvailableSlots(starshipId);
  }

  /**
   * Update starship status
   */
  async updateStarshipStatus(starshipId: string, status: StarshipModel['status']): Promise<boolean> {
    return this.starshipRepository.updateStatus(starshipId, status);
  }

  /**
   * Update starship payment status
   */
  async updatePaymentStatus(
    starshipId: string,
    status: 'active' | 'restricted' | 'disabled' | 'pending_payment',
    additionalFields?: Partial<StarshipModel>
  ): Promise<void> {
    return this.starshipRepository.updatePaymentStatus(starshipId, status, additionalFields);
  }

  /**
   * Update subscription details
   */
  async updateSubscription(
    starshipId: string,
    updates: {
      subscriptionId?: string;
      status?: 'active' | 'inactive' | 'restricted' | 'disabled' | 'pending_payment';
      plan?: 'scout' | 'cruiser' | 'draught';
      billingPeriod?: 'monthly' | 'yearly';
    }
  ): Promise<void> {
    return this.starshipRepository.updateSubscription(starshipId, updates);
  }

  /**
   * Find starship by subscription ID
   */
  async getStarshipBySubscriptionId(subscriptionId: string): Promise<StarshipModel | null> {
    return this.starshipRepository.findBySubscriptionId(subscriptionId);
  }

  /**
   * Find starship by Stripe customer ID
   */
  async getStarshipByStripeCustomerId(customerId: string): Promise<StarshipModel | null> {
    return this.starshipRepository.findByStripeCustomerId(customerId);
  }

  /**
   * Count free starships for user
   */
  async countFreeStarships(userId: string): Promise<number> {
    return this.starshipRepository.countFreeStarships(userId);
  }

  /**
   * Check if user can create more scout starships
   */
  async canCreateScoutStarship(userId: string): Promise<boolean> {
    const scoutCount = await this.countFreeStarships(userId);
    return scoutCount < 3; // Scout limit is 3
  }

  /**
   * Generate unique slug for starship
   */
  async generateUniqueSlug(name: string, ownerId: string): Promise<string> {
    return this.starshipRepository.generateUniqueSlug(name, ownerId);
  }

  /**
   * Check if slug is available
   */
  async isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean> {
    return this.starshipRepository.isSlugAvailable(slug, ownerId, excludeId);
  }

  /**
   * Get starship memories
   */
  async getStarshipMemories(starshipId: string): Promise<any[]> {
    return this.starshipRepository.getMemories(starshipId);
  }

  /**
   * Get memory count for starship
   */
  async getMemoryCount(starshipId: string): Promise<number> {
    return this.starshipRepository.getMemoryCount(starshipId);
  }

  /**
   * Remove memory from starship
   */
  async removeMemory(starshipId: string, memoryId: string): Promise<boolean> {
    return this.starshipRepository.removeMemory(starshipId, memoryId);
  }

  /**
   * Get starship conversations
   */
  async getStarshipConversations(starshipId: string): Promise<any[]> {
    return this.starshipRepository.getConversations(starshipId);
  }

  /**
   * Get conversation count for starship
   */
  async getConversationCount(starshipId: string): Promise<number> {
    return this.starshipRepository.getConversationCount(starshipId);
  }

  /**
   * Get active conversations for starship
   */
  async getActiveConversations(starshipId: string): Promise<any[]> {
    return this.starshipRepository.getActiveConversations(starshipId);
  }

  /**
   * Remove conversation from starship
   */
  async removeConversation(starshipId: string, conversationId: string): Promise<boolean> {
    return this.starshipRepository.removeConversation(starshipId, conversationId);
  }

  // ============================================================================
  // STATIC UTILITY METHODS (keeping existing functionality)
  // ============================================================================

  /**
   * Create a default starship for a new user
   */
  static async createDefaultStarship(userId: string): Promise<StarshipModel> {
    const starshipService = new StarshipService();

    // Generate a random name for the starship
    const starshipName = getRandomStarshipName();

    // Create the starship with scout class (free tier)
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: starshipName,
      class: 'scout',
    });

    return starship;
  }

  /**
   * Deploy default host tools to a starship for Daedalus agent
   */
  static async createDefaultTools(starshipId: string): Promise<void> {
    try {
      const toolRepository = new ToolRepository();

      // Deploy the host tools that Daedalus needs
      const defaultToolSlugs = ['tool-list', 'tool-get', 'tool-create', 'tool-update', 'tool-smoke-test', 'blueprint-lint'];

      for (const toolSlug of defaultToolSlugs) {
        try {
          await toolRepository.createFromTemplate(toolSlug, starshipId);
          console.log(`[STARSHIP-SERVICE] Deployed tool '${toolSlug}' to starship ${starshipId}`);
        } catch (error) {
          console.error(`[STARSHIP-SERVICE] Failed to deploy tool '${toolSlug}':`, error);
        }
      }

      console.log(`[STARSHIP-SERVICE] Successfully deployed ${defaultToolSlugs.length} default tools to starship ${starshipId}`);
    } catch (error) {
      console.error('[STARSHIP-SERVICE] Failed to deploy default tools:', error);
      // Don't throw error - tool deployment is optional during registration
    }
  }

  /**
   * Create the default Daedalus agent from template for a new user's starship
   */
  static async createDefaultAgent(userId: string, starshipId: string): Promise<any | null> {
    try {
      const connection = getConnection();
      const templateService = new AgentTemplateService(connection);

      // Find the "Daedalus" template to use as the default toolwright
      const templates = await templateService.searchTemplates('Daedalus');
      const defaultTemplate = templates.find((t) => t.name === 'Daedalus');

      if (!defaultTemplate) {
        console.error('[STARSHIP-SERVICE] Daedalus agent template not found - skipping agent creation');
        return null;
      }

      // Deploy default tools first so Daedalus can use them
      await StarshipService.createDefaultTools(starshipId);

      // Create agent from template with Daedalus as the default toolwright
      const defaultAgent = await templateService.createAgentFromTemplate(defaultTemplate.id, starshipId);

      return defaultAgent;
    } catch (error) {
      console.error('[STARSHIP-SERVICE] Failed to create default agent:', error);
      // Don't throw error - agent creation is optional during registration
      return null;
    }
  }
}
