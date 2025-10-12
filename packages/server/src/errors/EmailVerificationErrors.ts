/**
 * Email Verification Error Classes
 * 
 * Specific error types for email verification flow.
 * Extends the base error classes from @starships/errors.
 */

import { ValidationError, NotFoundError } from '@starships/errors';

/**
 * Base Email Verification Error
 */
export class EmailVerificationError extends ValidationError {
  constructor(message: string, code: string, details?: unknown, cause?: Error) {
    super(message, 'token', details, cause);
    this.name = 'EmailVerificationError';
  }
}

/**
 * Invalid or expired token error
 */
export class InvalidTokenError extends EmailVerificationError {
  constructor(message: string = 'Invalid or expired verification token', details?: unknown, cause?: Error) {
    super(message, 'INVALID_TOKEN', details, cause);
    this.name = 'InvalidTokenError';
  }
}

/**
 * Token not found error
 */
export class TokenNotFoundError extends NotFoundError {
  constructor(tokenId: string = 'unknown', cause?: Error) {
    super('Verification token', tokenId, cause);
    this.name = 'TokenNotFoundError';
  }
}

/**
 * User already verified error
 */
export class UserAlreadyVerifiedError extends EmailVerificationError {
  constructor(message: string = 'User email is already verified', details?: unknown, cause?: Error) {
    super(message, 'USER_ALREADY_VERIFIED', details, cause);
    this.name = 'UserAlreadyVerifiedError';
  }
}

/**
 * Email verification send error
 */
export class EmailVerificationSendError extends EmailVerificationError {
  constructor(message: string = 'Failed to send verification email', details?: unknown, cause?: Error) {
    super(message, 'EMAIL_SEND_FAILED', details, cause);
    this.name = 'EmailVerificationSendError';
  }
}