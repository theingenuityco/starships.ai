/**
 * Server Errors Index
 * 
 * Centralized exports for all server-specific error classes.
 */

// Re-export common errors from @starships/errors
export {
  AppError,
  ValidationError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  NetworkError,
  ServiceError
} from '@starships/errors';

// Email verification specific errors
export {
  EmailVerificationError,
  InvalidTokenError,
  TokenNotFoundError,
  UserAlreadyVerifiedError,
  EmailVerificationSendError
} from './EmailVerificationErrors';