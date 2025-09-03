/**
 * User Collection Types
 *
 * Clean user type definitions for protocol contract.
 */

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * Core user entity
 */
export interface UserModel {
  id: string;
  kindeId?: string;
  username: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  password?: string; // For local authentication
  createdAt: string;
  
  // Stripe integration
  stripeCustomerId?: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new user
 */
export interface CreateUserRequest {
  kindeId?: string;
  username: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  password?: string;
  stripeCustomerId?: string;
}

/**
 * Request to update user information
 */
export interface UpdateUserRequest {
  username?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  stripeCustomerId?: string;
}

/**
 * User response structure
 */
export interface UserResponse {
  user: UserModel;
}

/**
 * User list response
 */
export interface UserListResponse {
  users: UserModel[];
  total: number;
}

// ============================================================================
// FILTER AND QUERY TYPES
// ============================================================================

/**
 * Filters for querying users
 */
export interface UserFilters {
  kindeId?: string;
  username?: string;
  email?: string;
}

/**
 * Sorting options for users
 */
export interface UserSort {
  field: 'createdAt' | 'username' | 'displayName';
  direction: 'asc' | 'desc';
}