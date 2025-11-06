-- Migration: Add unique constraints for single active token per user
-- Description: Ensures only one active (non-consumed) token exists per user for each token type
-- Created: 2025-01-XX
-- 
-- This migration adds partial unique indexes to enforce single active token per user:
-- - Email verification tokens: Only one unconsumed verification token per user
-- - Password reset tokens: Only one unconsumed reset token per user  
-- - Email change tokens: Only one unconsumed change token per user
--
-- Note: We use WHERE NOT consumed (without expiration check) because:
-- 1. NOW() is not immutable and cannot be used in index predicates
-- 2. Application code already cancels old tokens before creating new ones
-- 3. Expired tokens are automatically excluded by queries (expires_at > NOW())
-- 4. This prevents race conditions while allowing expired tokens to coexist
--
-- These constraints prevent race conditions and ensure consistent behavior across all token types.

-- ============================================================================
-- EMAIL VERIFICATION TOKENS - Single Active Token Constraint
-- ============================================================================

-- Add unique constraint: Only one unconsumed token per user
-- Expiration is handled by application logic and query filters
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verification_tokens_user_pending
ON email_verification_tokens(user_id)
WHERE NOT consumed;

-- ============================================================================
-- PASSWORD RESET TOKENS - Single Active Token Constraint
-- ============================================================================

-- Add unique constraint: Only one unconsumed token per user
-- Expiration is handled by application logic and query filters
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_user_pending
ON password_reset_tokens(user_id)
WHERE NOT consumed;

-- ============================================================================
-- EMAIL CHANGE TOKENS - Single Active Token Constraint
-- ============================================================================

-- Add unique constraint: Only one unconsumed token per user
-- Expiration is handled by application logic and query filters
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_change_tokens_user_pending
ON email_change_tokens(user_id)
WHERE NOT consumed;

