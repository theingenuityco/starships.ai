/**
 * User Domain Types
 * 
 * Clean user type definitions for protocol contract.
 */

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * Core user entity
 */
export interface User {
  id: string;
  kindeId?: string;
  username: string;
  email?: string;
  displayName?: string;
  avatar?: string;
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
  user: User;
}

/**
 * User list response
 */
export interface UserListResponse {
  users: User[];
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