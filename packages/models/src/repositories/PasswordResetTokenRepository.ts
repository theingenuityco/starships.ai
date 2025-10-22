/**
 * Password Reset Token Repository - Database-backed password reset management
 * 
 * Follows the established BaseRepository pattern for password reset token persistence.
 * Similar to EmailVerificationTokenRepository but with 1-hour expiry for security.
 */

import { PasswordResetTokenEntity } from '@/entities/PasswordResetTokenEntity';
import { toDatabase } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export class PasswordResetTokenRepository extends BaseRepository {
  constructor() {
    super('PasswordResetTokenRepository');
  }

  /**
   * Generate and store a secure password reset token
   * Returns the generated token for email sending
   */
  async generateToken(userId: string, email: string, retryCount: number = 0): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      // Clean expired tokens for this user first
      await this.cleanupExpiredTokensForUser(userId);
      
      // Safety check: prevent infinite recursion from token collisions
      if (retryCount >= 3) {
        throw new Error('Failed to generate unique password reset token after 3 attempts');
      }
      
      // Generate cryptographically secure token (64 hex chars = 32 bytes)
      const token = crypto.randomBytes(32).toString('hex');
      const id = nanoid();
      
      // Create entity data using factory method
      const entityData = PasswordResetTokenEntity.createFromUserData(userId, email, token);
      
      // Validate before database insertion
      await PasswordResetTokenEntity.validate({ id, ...entityData }, 'create');
      
      // Convert to database format
      const dbData = toDatabase({ id, ...entityData });
      
      const connection = this.getConnection();
      
      // Insert with conflict handling (token collisions are extremely rare but possible)
      try {
        await connection.queryOne(
          `INSERT INTO password_reset_tokens (id, token, user_id, email, consumed, created_at, expires_at) 
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
    }, 'generateToken', 'password_reset_tokens');
  }

  /**
   * Validate and consume a password reset token atomically
   * Returns user data if successful, null if token is invalid/expired/consumed
   */
  async validateAndConsumeToken(token: string): Promise<{ userId: string; email: string } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      // Atomic transaction to prevent race conditions
      return await connection.transaction(async (tx) => {
        // Find and update in one atomic operation
        const result = await tx.query(
          `UPDATE password_reset_tokens 
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
    }, 'validateAndConsumeToken', 'password_reset_tokens');
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
         FROM password_reset_tokens 
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
    }, 'getTokenInfo', 'password_reset_tokens');
  }

  /**
   * Clean up expired password reset tokens for a specific user
   * Returns number of tokens deleted
   */
  private async cleanupExpiredTokensForUser(userId: string): Promise<void> {
    await this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      await connection.query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1 AND expires_at <= NOW()`,
        [userId]
      );
    }, 'cleanupExpiredTokensForUser', 'password_reset_tokens');
  }

  /**
   * Clean up expired password reset tokens
   * Returns number of tokens deleted
   */
  async cleanupExpiredTokens(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const pool = connection.getPool();
      const result = await pool.query(
        `DELETE FROM password_reset_tokens WHERE expires_at <= NOW()`
      );
      
      return result.rowCount || 0;
    }, 'cleanupExpiredTokens', 'password_reset_tokens');
  }

  /**
   * Count active (non-expired, non-consumed) password reset tokens
   */
  async countActiveTokens(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM password_reset_tokens 
         WHERE expires_at > NOW() AND NOT consumed`
      );
      
      return result ? parseInt(result.count, 10) : 0;
    }, 'countActiveTokens', 'password_reset_tokens');
  }
}