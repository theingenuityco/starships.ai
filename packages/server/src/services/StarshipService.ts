import { getRandomStarshipName } from '@/utils/starshipNames';
import { ensureLobbyRoomForStarship } from '@/utils/default-room';
import { ConflictError, NotFoundError } from '@starships/errors';
import {
  AgentRepository,
  StarshipMemberRepository,
  StarshipRepository,
  ToolRepository,
  ToolTemplateRepository,
  UserRepository,
} from '@starships/models';
import type { AgentModel, AuthUser, StarshipModel, UpdateStarshipRequest } from '@starships/protocol';
import { AgentTemplateService } from './AgentTemplateService';
import { WalletService } from './WalletService';
import { SubscriptionPlanCatalogService } from './SubscriptionPlanCatalogService';
import { logger } from '@/utils/logger';

export interface CreateStarshipData {
  ownerId: string;
  name: string;
  shipClass?: 'scout' | 'frigate';
  maxAgents?: number;
  maxConcurrentTurns?: number;
  initialCredits?: number;
}

export interface StarshipWithDetails extends StarshipModel {
  agents: AgentModel[];
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
  private starshipMemberRepository: StarshipMemberRepository;
  private toolRepository: ToolRepository;
  private toolTemplateRepository: ToolTemplateRepository;

  constructor() {
    this.starshipRepository = new StarshipRepository();
    this.agentRepository = new AgentRepository();
    this.userRepository = new UserRepository();
    this.starshipMemberRepository = new StarshipMemberRepository();
    this.toolRepository = new ToolRepository();
    this.toolTemplateRepository = new ToolTemplateRepository();
  }

  private async ensureBaselineStarshipToolsAllowed(starshipId: string): Promise<void> {
    const requiredBaseTemplateSlugs = ['read-url', 'read-older-messages'] as const;

    // Snapshot existing tools + starship-level permission rows so we can:
    // - avoid re-deploy when a tool is already deployed
    // - avoid creating duplicate starship_tools rows when an allow mapping already exists
    const [tools, starshipToolPerms] = await Promise.all([
      this.toolRepository.findByStarship(starshipId),
      this.agentRepository.getStarshipToolPermissions(starshipId),
    ]);
    const slugToSourceTemplateId = new Map<string, string | null | undefined>(tools.map((t) => [t.slug, t.sourceTemplateId]));

    for (const baseSlug of requiredBaseTemplateSlugs) {
      const templateId = await this.toolTemplateRepository.resolveTemplateIdForAssignedSlug(baseSlug);
      if (!templateId) continue;

      // If a starship_tools mapping already exists for any tool instance created from this template,
      // prefer updating THAT mapping to allow, to avoid creating duplicate mapped instances.
      const mapped = starshipToolPerms.find((p) => slugToSourceTemplateId.get(p.toolSlug) === templateId);
      if (mapped) {
        if (mapped.permission !== 'allow') {
          await this.agentRepository.setStarshipToolPermissionBySlug({ starshipId, toolSlug: mapped.toolSlug, permission: 'allow' });
        }
        continue;
      }

      // No mapping exists yet. Deploy tool instance if missing (by template linkage) and map it.
      let deployed = await this.toolRepository.findByTemplateIdAndStarship(templateId, starshipId);
      if (!deployed) {
        deployed = await this.toolRepository.createFromTemplateId(templateId, starshipId, {});
      }
      await this.agentRepository.setStarshipToolPermissionBySlug({ starshipId, toolSlug: deployed.slug, permission: 'allow' });
    }
  }

  /**
   * Create a new starship
   */
  async createStarship(data: CreateStarshipData): Promise<StarshipModel> {
    const shipClass = data.shipClass ?? 'scout';

    // Default entitlements should come from the Scout plan when available (Stripe metadata),
    // falling back to hard-coded Scout defaults if the plan catalog is unavailable/missing.
    const scoutEntitlements = shipClass === 'scout' ? await SubscriptionPlanCatalogService.getEntitlementsForShipClass('scout') : null;
    const fallbackScout = { maxAgents: 10, maxConcurrentTurns: 3 };
    const defaultEntitlements = scoutEntitlements ?? fallbackScout;

    const starship = await this.starshipRepository.create({
      ownerId: data.ownerId,
      name: data.name,
      description: '',
      shipClass,
      maxAgents: data.maxAgents ?? defaultEntitlements.maxAgents,
      maxConcurrentTurns: data.maxConcurrentTurns ?? defaultEntitlements.maxConcurrentTurns,
      status: 'active',
    });

    // Auto-create wallet for this starship with optional initial credits (default: 0)
    try {
      const walletService = new WalletService();
      const initialCredits = data.initialCredits ?? 0;
      await walletService.createForStarship(starship.id, initialCredits);
      // Optional: silent success
    } catch (err) {
      // Log and continue - starship creation should not fail due to wallet issues
      logger.error('[StarshipService] Failed to create wallet for starship', {
        starshipId: starship.id,
        operation: 'create_wallet',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Ensure every starship has a default public room (e.g. #lobby).
    // This must succeed; otherwise the starship isn't usable in the rooms-first UI.
    try {
      await ensureLobbyRoomForStarship({ starshipId: starship.id, createdByUserId: data.ownerId });
    } catch (err) {
      logger.error('[StarshipService] Failed to create default room for starship; rolling back', {
        starshipId: starship.id,
        operation: 'create_default_room',
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await this.starshipRepository.delete(starship.id);
      } catch {
        /* ignore */
      }
      throw err;
    }

    // Ensure required baseline tools are deployed and allowed at the starship level.
    // Best-effort: avoid breaking starship creation if tool seeding/deploy hits a transient issue.
    try {
      await this.ensureBaselineStarshipToolsAllowed(starship.id);
    } catch (err) {
      logger.error('[StarshipService] Failed to ensure required tools for starship', {
        starshipId: starship.id,
        operation: 'ensure_baseline_tools',
        error: err instanceof Error ? err.message : String(err),
      });
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
   * Get starships a user can access (owned + member).
   */
  async getStarshipsForUser(userId: string): Promise<StarshipModel[]> {
    return this.starshipRepository.findAccessibleByUser(userId);
  }

  /**
   * Get starship by ID or slug
   */
  async getStarship(idOrSlug: string, ownerId?: string): Promise<StarshipModel | null> {
    // Try by ID first
    let starship = await this.starshipRepository.findById(idOrSlug);

    // If not found and userId provided, try by slug for this user's access scope
    if (!starship && ownerId) {
      starship = await this.starshipRepository.findBySlugForUser(idOrSlug, ownerId);
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
  async getDeployedAgents(starshipId: string): Promise<AgentModel[]> {
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
  async getStarshipMemories(starshipId: string): Promise<unknown[]> {
    // TODO: Implement memory management when the feature is needed
    logger.warn('[StarshipService] Memory management not yet implemented for starship', {
      starshipId,
      operation: 'get_starship_memories',
    });
    return [];
  }

  /**
   * Get memory count for starship (placeholder - feature not implemented yet)
   */
  async getMemoryCount(starshipId: string): Promise<number> {
    // TODO: Implement memory management when the feature is needed
    logger.warn('[StarshipService] Memory management not yet implemented for starship', {
      starshipId,
      operation: 'get_memory_count',
    });
    return 0;
  }

  /**
   * Remove memory from starship (placeholder - feature not implemented yet)
   */
  async removeMemory(starshipId: string, memoryId: string): Promise<boolean> {
    // TODO: Implement memory management when the feature is needed
    logger.warn('[StarshipService] Memory management not yet implemented for starship', {
      starshipId,
      memoryId,
      operation: 'remove_memory',
    });
    return false;
  }

  /**
   * Get starship conversations
   */
  async getStarshipConversations(starshipId: string): Promise<Record<string, unknown>[]> {
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
  async getActiveConversations(starshipId: string): Promise<Record<string, unknown>[]> {
    return this.starshipRepository.getActiveConversations(starshipId);
  }

  /**
   * Remove conversation from starship
   */
  async removeConversation(starshipId: string, conversationId: string): Promise<boolean> {
    return this.starshipRepository.removeConversation(starshipId, conversationId);
  }

  /**
   * Check if user has access to starship (owner, collaborator, or instance admin).
   *
   * NOTE: This is collaborator-level access (non-billing). Use hasOwnerAccess() for
   * subscription/billing/destructive operations.
   */
  async hasAccess(userId: string, starshipId: string): Promise<boolean> {
    return this.hasCollaboratorAccess(userId, starshipId);
  }

  /**
   * Collaborator access:
   * - Owner always has access
   * - Instance admins have access
   * - Members in starship_members have access
   */
  async hasCollaboratorAccess(userId: string, starshipId: string): Promise<boolean> {
    try {
      const [starship, user] = await Promise.all([this.starshipRepository.findById(starshipId), this.userRepository.findById(userId)]);

      if (!starship || !user) return false;

      if (starship.ownerId === userId || Boolean((user as AuthUser).isInstanceAdmin)) return true;

      return await this.starshipMemberRepository.isMember(userId, starshipId);
    } catch (error) {
      logger.error('[StarshipService] Error checking collaborator access', {
        userId,
        starshipId,
        operation: 'has_collaborator_access',
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Owner access:
   * - Owner always has access
   * - Instance admins have access
   *
   * Use this for billing/subscription/destructive operations.
   */
  async hasOwnerAccess(userId: string, starshipId: string): Promise<boolean> {
    try {
      const [starship, user] = await Promise.all([this.starshipRepository.findById(starshipId), this.userRepository.findById(userId)]);
      if (!starship || !user) return false;
      return starship.ownerId === userId || Boolean((user as AuthUser).isInstanceAdmin);
    } catch (error) {
      logger.error('[StarshipService] Error checking owner access', {
        userId,
        starshipId,
        operation: 'has_owner_access',
        error: error instanceof Error ? error.message : String(error),
      });
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

    // Check if user has access (collaborator-level)
    if (!(await this.hasCollaboratorAccess(userId, starshipId))) {
      return null;
    }

    return starship;
  }

  // ============================================================================
  // STATIC UTILITY METHODS (keeping existing functionality)
  // ============================================================================

  /**
   * Create a default starship for a new user with 200 welcome credits.
   *
   * Provisioning expectations:
   * - Deploy baseline starship-level tools (read-url, read-older-messages)
   * - Deploy the initial default agent (Aria) and her assigned tools
   */
  static async createDefaultStarship(userId: string): Promise<StarshipModel> {
    const starshipService = new StarshipService();

    // Generate a random name for the starship
    const starshipName = getRandomStarshipName();

    // Create the starship with default settings and 200 welcome credits
    const starship = await starshipService.createStarship({
      ownerId: userId,
      name: starshipName,
      shipClass: 'scout',
      initialCredits: 200, // 200 welcome credits for new users
    });

    // Deploy Aria + her tools/permissions. Best-effort: the starship should still exist even if
    // the template/tooling layer is temporarily unavailable.
    try {
      await StarshipService.createInitialAgents(userId, starship.id);
    } catch (err) {
      logger.error('[StarshipService] Failed to create initial agents for default starship', {
        starshipId: starship.id,
        userId,
        operation: 'create_initial_agents_default_starship',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return starship;
  }

  /**
   * Create initial agent for a new starship: Aria only (Executive Officer).
   * Aria's tools are deployed by AgentTemplateService when creating from template.
   * Returns a map of created agents by name when created.
   */
  static async createInitialAgents(userId: string, starshipId: string): Promise<Record<string, AgentModel>> {
    const created: Record<string, AgentModel> = {};
    try {
      const templateService = new AgentTemplateService();
      const agentRepo = new AgentRepository();

      const ariaTemplates = await templateService.searchTemplates('Aria');
      const ariaTemplate = ariaTemplates.find((t) => t.name === 'Aria');

      if (ariaTemplate) {
        try {
          const aria = await templateService.createAgentFromTemplate(ariaTemplate.id, starshipId);
          if (aria?.id) {
            await agentRepo.setAllAssignedToolPermissionsForAgent(aria.id, 'allow');
          }
          if (aria) created['Aria'] = aria;
        } catch (err) {
          logger.error('[StarshipService] Failed to create Aria agent', {
            starshipId,
            userId,
            operation: 'create_aria_agent',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        logger.warn('[StarshipService] Aria template not found - skipping Aria creation', {
          starshipId,
          userId,
          operation: 'create_initial_agents',
        });
      }

      return created;
    } catch (error) {
      logger.error('[StarshipService] Failed to create initial agents', {
        starshipId,
        userId,
        operation: 'create_initial_agents',
        error: error instanceof Error ? error.message : String(error),
      });
      return created;
    }
  }
}
