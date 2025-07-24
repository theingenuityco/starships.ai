import { RepositoryFactory, User } from '@starships/models';

interface KindeUserData {
  kindeId: string;
  email: string;
  name?: string;
  avatar?: string;
}

/**
 * Service for managing user synchronization between Kinde and local database
 */
export class UserService {
  /**
   * Sync a Kinde user to our local database
   * Creates new user or updates existing user
   */
  static async syncUser(kindeData: KindeUserData): Promise<User> {
    const userRepo = RepositoryFactory.getUserRepository();

    try {
      // First, try to find existing user by Kinde ID
      let existingUser = await userRepo.findByKindeId(kindeData.kindeId);

      if (existingUser) {
        // Update existing user with latest Kinde data
        const updatedUser = await userRepo.update(existingUser.id, {
          email: kindeData.email,
          displayName: kindeData.name,
          avatar: kindeData.avatar,
          // Keep existing username if no name provided
          username: kindeData.name || existingUser.username,
        });

        console.log(`[USER-SYNC] Updated existing user: ${existingUser.id}`);
        return updatedUser!;
      }

      // If not found by Kinde ID, check by email (in case of migration)
      existingUser = await userRepo.findByEmail(kindeData.email);

      if (existingUser) {
        // Update existing user with Kinde ID
        const updatedUser = await userRepo.update(existingUser.id, {
          kindeId: kindeData.kindeId,
          displayName: kindeData.name,
          avatar: kindeData.avatar,
          username: kindeData.name || existingUser.username,
        });

        console.log(`[USER-SYNC] Linked existing user to Kinde: ${existingUser.id}`);
        return updatedUser!;
      }

      // Create new user
      const newUser = await userRepo.create({
        kindeId: kindeData.kindeId,
        email: kindeData.email,
        username: kindeData.name || kindeData.email.split('@')[0],
        displayName: kindeData.name,
        avatar: kindeData.avatar,
      });

      console.log(`[USER-SYNC] Created new user: ${newUser.id}`);
      return newUser;
    } catch (error) {
      console.error('[USER-SYNC] Failed to sync user:', error);
      throw new Error(`Failed to sync user: ${error}`);
    }
  }

  /**
   * Get user by internal ID
   */
  static async getUserById(id: string): Promise<User | null> {
    const userRepo = RepositoryFactory.getUserRepository();
    return await userRepo.findById(id);
  }

  /**
   * Get user by Kinde ID
   */
  static async getUserByKindeId(kindeId: string): Promise<User | null> {
    try {
      console.log(`[USER-SERVICE] Getting user repository for Kinde ID: ${kindeId}`);
      const userRepo = RepositoryFactory.getUserRepository();
      console.log(`[USER-SERVICE] Repository obtained, executing findByKindeId for: ${kindeId}`);
      const result = await userRepo.findByKindeId(kindeId);
      console.log(`[USER-SERVICE] findByKindeId completed for ${kindeId}, result: ${result ? 'found' : 'not found'}`);
      return result;
    } catch (error: any) {
      console.error(`[USER-SERVICE] Error in getUserByKindeId for ${kindeId}:`, error);
      console.error(`[USER-SERVICE] Error type: ${error?.constructor?.name}`);
      console.error(`[USER-SERVICE] Error message: ${error?.message}`);
      throw error; // Re-throw to let auth middleware handle it
    }
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    const userRepo = RepositoryFactory.getUserRepository();
    return await userRepo.findByEmail(email);
  }
}
