/**
 * User Collection Types
 *
 * Clean user type definitions for protocol contract.
 */

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * Authentication method types
 */
export type AuthMethod = 'password' | 'google' | 'github';

/**
 * Core user entity
 */
export interface UserModel {
  id: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  password?: string; // For local authentication
  emailVerified?: boolean; // OAuth email verification
  createdAt: string;
  lastLoginAt?: string; // Last successful login timestamp

  // Stripe integration
  stripeCustomerId?: string;

  /**
   * Instance-level admin flag.
   * When true, the user is treated as a global/instance admin with elevated access.
   * This is intentionally optional in the protocol to keep backward compatibility
   * with older clients and migrations; the backend will default it to false.
   */
  isInstanceAdmin?: boolean;

  // Authentication method tracking
  hasPassword: boolean;           // Does user have password auth?
  authMethods: AuthMethod[];      // List of auth methods
  primaryAuthMethod: 'password' | 'oauth'; // Primary login method
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
  emailVerified?: boolean;
  stripeCustomerId?: string;
}

/**
 * Request to update user information
 */
export interface UpdateUserRequest {
  email?: string;
  displayName?: string;
  avatar?: string;
  emailVerified?: boolean;
  stripeCustomerId?: string;
  hasPassword?: boolean;
  authMethods?: AuthMethod[];
  primaryAuthMethod?: 'password' | 'oauth';
}

/**
 * Request to set password for OAuth-only users
 */
export interface SetPasswordRequest {
  newPassword: string;
  confirmPassword: string;
}

/**
 * Request to initiate email change
 */
export interface InitiateEmailChangeRequest {
  newEmail: string;
}

/**
 * Request to verify email change (token-based)
 */
export interface VerifyEmailChangeRequest {
  token: string;
}

/**
 * Response for email change status
 */
export interface EmailChangeStatusResponse {
  pending: boolean;
  newEmail?: string;
  expiresAt?: string;
}

/**
 * Response for email change completion
 */
export interface EmailChangeCompleteResponse {
  userId: string;
  oldEmail: string;
  newEmail: string;
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
