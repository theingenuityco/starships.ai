import { StarshipRepository } from '@starships/models';
import { getRandomStarshipName } from '@/utils/starshipNames';

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
}
