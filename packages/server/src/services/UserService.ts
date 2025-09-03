import { UserRepository } from '@starships/models';
import { UserModel } from '@starships/protocol';
import { StarshipService } from './StarshipService';

/**
 * Service for managing users in local database
 */
export class UserService {

  /**
   * Get user by internal ID
   */
  static async getUserById(id: string): Promise<UserModel | null> {
    const userRepo = new UserRepository();
    return await userRepo.findById(id);
  }


  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<UserModel | null> {
    const userRepo = new UserRepository();
    return await userRepo.findByEmail(email);
  }

  /**
   * Get user by email with password (for authentication)
   */
  static async getUserByEmailWithPassword(email: string): Promise<UserModel | null> {
    const userRepo = new UserRepository();
    return await userRepo.findByEmailWithPassword(email);
  }

  /**
   * Create user with password (for registration)
   */
  static async createUser(userData: {
    email: string;
    password: string;
    name?: string;
    displayName?: string;
    username?: string;
  }): Promise<UserModel> {
    const userRepo = new UserRepository();
    return await userRepo.createWithPassword(userData);
  }

}
