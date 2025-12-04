import { getRandomStarshipName } from '@/utils/starshipNames';
import { ConflictError, NotFoundError } from '@starships/errors';
import { AgentRepository, getConnection, StarshipRepository, ToolRepository, UserRepository } from '@starships/models';
import { StarshipModel, UpdateStarshipRequest } from '@starships/protocol';
import { AgentTemplateService } from './AgentTemplateService';
import { WalletService } from './WalletService';

export interface CreateStarshipData {
  ownerId: string;
  name: string;
  maxAgents?: number;
  initialWalletBalance?: number;
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
  private userRepository: UserRepository;

  constructor() {
    this.starshipRepository = new StarshipRepository();
    this.agentRepository = new AgentRepository();
    this.userRepository = new UserRepository();
  }

  /**
   * Create a new starship
   */
  async createStarship(data: CreateStarshipData): Promise<StarshipModel> {
    const starship = await this.starshipRepository.create({
      ownerId: data.ownerId,
      name: data.name,
      maxAgents: data.maxAgents ?? 8,
      status: 'active',
    });

    // Auto-create wallet for this starship with optional initial balance (default: $0)
    try {
      const walletService = new WalletService();
      const initialBalance = data.initialWalletBalance ?? 0;
      await walletService.createForStarship(starship.id, initialBalance);
      // Optional: silent success
    } catch (err) {
      // Log and continue - starship creation should not fail due to wallet issues
      console.error('[STARSHIP-SERVICE] Failed to create wallet for starship:', starship.id, err);
    }

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
   * Get starship memories (placeholder - feature not implemented yet)
   */
  async getStarshipMemories(starshipId: string): Promise<any[]> {
    // TODO: Implement memory management when the feature is needed
    console.warn(`Memory management not yet implemented for starship ${starshipId}`);
    return [];
  }

  /**
   * Get memory count for starship (placeholder - feature not implemented yet)
   */
  async getMemoryCount(starshipId: string): Promise<number> {
    // TODO: Implement memory management when the feature is needed
    console.warn(`Memory management not yet implemented for starship ${starshipId}`);
    return 0;
  }

  /**
   * Remove memory from starship (placeholder - feature not implemented yet)
   */
  async removeMemory(starshipId: string, memoryId: string): Promise<boolean> {
    // TODO: Implement memory management when the feature is needed
    console.warn(`Memory management not yet implemented for starship ${starshipId} memory ${memoryId}`);
    return false;
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

  /**
   * Check if user has access to starship (owner or member)
   */
  async hasAccess(userId: string, starshipId: string): Promise<boolean> {
    try {
      const [starship, user] = await Promise.all([
        this.starshipRepository.findById(starshipId),
        this.userRepository.findById(userId),
      ]);

      if (!starship || !user) {
        return false;
      }

      // Check if user is the owner or instance admin
      if (starship.ownerId === userId || (user as any).isInstanceAdmin) {
        return true;
      }

      // TODO: Add team membership checks when team functionality is implemented
      // For now, only owners have access

      return false;
    } catch (error) {
      console.error('[STARSHIP-SERVICE] Error checking starship access:', error);
      return false;
    }
  }

  /**
   * Get starship by ID with access verification
   */
  async getStarshipWithAccess(userId: string, starshipId: string): Promise<StarshipModel | null> {
    const starship = await this.starshipRepository.findById(starshipId);
    if (!starship) {
      return null;
    }

    // Check if user has access
    if (starship.ownerId !== userId) {
      return null;
    }

    return starship;
  }

  // ============================================================================
  // STATIC UTILITY METHODS (keeping existing functionality)
  // ============================================================================

  /**
   * Create a default starship for a new user with $10 welcome credit
   */
  static async createDefaultStarship(userId: string): Promise<StarshipModel> {
    const starshipService = new StarshipService();

    // Generate a random name for the starship
    const starshipName = getRandomStarshipName();

    // Create the starship with default settings and $10 welcome credit
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: starshipName,
      maxAgents: 8,
      initialWalletBalance: 10, // $10 welcome credit for new users
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
      const defaultToolSlugs = [
        'search-docs',
        'get-doc',
        'list-tools',
        'get-tool',
        'open-tool',
        'edit-tool',
        'test-tool',
      ];

      for (const toolSlug of defaultToolSlugs) {
        try {
          const existing = await toolRepository.findByTemplateSlugAndStarship(toolSlug, starshipId);
          if (!existing) {
            await toolRepository.createFromTemplate(toolSlug, starshipId);
            console.log(`[STARSHIP-SERVICE] Deployed tool from template '${toolSlug}' to starship ${starshipId}`);
          } else {
            console.log(`[STARSHIP-SERVICE] Tool from template '${toolSlug}' already present on starship ${starshipId}`);
          }
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
      const templateService = new AgentTemplateService();

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

  /**
   * Create initial agents for a new starship: Daedalus (toolwright) and Gaia (agent creator)
   * - Deploys default tools once
   * - Creates Daedalus if available
   * - Creates Gaia if available
   * Returns a map of created agents by name when created
   */
  static async createInitialAgents(userId: string, starshipId: string): Promise<Record<string, any>> {
    const created: Record<string, any> = {};
    try {
      const templateService = new AgentTemplateService();

      // Ensure default tools are deployed once so agents relying on them have what they need
      await StarshipService.createDefaultTools(starshipId);

      // Fetch templates relevant to initial agents
      const daedalusTemplates = await templateService.searchTemplates('Daedalus');
      const gaiaTemplates = await templateService.searchTemplates('Gaia');

      const daedalusTemplate = daedalusTemplates.find((t) => t.name === 'Daedalus');
      const gaiaTemplate = gaiaTemplates.find((t) => t.name === 'Gaia');

      // Create Daedalus if present
      if (daedalusTemplate) {
        try {
          const daedalus = await templateService.createAgentFromTemplate(daedalusTemplate.id, starshipId);
          created['Daedalus'] = daedalus;
        } catch (err) {
          console.error('[STARSHIP-SERVICE] Failed to create Daedalus agent:', err);
        }
      } else {
        console.warn('[STARSHIP-SERVICE] Daedalus template not found - skipping Daedalus creation');
      }

      // Create Gaia if present
      if (gaiaTemplate) {
        try {
          const gaia = await templateService.createAgentFromTemplate(gaiaTemplate.id, starshipId);
          created['Gaia'] = gaia;
        } catch (err) {
          console.error('[STARSHIP-SERVICE] Failed to create Gaia agent:', err);
        }
      } else {
        console.warn('[STARSHIP-SERVICE] Gaia template not found - skipping Gaia creation');
      }

      return created;
    } catch (error) {
      console.error('[STARSHIP-SERVICE] Failed to create initial agents:', error);
      return created;
    }
  }
}
