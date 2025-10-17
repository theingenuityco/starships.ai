/**
 * Email Verification Token Repository - Database-backed email verification management
 * 
 * Follows the established BaseRepository pattern for email verification token persistence.
 * Separate from OAuth system for clean separation of concerns.
 */

import { EmailVerificationTokenEntity } from '@/entities/EmailVerificationTokenEntity';
import { toDatabase } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export class EmailVerificationTokenRepository extends BaseRepository {
  constructor() {
    super('EmailVerificationTokenRepository');
  }

  /**
   * Generate and store a secure email verification token
   * Returns the generated token for email sending
   */
  async generateToken(userId: string, email: string, retryCount: number = 0): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      // Safety check: prevent infinite recursion from token collisions
      if (retryCount >= 3) {
        throw new Error('Failed to generate unique verification token after 3 attempts');
      }
      
      // Generate cryptographically secure token (64 hex chars = 32 bytes)
      const token = crypto.randomBytes(32).toString('hex');
      const id = nanoid();
      
      // Create entity data using factory method
      const entityData = EmailVerificationTokenEntity.createFromUserData(userId, email, token);
      
      // Validate before database insertion
      await EmailVerificationTokenEntity.validate({ id, ...entityData }, 'create');
      
      // Convert to database format
      const dbData = toDatabase({ id, ...entityData });
      
      const connection = this.getConnection();
      
      // Insert with conflict handling (token collisions are extremely rare but possible)
      try {
        await connection.queryOne(
          `INSERT INTO email_verification_tokens (id, token, user_id, email, consumed, created_at, expires_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [dbData.id, dbData.token, dbData.user_id, dbData.email, dbData.consumed, dbData.created_at, dbData.expires_at]
        );
        
        return token;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') { // PostgreSQL unique constraint violation
          // Extremely rare - retry with new token (with incremented retry counter)
          return this.generateToken(userId, email, retryCount + 1);
        }
        throw error;
      }
    }, 'generateToken', 'email_verification_tokens');
  }

  /**
   * Validate and consume an email verification token atomically
   * Returns user data if successful, null if token is invalid/expired/consumed
   */
  async validateAndConsumeToken(token: string): Promise<{ userId: string; email: string } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      // Atomic transaction to prevent race conditions
      return await connection.transaction(async (tx) => {
        // Find and update in one atomic operation
        const result = await tx.query(
          `UPDATE email_verification_tokens 
           SET consumed = true
           WHERE token = $1 
             AND NOT consumed 
             AND expires_at > NOW()
           RETURNING user_id, email`,
          [token]
        );
        
        const row = result.rows.length > 0 ? result.rows[0] : null;
        
        if (!row) {
          return null;
        }
        
        return {
          userId: row.user_id as string,
          email: row.email as string,
        };
      });
    }, 'validateAndConsumeToken', 'email_verification_tokens');
  }

  /**
   * Get token info without consuming it
   * Returns token info for redirect logic
   */
  async getTokenInfo(token: string): Promise<{ 
    userId: string; 
    email: string; 
    consumed: boolean; 
    expired: boolean; 
    valid: boolean; 
  } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.queryOne(
        `SELECT user_id, email, consumed, expires_at 
         FROM email_verification_tokens 
         WHERE token = $1`,
        [token]
      );
      
      if (!result) {
        return null;
      }
      
      const now = new Date();
      const expiresAt = new Date(result.expires_at as string);
      const expired = expiresAt <= now;
      const consumed = Boolean(result.consumed);
      const valid = !expired && !consumed;
      
      return {
        userId: result.user_id as string,
        email: result.email as string,
        consumed,
        expired,
        valid,
      };
    }, 'getTokenInfo', 'email_verification_tokens');
  }

  /**
   * Clean up expired email verification tokens
   * Returns number of tokens deleted
   */
  async cleanupExpiredTokens(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const pool = connection.getPool();
      const result = await pool.query(
        `DELETE FROM email_verification_tokens WHERE expires_at <= NOW()`
      );
      
      return result.rowCount || 0;
    }, 'cleanupExpiredTokens', 'email_verification_tokens');
  }

  /**
   * Count active (non-expired, non-consumed) email verification tokens
   */
  async countActiveTokens(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM email_verification_tokens 
         WHERE expires_at > NOW() AND NOT consumed`
      );
      
      return result ? parseInt(result.count, 10) : 0;
    }, 'countActiveTokens', 'email_verification_tokens');
  }
}