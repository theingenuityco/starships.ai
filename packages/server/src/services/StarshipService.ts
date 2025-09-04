import { getRandomStarshipName } from '@/utils/starshipNames';
import { getConnection, StarshipRepository } from '@starships/models';
import { AgentTemplateService } from './AgentTemplateService';

/**
 * Service for managing starship operations
 */
export class StarshipService {
  /**
   * Create a default starship for a new user
   */
  static async createDefaultStarship(userId: string) {
    const starshipRepo = new StarshipRepository();

    try {
      // Generate a random name for the starship
      const starshipName = getRandomStarshipName();

      console.log(`[STARSHIP-SERVICE] Creating default starship "${starshipName}" for user: ${userId}`);

      // Create the starship with scout class (free tier)
      const starship = await starshipRepo.create({
        ownerId: userId,
        name: starshipName,
        class: 'scout',
        status: 'active',
      });

      return starship;
    } catch (error) {
      console.error('[STARSHIP-SERVICE] Failed to create default starship:', error);
      throw new Error(`Failed to create default starship: ${error}`);
    }
  }

  /**
   * Create a default agent from template for a new user's starship
   */
  static async createDefaultAgent(userId: string, starshipId: string) {
    try {
      const connection = getConnection();
      const templateService = new AgentTemplateService(connection);

      console.log(`[STARSHIP-SERVICE] Creating default agent for user: ${userId}, starship: ${starshipId}`);

      // Find the "General Assistant" template to use as the default
      const templates = await templateService.searchTemplates('General Assistant');
      const defaultTemplate = templates.find((t) => t.name === 'General Assistant' && t.authorId === 'system');

      if (!defaultTemplate) {
        console.error('[STARSHIP-SERVICE] Default agent template not found - skipping agent creation');
        return null;
      }

      console.log(`[STARSHIP-SERVICE] Found default template: ${defaultTemplate.name} (${defaultTemplate.id})`);

      // Create agent from template with a default name
      const defaultAgent = await templateService.createAgentFromTemplate(
        defaultTemplate.id,
        'My Assistant', // Default agent name
        userId,
        starshipId
      );

      console.log(`[STARSHIP-SERVICE] Created default agent: ${defaultAgent.name} (${defaultAgent.id})`);
      return defaultAgent;
    } catch (error) {
      console.error('[STARSHIP-SERVICE] Failed to create default agent:', error);
      // Don't throw error - agent creation is optional during registration
      return null;
    }
  }
}
