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
