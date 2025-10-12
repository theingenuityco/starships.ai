/**
 * Service Factory - Centralized Service Creation
 * 
 * Provides a single point for creating service instances with proper dependency injection.
 * This ensures consistent service instantiation patterns across the application.
 */

import { UserService } from './UserService';
import { EmailService } from './EmailService';
import { StarshipService } from './StarshipService';
import { RegistrationOrchestrator } from './RegistrationOrchestrator';

/**
 * Service Factory for creating service instances
 */
export class ServiceFactory {
  /**
   * Create UserService instance
   */
  static createUserService(): UserService {
    return new UserService();
  }

  /**
   * Create EmailService instance
   */
  static createEmailService(): EmailService {
    return new EmailService();
  }


  /**
   * Create StarshipService instance
   */
  static createStarshipService(): StarshipService {
    return new StarshipService();
  }

  /**
   * Create RegistrationOrchestrator instance
   */
  static createRegistrationOrchestrator(): RegistrationOrchestrator {
    return new RegistrationOrchestrator();
  }
}

