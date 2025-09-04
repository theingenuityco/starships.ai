import { WaitlistRepository } from '@starships/models';
import { logger } from '@/utils/logger';

export interface WaitlistCheckResult {
  isApproved: boolean;
  message: string;
  redirectUrl?: string;
}

export class WaitlistService {
  private waitlistRepo: WaitlistRepository;

  constructor(waitlistRepo: WaitlistRepository) {
    this.waitlistRepo = waitlistRepo;
  }

  /**
   * Check if an email is approved for early access
   */
  async checkApproval(email: string): Promise<WaitlistCheckResult> {
    try {
      const normalizedEmail = this.normalizeEmail(email);

      // Validate email format
      if (!this.isValidEmail(normalizedEmail)) {
        return {
          isApproved: false,
          message: 'Please provide a valid email address',
        };
      }

      // Check approval status
      const isApproved = await this.waitlistRepo.checkApproval(normalizedEmail);

      if (isApproved) {
        logger.info('Waitlist: Approved email validated', {
          email: normalizedEmail,
        });

        return {
          isApproved: true,
          message: "Great news! You don't have to wait. Redirecting...",
          redirectUrl: '/',
        };
      }

      logger.info('Waitlist: Non-approved email checked', {
        email: normalizedEmail,
      });

      return {
        isApproved: false,
        message: "Thanks for your interest in Starships.ai! We're currently in private alpha. We'll notify you as soon as we're ready.",
      };
    } catch (error) {
      logger.error('WaitlistService: Error checking approval', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });

      // Return generic error message
      return {
        isApproved: false,
        message: 'Service temporarily unavailable. Please try again.',
      };
    }
  }

  /**
   * Get all approved emails (admin use)
   */
  async getApprovedEmails(): Promise<string[]> {
    try {
      const entries = await this.waitlistRepo.getAllApproved();
      return entries.map((entry) => entry.email);
    } catch (error) {
      logger.error('WaitlistService: Error getting approved emails', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get count of approved emails
   */
  async getApprovedCount(): Promise<number> {
    try {
      return await this.waitlistRepo.getApprovedCount();
    } catch (error) {
      logger.error('WaitlistService: Error getting approved count', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Add a new approved email (admin use)
   */
  async addApprovedEmail(email: string, addedBy: string = 'admin', notes?: string): Promise<boolean> {
    try {
      const normalizedEmail = this.normalizeEmail(email);

      if (!this.isValidEmail(normalizedEmail)) {
        logger.warn('WaitlistService: Invalid email format', { email });
        return false;
      }

      await this.waitlistRepo.addApprovedEmail(normalizedEmail, notes);

      logger.info('WaitlistService: Added approved email', {
        email: normalizedEmail,
        addedBy,
        notes,
      });

      return true;
    } catch (error) {
      logger.error('WaitlistService: Error adding approved email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });
      return false;
    }
  }

  /**
   * Normalize email for consistent comparison
   */
  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
