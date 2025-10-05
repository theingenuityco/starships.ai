/**
 * Authentication Types
 *
 * Clean authentication type definitions for protocol contract,
 * including waitlist integration response types.
 */

// ============================================================================
// AUTH USER TYPES
// ============================================================================

/**
 * Authenticated user information
 */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  displayName?: string;
}

// ============================================================================
// WAITLIST RESPONSE TYPES
// ============================================================================

/**
 * Waitlist status in auth responses
 */
export interface AuthWaitlistResponse {
  waitlisted: boolean;
  status: 'pending' | 'approved';
  message: string;
  email?: string;
}

// ============================================================================
// AUTH RESPONSE TYPES
// ============================================================================

/**
 * Registration response structure
 */
export interface AuthRegisterResponse {
  user?: AuthUser;
  token?: string;
  starship?: {
    id: string;
    slug: string;
    name: string;
  };
  agent?: {
    id: string;
    name: string;
    description: string;
  };
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
}

/**
 * Login response structure
 */
export interface AuthLoginResponse {
  user?: AuthUser;
  token?: string;
  starship?: {
    id: string;
    slug: string;
    name: string;
  };
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
}

/**
 * Token verification response
 */
export interface AuthVerifyResponse {
  valid: boolean;
  user?: AuthUser;
  exp?: number;
}

/**
 * Password reset request
 */
export interface AuthPasswordResetRequest {
  email: string;
}

/**
 * Password reset confirmation
 */
export interface AuthPasswordResetConfirm {
  token: string;
  newPassword: string;
}

// ============================================================================
// AUTH ERROR TYPES
// ============================================================================

/**
 * Authentication error codes
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'USER_EXISTS'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'WAITLISTED'
  | 'NOT_APPROVED'
  | 'VALIDATION_ERROR';

/**
 * Authentication error response
 */
export interface AuthErrorResponse {
  error: AuthErrorCode;
  message: string;
  field?: string;
}

// ============================================================================
// OAUTH DOMAIN MODELS
// ============================================================================

/**
 * OAuth Account domain model - pure interface for type sharing
 * Follows established domain contract patterns
 */
export interface OAuthAccountModel {
  id: string;
  userId: string;
  provider: 'google' | 'github';
  providerUserId: string;
  email: string;
  profileData?: {
    name?: string;
    avatar?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * OAuth provider profile interface
 */
export interface OAuthProfileModel {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
}

/**
 * OAuth state token interface
 */
export interface OAuthStateModel {
  purpose: 'oauth_state';
  nonce: string;
  timestamp: number;
}

/**
 * Request/Response interfaces for OAuth operations
 */
export interface CreateOAuthAccountRequest {
  userId: string;
  provider: 'google' | 'github';
  providerUserId: string;
  email: string;
  profileData?: Record<string, unknown>;
}

export interface LinkOAuthAccountRequest {
  userId: string;
  provider: 'google' | 'github';
  authCode: string;
}

export interface OAuthCallbackResponse {
  user: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
  };
  token: string;
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
}
