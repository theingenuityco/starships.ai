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
  email?: string;
  displayName?: string;
  avatar?: string;
  password?: string; // For local authentication
  createdAt: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new user
 */
export interface CreateUserRequest {
  email?: string;
  displayName?: string;
  avatar?: string;
  password?: string;
}

/**
 * Request to update user information
 */
export interface UpdateUserRequest {
  email?: string;
  displayName?: string;
  avatar?: string;
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
  email?: string;
}

/**
 * Sorting options for users
 */
export interface UserSort {
  field: 'createdAt' | 'displayName';
  direction: 'asc' | 'desc';
}
