/**
 * Email Verification Error Classes
 * 
 * Specific error types for email verification flow.
 * Extends the base error classes from @starships/errors.
 */

import { ValidationError } from '@starships/errors';

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
 * Email verification send error
 */
export class EmailVerificationSendError extends EmailVerificationError {
  constructor(message: string = 'Failed to send verification email', details?: unknown, cause?: Error) {
    super(message, 'EMAIL_SEND_FAILED', details, cause);
    this.name = 'EmailVerificationSendError';
  }
}