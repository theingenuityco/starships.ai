/**
 * Email Change Token Repository - Database-backed email change verification management
 * 
 * Follows the established BaseRepository pattern for email change token persistence.
 * Similar to PasswordResetTokenRepository but with old_email and new_email for email change flow.
 */

import { EmailChangeTokenEntity } from '@/entities/EmailChangeTokenEntity';
import { toDatabase } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export class EmailChangeTokenRepository extends BaseRepository {
  constructor() {
    super('EmailChangeTokenRepository');
  }

  /**
   * Generate and store a secure email change token
   * Returns the generated token for email sending
   */
  async generateToken(userId: string, oldEmail: string, newEmail: string, retryCount: number = 0): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      // Clean expired tokens for this user first
      await this.cleanupExpiredTokensForUser(userId);
      
      // Safety check: prevent infinite recursion from token collisions
      if (retryCount >= 3) {
        throw new Error('Failed to generate unique email change token after 3 attempts');
      }
      
      // Generate cryptographically secure token (64 hex chars = 32 bytes)
      const token = crypto.randomBytes(32).toString('hex');
      const id = nanoid();
      
      // Create entity data using factory method
      const entityData = EmailChangeTokenEntity.createFromUserData(userId, oldEmail, newEmail, token);
      
      // Validate before database insertion
      await EmailChangeTokenEntity.validate({ id, ...entityData }, 'create');
      
      // Convert to database format
      const dbData = toDatabase({ id, ...entityData });
      
      const connection = this.getConnection();
      
      // Insert with conflict handling (token collisions are extremely rare but possible)
      try {
        await connection.queryOne(
          `INSERT INTO email_change_tokens (id, token, user_id, old_email, new_email, consumed, created_at, expires_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [dbData.id, dbData.token, dbData.user_id, dbData.old_email, dbData.new_email, dbData.consumed, dbData.created_at, dbData.expires_at]
        );
        
        return token;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') { // PostgreSQL unique constraint violation
          // Extremely rare - retry with new token (with incremented retry counter)
          return this.generateToken(userId, oldEmail, newEmail, retryCount + 1);
        }
        throw error;
      }
    }, 'generateToken', 'email_change_tokens');
  }

  /**
   * Validate and consume an email change token atomically
   * Returns user data if successful, null if token is invalid/expired/consumed
   */
  async validateAndConsumeToken(token: string): Promise<{ userId: string; oldEmail: string; newEmail: string } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      // Atomic transaction to prevent race conditions
      return await connection.transaction(async (tx) => {
        // Find and update in one atomic operation
        const result = await tx.query(
          `UPDATE email_change_tokens 
           SET consumed = true
           WHERE token = $1 
             AND NOT consumed 
             AND expires_at > NOW()
           RETURNING user_id, old_email, new_email`,
          [token]
        );
        
        const row = result.rows.length > 0 ? result.rows[0] : null;
        
        if (!row) {
          return null;
        }
        
        return {
          userId: row.user_id as string,
          oldEmail: row.old_email as string,
          newEmail: row.new_email as string,
        };
      });
    }, 'validateAndConsumeToken', 'email_change_tokens');
  }

  /**
   * Get token info without consuming it
   * Returns token info for redirect logic
   */
  async getTokenInfo(token: string): Promise<{ 
    userId: string; 
    oldEmail: string; 
    newEmail: string; 
    consumed: boolean; 
    expired: boolean; 
    valid: boolean; 
  } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.queryOne(
        `SELECT user_id, old_email, new_email, consumed, expires_at 
         FROM email_change_tokens 
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
        oldEmail: result.old_email as string,
        newEmail: result.new_email as string,
        consumed,
        expired,
        valid,
      };
    }, 'getTokenInfo', 'email_change_tokens');
  }

  /**
   * Get pending (active) token for a user
   * Returns token info or null if no pending token
   */
  async getPendingTokenForUser(userId: string): Promise<{ 
    newEmail: string; 
    expiresAt: string; 
  } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.queryOne(
        `SELECT new_email, expires_at 
         FROM email_change_tokens 
         WHERE user_id = $1 
           AND NOT consumed 
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );
      
      if (!result) {
        return null;
      }
      
      return {
        newEmail: result.new_email as string,
        expiresAt: result.expires_at as string,
      };
    }, 'getPendingTokenForUser', 'email_change_tokens');
  }

  /**
   * Cancel all pending tokens for a user
   * Marks all non-consumed, non-expired tokens as consumed
   * Returns number of tokens cancelled
   */
  async cancelTokenForUser(userId: string): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.query(
        `UPDATE email_change_tokens 
         SET consumed = true
         WHERE user_id = $1 
           AND NOT consumed 
           AND expires_at > NOW()`,
        [userId]
      );
      
      return (result as unknown as { rowCount: number }).rowCount || 0;
    }, 'cancelTokenForUser', 'email_change_tokens');
  }

  /**
   * Clean up expired email change tokens for a specific user
   * Returns number of tokens deleted
   */
  private async cleanupExpiredTokensForUser(userId: string): Promise<void> {
    await this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      await connection.query(
        `DELETE FROM email_change_tokens WHERE user_id = $1 AND expires_at <= NOW()`,
        [userId]
      );
    }, 'cleanupExpiredTokensForUser', 'email_change_tokens');
  }

  /**
   * Clean up expired email change tokens
   * Returns number of tokens deleted
   */
  async cleanupExpiredTokens(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const pool = connection.getPool();
      const result = await pool.query(
        `DELETE FROM email_change_tokens WHERE expires_at <= NOW()`
      );
      
      return result.rowCount || 0;
    }, 'cleanupExpiredTokens', 'email_change_tokens');
  }
}

