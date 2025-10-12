/**
 * Registration Orchestrator Service
 * 
 * Orchestrates complex registration workflows including:
 * - User registration with email verification
 * - Email verification and account activation
 * - Waitlist management
 * - Starship creation for approved users
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
   * 2. Waitlist management
   * 3. User creation
   * 4. Email verification sending
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

    // Handle waitlist logic
    await this.ensureUserInWaitlist(userData.email);

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
   * 2. Waitlist status check
   * 3. Starship creation for approved users
   * 4. Redirect path determination
   */
  async completeEmailVerification(token: string): Promise<VerificationResult> {
    const userService = ServiceFactory.createUserService();

    // First, get token info to determine current state
    const tokenInfo = await userService.getVerificationTokenInfo(token);

    if (!tokenInfo.tokenInfo) {
      throw new InvalidTokenError('Verification token not found');
    }

    if (tokenInfo.userAlreadyVerified) {
      // User already verified - determine appropriate redirect
      return {
        userId: tokenInfo.tokenInfo.userId,
        email: tokenInfo.tokenInfo.email,
        verified: true,
        starshipCreated: tokenInfo.shouldRedirectToStarship,
        redirectPath: tokenInfo.shouldRedirectToStarship 
          ? '/login?verification=success&starship=true'
          : '/login?verification=success&waitlisted=true'
      };
    }

    if (!tokenInfo.tokenInfo.valid) {
      throw new InvalidTokenError('Verification token is expired or already used');
    }

    // Proceed with verification - this only handles user verification
    const verificationResult = await userService.verifyEmailAddress(token);

    // Check if user should get starship access
    const starshipCreated = await this.handleApprovedUser(verificationResult.userId, verificationResult.email);

    return {
      userId: verificationResult.userId,
      email: verificationResult.email,
      verified: true,
      starshipCreated,
      redirectPath: starshipCreated
        ? '/login?verification=success&starship=true'
        : '/login?verification=success&waitlisted=true'
    };
  }

  /**
   * Ensure user is in waitlist (private helper)
   */
  private async ensureUserInWaitlist(email: string): Promise<void> {
    const waitlistService = ServiceFactory.createWaitlistService();
    
    const waitlistStatus = await waitlistService.getDetailedStatus(email);
    if (!waitlistStatus.exists) {
      await waitlistService.addToPendingWaitlist(email);
    }
  }

  /**
   * Handle starship creation for approved users (private helper)
   */
  private async handleApprovedUser(userId: string, email: string): Promise<boolean> {
    const waitlistService = ServiceFactory.createWaitlistService();
    
    try {
      const waitlistStatus = await waitlistService.getDetailedStatus(email);
      
      if (waitlistStatus.status === 'approved') {
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
      }
    } catch {
      logger.error('[RegistrationOrchestrator] Failed to create starship during verification', {
        userId,
        operation: 'starship_creation'
      });
      // Don't throw - user can create starship later
    }

    return false;
  }
}