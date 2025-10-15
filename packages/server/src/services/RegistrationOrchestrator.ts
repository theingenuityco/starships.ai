/**
 * Registration Orchestrator Service
 * 
 * Orchestrates registration workflows including:
 * - User registration with email verification
 * - Email verification and account activation
 * - Starship creation for verified users
 * 
 * This service follows the orchestration pattern to coordinate multiple services
 * while maintaining clear separation of concerns.
 */

import { ServiceFactory } from './ServiceFactory';
import { StarshipService } from './StarshipService';
import { logger } from '@starships/models';
import {
  InvalidTokenError,
  EmailVerificationSendError,
  ConflictError
} from '../errors';

export interface RegisterUserData {
  email: string;
  password: string;
  name?: string;
}

export interface RegistrationResult {
  emailVerificationSent: boolean;
  message: string;
}

export interface VerificationResult {
  userId: string;
  email: string;
  verified: boolean;
  starshipCreated: boolean;
  redirectPath: string;
}

/**
 * Orchestrates registration and email verification workflows
 */
export class RegistrationOrchestrator {
  /**
   * Register a new user with email verification
   * 
   * Coordinates:
   * 1. User existence check
   * 2. User creation
   * 3. Email verification sending
   */
  async registerUser(userData: RegisterUserData): Promise<RegistrationResult> {
    const userService = ServiceFactory.createUserService();

    // Check if user already exists - handle gracefully without throwing errors
    const existingUser = await userService.getUserByEmail(userData.email);
    if (existingUser) {
      // Simply return a friendly message without throwing errors
      return {
        emailVerificationSent: false,
        message: 'An account with this email already exists. Please sign in instead.'
      };
    }

    // Create user with email unverified (password will be automatically hashed)
    const displayName = userData.name || userData.email.split('@')[0];
    const user = await userService.createUser({
      email: userData.email,
      password: userData.password,
      displayName,
      emailVerified: false
    });

    // Send email verification
    try {
      await userService.sendEmailVerification(user.id, user.email!);
    } catch (error) {
      logger.error('[RegistrationOrchestrator] Failed to send verification email', {
        userId: user.id,
        operation: 'email_verification'
      });
      throw new EmailVerificationSendError('Failed to send verification email', undefined, error as Error);
    }

    return {
      emailVerificationSent: true,
      message: 'Registration successful! Please check your email to verify your account.'
    };
  }

  /**
   * Complete email verification process
   * 
   * Coordinates:
   * 1. Token validation and user verification
   * 2. Starship creation for verified users
   * 3. Redirect path determination
   */
  async completeEmailVerification(token: string): Promise<VerificationResult> {
    const userService = ServiceFactory.createUserService();

    // First, get token info to determine current state
    const tokenInfo = await userService.getVerificationTokenInfo(token);

    if (!tokenInfo.tokenInfo) {
      throw new InvalidTokenError('Verification token not found');
    }

    if (tokenInfo.userAlreadyVerified) {
      // User already verified - redirect to login with a simple success message
      const starshipCreated = await this.checkUserHasStarship(tokenInfo.tokenInfo.userId);
      return {
        userId: tokenInfo.tokenInfo.userId,
        email: tokenInfo.tokenInfo.email,
        verified: true,
        starshipCreated,
        redirectPath: '/login?verification=already-verified'
      };
    }

    if (!tokenInfo.tokenInfo.valid) {
      throw new InvalidTokenError('Verification token is expired or already used');
    }

    // Proceed with verification - this only handles user verification
    const verificationResult = await userService.verifyEmailAddress(token);

    // Create starship for all verified users
    const starshipCreated = await this.createStarshipForUser(verificationResult.userId);

    return {
      userId: verificationResult.userId,
      email: verificationResult.email,
      verified: true,
      starshipCreated,
      redirectPath: '/login?verification=success'
    };
  }

  /**
   * Create starship for verified user (private helper)
   */
  private async createStarshipForUser(userId: string): Promise<boolean> {
    try {
      const defaultStarship = await StarshipService.createDefaultStarship(userId);
      
      if (defaultStarship) {
        await StarshipService.createDefaultAgent(userId, defaultStarship.id);
        
        logger.info('[RegistrationOrchestrator] Starship created for verified user', {
          userId,
          starshipId: defaultStarship.id,
          operation: 'email_verification'
        });
        
        return true;
      }
    } catch (error) {
      logger.error('[RegistrationOrchestrator] Failed to create starship during verification', {
        userId,
        operation: 'starship_creation',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
      // Don't throw - user can create starship later
    }

    return false;
  }

  /**
   * Check if user already has a starship (private helper)
   */
  private async checkUserHasStarship(userId: string): Promise<boolean> {
    try {
      const starshipService = ServiceFactory.createStarshipService();
      const userStarships = await starshipService.getStarshipsByOwner(userId);
      return userStarships.length > 0;
    } catch (error) {
      logger.error('[RegistrationOrchestrator] Failed to check user starships', {
        userId,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
      return false;
    }
  }
}