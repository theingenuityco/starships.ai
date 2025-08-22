import { z } from 'zod';
import {
  Repository,
  BaseEntity,
  TemporalFields,
  AggregateRoot,
  UuidSchema,
  EmailSchema,
  UsernameSchema,
  DateTimeSchema
} from './shared';

/**
 * User Entity (User Identity Context - Aggregate Root)
 * 
 * Represents a user in the system with authentication and billing integration.
 * This is an aggregate root that manages user identity, authentication state,
 * and billing relationships with Stripe and Kinde.
 */
export interface User extends BaseEntity, AggregateRoot {
  /** Unique identifier for the user */
  id: string;
  
  /** Kinde authentication service user ID */
  kindeId?: string;
  
  /** Unique username for the user */
  username: string;
  
  /** User's email address */
  email?: string;
  
  /** Display name for the user */
  displayName?: string;
  
  /** Avatar URL or image path */
  avatar?: string;
  
  /** Timestamp when the user was created */
  createdAt: string;
  
  // Stripe integration fields
  /** Stripe customer ID for billing integration */
  stripeCustomerId?: string;
  
  // Aggregate root marker
  readonly _aggregateRoot: true;
}

/**
 * User Validation Schema
 * 
 * Comprehensive Zod validation schema for User entity with all business rules
 * and constraints for the User Identity Context.
 */
export const UserSchema = z.object({
  id: UuidSchema,
  kindeId: z.string().min(1, 'Kinde ID cannot be empty').optional(),
  username: UsernameSchema,
  email: EmailSchema.optional(),
  displayName: z.string()
    .min(1, 'Display name cannot be empty')
    .max(100, 'Display name must be at most 100 characters')
    .optional(),
  avatar: z.string().url('Avatar must be a valid URL').optional(),
  createdAt: DateTimeSchema,
  stripeCustomerId: z.string()
    .min(1, 'Stripe customer ID cannot be empty')
    .startsWith('cus_', 'Stripe customer ID must start with "cus_"')
    .optional(),
  _aggregateRoot: z.literal(true),
}).strict();

/**
 * User Creation Schema
 * 
 * Schema for creating new User entities, excluding auto-generated fields.
 */
export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  _aggregateRoot: true,
});

/**
 * User Update Schema
 * 
 * Schema for updating existing User entities, all fields optional.
 */
export const UpdateUserSchema = UserSchema.partial().omit({
  id: true,
  createdAt: true,
  _aggregateRoot: true,
});

/**
 * User Repository Interface (User Identity Context)
 * 
 * Repository interface for managing User entities with domain-specific
 * query methods for authentication and user management operations.
 */
export interface UserRepository extends Repository<User> {
  /**
   * Find a user by their email address
   * @param email - The email address to search for
   * @returns Promise resolving to the user or null if not found
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Find a user by their username
   * @param username - The username to search for
   * @returns Promise resolving to the user or null if not found
   */
  findByUsername(username: string): Promise<User | null>;

  /**
   * Find a user by their Kinde authentication ID
   * @param kindeId - The Kinde ID to search for
   * @returns Promise resolving to the user or null if not found
   */
  findByKindeId(kindeId: string): Promise<User | null>;

  /**
   * Find a user by their Stripe customer ID
   * @param stripeCustomerId - The Stripe customer ID to search for
   * @returns Promise resolving to the user or null if not found
   */
  findByStripeCustomerId(stripeCustomerId: string): Promise<User | null>;

  /**
   * Check if a username is available (not taken by another user)
   * @param username - The username to check
   * @param excludeUserId - Optional user ID to exclude from the check
   * @returns Promise resolving to true if available, false if taken
   */
  isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean>;

  /**
   * Check if an email is available (not taken by another user)
   * @param email - The email to check
   * @param excludeUserId - Optional user ID to exclude from the check
   * @returns Promise resolving to true if available, false if taken
   */
  isEmailAvailable(email: string, excludeUserId?: string): Promise<boolean>;

  /**
   * Update the Stripe customer ID for a user
   * @param userId - The ID of the user
   * @param stripeCustomerId - The new Stripe customer ID
   * @returns Promise resolving to the updated user or null if not found
   */
  updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<User | null>;

  /**
   * Update the Kinde ID for a user
   * @param userId - The ID of the user
   * @param kindeId - The new Kinde ID
   * @returns Promise resolving to the updated user or null if not found
   */
  updateKindeId(userId: string, kindeId: string): Promise<User | null>;

  /**
   * Find users created within a date range
   * @param startDate - Start date (ISO 8601 string)
   * @param endDate - End date (ISO 8601 string)
   * @returns Promise resolving to array of users
   */
  findByDateRange(startDate: string, endDate: string): Promise<User[]>;

  /**
   * Search users by username or display name
   * @param query - Search query string
   * @param limit - Optional limit for results (default: 50)
   * @returns Promise resolving to array of matching users
   */
  searchUsers(query: string, limit?: number): Promise<User[]>;
}

/**
 * User Domain Events
 */

export interface UserCreatedEvent {
  eventType: 'UserCreated';
  aggregateId: string;
  user: User;
  occurredAt: string;
  version: number;
}

export interface UserUpdatedEvent {
  eventType: 'UserUpdated';
  aggregateId: string;
  userId: string;
  changes: Partial<User>;
  occurredAt: string;
  version: number;
}

export interface UserStripeLinkedEvent {
  eventType: 'UserStripeLinked';
  aggregateId: string;
  userId: string;
  stripeCustomerId: string;
  occurredAt: string;
  version: number;
}

export interface UserKindeLinkedEvent {
  eventType: 'UserKindeLinked';
  aggregateId: string;
  userId: string;
  kindeId: string;
  occurredAt: string;
  version: number;
}

/**
 * User Aggregate Business Rules
 */

export const UserBusinessRules = {
  /**
   * Validates that a user has required fields for account activation
   */
  validateAccountActivation: (user: User): boolean => {
    return !!(user.username && user.email);
  },

  /**
   * Validates that a user can be linked to Stripe
   */
  validateStripeEligibility: (user: User): boolean => {
    return !!(user.email && !user.stripeCustomerId);
  },

  /**
   * Validates that a user can be linked to Kinde
   */
  validateKindeEligibility: (user: User): boolean => {
    return !user.kindeId;
  },

  /**
   * Checks if a user has complete profile information
   */
  hasCompleteProfile: (user: User): boolean => {
    return !!(user.username && user.email && user.displayName);
  }
};

/**
 * Type exports for external use
 */
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UserValidationResult = { success: true; data: User } | { success: false; error: z.ZodError };

/**
 * User Utility Functions
 */
export const UserUtils = {
  /**
   * Validates a User entity against the schema
   */
  validate: (user: any): UserValidationResult => {
    return UserSchema.safeParse(user);
  },

  /**
   * Creates a new User entity with validation
   */
  create: (input: CreateUserInput): User => {
    const user: User = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      _aggregateRoot: true,
    };
    
    const validation = UserSchema.safeParse(user);
    if (!validation.success) {
      throw new Error(`Invalid user data: ${validation.error.message}`);
    }
    
    return validation.data;
  },

  /**
   * Generates a unique username suggestion based on display name or email
   */
  generateUsernameSuggestion: (displayName?: string, email?: string): string => {
    const base = displayName || email?.split('@')[0] || 'user';
    return base
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20) + Math.random().toString(36).substring(2, 6);
  }
};