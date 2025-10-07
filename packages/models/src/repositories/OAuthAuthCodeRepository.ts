/**
 * OAuth Auth Code Repository - Database-backed authorization code management
 * 
 * Follows the established BaseRepository pattern for OAuth authorization code persistence.
 * This provides production-ready, atomic operations for OAuth code management.
 */

import { OAuthAuthCodeEntity, OAuthAuthCodeModel } from '@/entities/OAuthAuthCodeEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export class OAuthAuthCodeRepository extends BaseRepository {
  constructor() {
    super('OAuthAuthCodeRepository');
  }

  /**
   * Generate and store a secure authorization code
   * Returns the generated code for OAuth redirect
   */
  async generateCode(userId: string, email: string): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      // Generate cryptographically secure code (64 hex chars = 32 bytes)
      const code = crypto.randomBytes(32).toString('hex');
      const id = nanoid();
      
      // Create entity data using factory method
      const entityData = OAuthAuthCodeEntity.createFromUserData(userId, email, code);
      
      // Validate before database insertion
      await OAuthAuthCodeEntity.validate({ id, ...entityData }, 'create');
      
      // Convert to database format
      const dbData = toDatabase({ id, ...entityData });
      
      const connection = this.getConnection();
      
      // Insert with conflict handling (code collisions are extremely rare but possible)
      try {
        await connection.queryOne(
          `INSERT INTO oauth_auth_codes (id, code, user_id, email, consumed, created_at, expires_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [dbData.id, dbData.code, dbData.user_id, dbData.email, dbData.consumed, dbData.created_at, dbData.expires_at]
        );
        
        return code;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') { // PostgreSQL unique constraint violation
          // Extremely rare - retry with new code
          return this.generateCode(userId, email);
        }
        throw error;
      }
    }, 'generateCode', 'oauth_auth_codes');
  }

  /**
   * Validate and consume an authorization code atomically
   * Returns user data if successful, null if code is invalid/expired/consumed
   */
  async validateAndConsumeCode(code: string): Promise<{ userId: string; email: string } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      // Atomic transaction to prevent race conditions
      return await connection.transaction(async (tx) => {
        // Find and update in one atomic operation
        const result = await tx.query(
          `UPDATE oauth_auth_codes 
           SET consumed = true
           WHERE code = $1 
             AND NOT consumed 
             AND expires_at > NOW()
           RETURNING user_id, email`,
          [code]
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
    }, 'validateAndConsumeCode', 'oauth_auth_codes');
  }

  /**
   * Clean up expired authorization codes
   * Returns number of codes deleted
   */
  async cleanupExpiredCodes(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const pool = connection.getPool();
      const result = await pool.query(
        `DELETE FROM oauth_auth_codes WHERE expires_at <= NOW()`
      );
      
      return result.rowCount || 0;
    }, 'cleanupExpiredCodes', 'oauth_auth_codes');
  }

  /**
   * Count active (non-expired, non-consumed) authorization codes
   */
  async countActiveCodes(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM oauth_auth_codes 
         WHERE expires_at > NOW() AND NOT consumed`
      );
      
      return result ? parseInt(result.count, 10) : 0;
    }, 'countActiveCodes', 'oauth_auth_codes');
  }
}