/**
 * OAuth Authorization Code Cleanup Job
 * 
 * Production-ready cleanup job for expired OAuth authorization codes.
 * Designed for Kubernetes environments with health checks and monitoring.
 */

import { OAuthAuthCodeRepository } from '@starships/models';
import { logger } from '@/utils/logger';

export class OAuthCleanupJob {
  private repository: OAuthAuthCodeRepository;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.repository = new OAuthAuthCodeRepository();
  }

  /**
   * Start the cleanup job with configurable interval
   * Default: 10 minutes (reasonable for production)
   */
  start(intervalMinutes: number = 10): void {
    if (this.isRunning) {
      logger.warn('[OAuth Cleanup] Job already running, skipping start');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    logger.info(`[OAuth Cleanup] Starting cleanup job with ${intervalMinutes}-minute interval`);

    // Run immediately on start
    this.runCleanup();

    // Schedule recurring cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, intervalMs);

    this.isRunning = true;
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('[OAuth Cleanup] Cleanup job stopped');
  }

  /**
   * Run cleanup once (can be called manually)
   */
  async runCleanup(): Promise<number> {
    try {
      const deletedCount = await this.repository.cleanupExpiredCodes();
      
      if (deletedCount > 0) {
        logger.info(`[OAuth Cleanup] Cleaned up ${deletedCount} expired authorization codes`);
      }
      
      return deletedCount;
    } catch (error: any) {
      logger.error('[OAuth Cleanup] Failed to clean up expired codes:', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Health check for monitoring
   */
  getStatus(): { running: boolean; lastRun?: string } {
    return {
      running: this.isRunning,
      lastRun: new Date().toISOString(),
    };
  }

  /**
   * Get statistics for monitoring
   */
  async getStatistics(): Promise<{ activeCodes: number; totalCleaned: number }> {
    try {
      const activeCodes = await this.repository.countActiveCodes();
      const totalCleaned = await this.runCleanup();
      
      return {
        activeCodes,
        totalCleaned,
      };
    } catch (error: any) {
      logger.error('[OAuth Cleanup] Failed to get statistics:', error);
      throw error;
    }
  }
}

// Singleton instance for application-wide use
export const oauthCleanupJob = new OAuthCleanupJob();