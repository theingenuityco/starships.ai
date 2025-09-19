/**
 * User Service - Layer 4
 *
 * Contains business logic and orchestrates interactions between repositories.
 * Follows the layered architecture pattern established by ConversationService and AgentService.
 */

import { NotFoundError, ValidationError } from '@starships/errors';
import { UserRepository } from '@starships/models';
import type { CreateUserRequest, UpdateUserRequest, UserModel } from '@starships/protocol';
import bcrypt from 'bcrypt';

export interface UserOptions {
  includePassword?: boolean;
  includeStripeData?: boolean;
}

export interface UserStats {
  totalUsers: number;
  newUsersLast30Days: number;
  activeUsers: number;
  usersWithStripe: number;
}

export interface CreateUserWithPasswordRequest {
  email: string;
  password: string;
  displayName?: string;
  name?: string; // Legacy support
}

export interface UpdateUserProfileRequest extends UpdateUserRequest {
  currentPassword?: string;
  newPassword?: string;
}

/**
 * Service class for managing users and their business operations
 */
export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  // ============================================================================
  // USER MANAGEMENT APIs
  // ============================================================================

  /**
   * Create a new user
   */
  async createUser(request: CreateUserRequest): Promise<UserModel> {
    // Business validation: Check for duplicate email
    if (request.email) {
      const existingUser = await this.userRepository.findByEmail(request.email);
      if (existingUser) {
        throw new ValidationError(`Email "${request.email}" is already registered`, 'email');
      }
    }

    const user = await this.userRepository.create(request);
    return user;
  }

  /**
   * Create user with password (for registration)
   */
  async createUserWithPassword(request: CreateUserWithPasswordRequest): Promise<UserModel> {
    // Business validation: Password strength
    if (request.password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters long', 'password');
    }

    // Business validation: Email uniqueness
    const existingUser = await this.userRepository.findByEmail(request.email);
    if (existingUser) {
      throw new ValidationError(`Email "${request.email}" is already registered`, 'email');
    }

    // Business logic: Hash password
    const hashedPassword = await bcrypt.hash(request.password, 10);

    const userData = {
      email: request.email,
      password: hashedPassword,
      displayName: request.displayName || request.name,
    };

    const user = await this.userRepository.createWithPassword(userData);

    // Return user without password for security
    const { password: _, ...safeUser } = user;
    return safeUser as UserModel;
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string, options: UserOptions = {}): Promise<UserModel | null> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      return null;
    }
    return this.transformUserForResponse(user, options);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string, options: UserOptions = {}): Promise<UserModel | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      return null;
    }
    return this.transformUserForResponse(user, options);
  }

  /**
   * Get all users (admin operation)
   */
  async getAllUsers(options: UserOptions = {}): Promise<UserModel[]> {
    const users = await this.userRepository.findAll();
    return users.map((user) => this.transformUserForResponse(user, options));
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: UpdateUserProfileRequest): Promise<UserModel> {
    // Get existing user
    const existingUser = await this.userRepository.findById(userId);
    if (!existingUser) {
      throw new NotFoundError('User', userId);
    }

    // Business validation: Email uniqueness (if changing)
    if (updates.email && updates.email !== existingUser.email) {
      const existingUserByEmail = await this.userRepository.findByEmail(updates.email);
      if (existingUserByEmail) {
        throw new ValidationError(`Email "${updates.email}" is already registered`, 'email');
      }
    }

    // Business logic: Password change
    const updateData: any = { ...updates };
    if (updates.newPassword) {
      // Verify current password if provided
      if (updates.currentPassword) {
        const isCurrentPasswordValid = await bcrypt.compare(updates.currentPassword, existingUser.password || '');
        if (!isCurrentPasswordValid) {
          throw new ValidationError('Current password is incorrect', 'currentPassword');
        }
      }

      // Hash new password
      updateData.password = await bcrypt.hash(updates.newPassword, 10);
    }

    // Remove password-related fields from update data
    const { currentPassword, newPassword, ...cleanUpdates } = updateData;

    const updatedUser = await this.userRepository.update(userId, cleanUpdates);
    if (!updatedUser) {
      throw new NotFoundError('User', userId);
    }

    return this.transformUserForResponse(updatedUser, { includePassword: false });
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<boolean> {
    // Business rule: Check if user exists
    const existingUser = await this.userRepository.findById(userId);
    if (!existingUser) {
      throw new NotFoundError('User', userId);
    }

    // Future business rule: Check dependencies (starships, conversations, etc.)
    // For now, we allow deletion (DETACH DELETE in repository handles relationships)

    return await this.userRepository.delete(userId);
  }

  /**
   * Authenticate user (for login)
   */
  async authenticateUser(email: string, password: string): Promise<UserModel | null> {
    const user = await this.userRepository.findByEmailWithPassword(email);
    if (!user || !user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    // Return user without password for security
    return this.transformUserForResponse(user, { includePassword: false });
  }

  // ============================================================================
  // STRIPE INTEGRATION BUSINESS LOGIC
  // ============================================================================

  /**
   * Link user to Stripe customer
   */
  async linkStripeCustomer(userId: string, stripeCustomerId: string): Promise<void> {
    // Business validation: User exists
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Business validation: Stripe customer ID format
    if (!stripeCustomerId.startsWith('cus_')) {
      throw new ValidationError('Invalid Stripe Customer ID format', 'stripeCustomerId');
    }

    // Business validation: Stripe customer ID uniqueness
    const existingUserWithStripe = await this.userRepository.findByStripeCustomerId(stripeCustomerId);
    if (existingUserWithStripe && existingUserWithStripe.id !== userId) {
      throw new ValidationError('Stripe Customer ID is already linked to another user', 'stripeCustomerId');
    }

    await this.userRepository.updateStripeCustomerId(userId, stripeCustomerId);
  }

  /**
   * Get user by Stripe customer ID
   */
  async getUserByStripeCustomerId(stripeCustomerId: string, options: UserOptions = {}): Promise<UserModel | null> {
    const user = await this.userRepository.findByStripeCustomerId(stripeCustomerId);
    if (!user) {
      return null;
    }
    return this.transformUserForResponse(user, options);
  }

  // ============================================================================
  // BUSINESS ANALYTICS AND STATISTICS
  // ============================================================================

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<UserStats> {
    const allUsers = await this.userRepository.findAll();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const newUsersLast30Days = allUsers.filter((user) => new Date(user.createdAt) >= thirtyDaysAgo).length;

    const usersWithStripe = allUsers.filter((user) => user.stripeCustomerId).length;

    // Active users = users who have logged in or created content recently
    // For now, we'll count all users as active since we don't track login timestamps
    const activeUsers = allUsers.length;

    return {
      totalUsers: allUsers.length,
      newUsersLast30Days,
      activeUsers,
      usersWithStripe,
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Transform user data for response based on options
   */
  private transformUserForResponse(user: UserModel, options: UserOptions): UserModel {
    const result = { ...user };

    // Remove password unless explicitly requested
    if (!options.includePassword) {
      delete result.password;
    }

    // Remove Stripe data unless explicitly requested
    if (!options.includeStripeData) {
      delete result.stripeCustomerId;
    }

    return result;
  }

  // ============================================================================
  // STATIC HELPER METHODS
  // ============================================================================

  /**
   * Static method for quick user authentication (for middleware)
   */
  static async authenticateUserStatic(email: string, password: string): Promise<UserModel | null> {
    const userService = new UserService();
    return userService.authenticateUser(email, password);
  }

  /**
   * Static method for quick user lookup by ID
   */
  static async getUserByIdStatic(id: string): Promise<UserModel | null> {
    const userService = new UserService();
    return userService.getUserById(id);
  }

  /**
   * Static method for quick user lookup by email
   */
  static async getUserByEmailStatic(email: string): Promise<UserModel | null> {
    const userService = new UserService();
    return userService.getUserByEmail(email);
  }

  /**
   * Legacy method compatibility
   */
  static async getUserById(id: string): Promise<UserModel | null> {
    return UserService.getUserByIdStatic(id);
  }

  /**
   * Legacy method compatibility
   */
  static async getUserByEmail(email: string): Promise<UserModel | null> {
    return UserService.getUserByEmailStatic(email);
  }

  /**
   * Legacy method compatibility
   */
  static async getUserByEmailWithPassword(email: string): Promise<UserModel | null> {
    const userService = new UserService();
    return userService.userRepository.findByEmailWithPassword(email);
  }

  /**
   * Legacy method compatibility
   */
  static async createUser(userData: CreateUserWithPasswordRequest): Promise<UserModel> {
    const userService = new UserService();
    return userService.createUserWithPassword(userData);
  }
}
