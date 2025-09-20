import { WaitlistRepository } from '@starships/models';
import { logger } from '@/utils/logger';

export interface WaitlistCheckResult {
  isApproved: boolean;
  message: string;
  redirectUrl?: string;
}

export interface WaitlistStatusResult {
  exists: boolean;
  status: 'approved' | 'pending' | null;
  message: string;
  email?: string;
}

export class WaitlistService {
  private waitlistRepo: WaitlistRepository;

  constructor(waitlistRepo: WaitlistRepository) {
    this.waitlistRepo = waitlistRepo;
  }

  /**
   * Check if an email is approved for early access
   */
  async checkApproval(email: string): Promise<WaitlistStatusResult> {
    try {
      const normalizedEmail = this.normalizeEmail(email);

      // Validate email format
      if (!this.isValidEmail(normalizedEmail)) {
        return {
          exists: false,
          status: null,
          message: 'Please provide a valid email address',
        };
      }

      // Get status from repository
      const status = await this.waitlistRepo.getStatusByEmail(normalizedEmail);

      if (!status) {
        return {
          exists: false,
          status: null,
          message: 'Email not found in waitlist',
          email: normalizedEmail,
        };
      }

      if (status === 'approved') {
        logger.info('Waitlist: Approved email validated', {
          email: normalizedEmail,
        });

        return {
          exists: true,
          status: 'approved',
          message: 'Email is approved for registration',
          email: normalizedEmail,
        };
      }

      logger.info('Waitlist: Pending email checked', {
        email: normalizedEmail,
      });

      return {
        exists: true,
        status: 'pending',
        message: "Thanks for your interest in Starships.ai! We're currently in private alpha. We'll notify you as soon as we're ready.",
        email: normalizedEmail,
      };
    } catch (error) {
      logger.error('WaitlistService: Error checking approval', {
        error: error instanceof Error ? error.message : 'Unknown error',
        email,
      });

      // Return generic error message
      return {
        exists: false,
        status: null,
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
   * Add email to pending waitlist
   */
  async addToPendingWaitlist(email: string): Promise<WaitlistStatusResult> {
    try {
      const normalizedEmail = this.normalizeEmail(email);
      
      // Check if already exists
      const existingStatus = await this.waitlistRepo.getStatusByEmail(normalizedEmail);
      if (existingStatus) {
        return {
          exists: true,
          status: existingStatus,
          message: existingStatus === 'approved' 
            ? 'Email is approved for registration'
            : 'Please wait for approval to access the app.',
          email: normalizedEmail
        };
      }
      
      // Add to waitlist
      await this.waitlistRepo.addPendingEmail(normalizedEmail, 'Auto-added via signup');
      logger.info(`Added ${normalizedEmail} to waitlist with pending status`);
      
      return {
        exists: false,
        status: 'pending',
        message: 'Thanks for your interest! We have added you to the waitlist. Stay tuned!',
        email: normalizedEmail
      };
    } catch (error) {
      logger.error('Error adding to waitlist:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get detailed waitlist status
   */
  async getDetailedStatus(email: string): Promise<WaitlistStatusResult> {
    try {
      const normalizedEmail = this.normalizeEmail(email);
      
      // Validate email format
      if (!this.isValidEmail(normalizedEmail)) {
        return {
          exists: false,
          status: null,
          message: 'Please provide a valid email address',
        };
      }
      
      const status = await this.waitlistRepo.getStatusByEmail(normalizedEmail);
      
      if (!status) {
        return {
          exists: false,
          status: null,
          message: 'Email not found in system',
          email: normalizedEmail,
        };
      }
      
      return {
        exists: true,
        status,
        message: status === 'approved' 
          ? 'Email is approved for registration'
          : 'Please wait for approval to access the app.',
        email: normalizedEmail,
      };
    } catch (error) {
      logger.error('Error getting detailed status:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        exists: false,
        status: null,
        message: 'Service temporarily unavailable. Please try again.',
      };
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
