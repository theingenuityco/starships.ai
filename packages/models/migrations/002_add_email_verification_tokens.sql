-- Migration: Add email verification tokens table
-- Description: Add email verification tokens table for user email verification during registration
-- Author: Claude Code
-- Version: 3.15.0
-- Date: 2025-10-12

-- ============================================================================
-- EMAIL VERIFICATION TOKENS TABLE
-- ============================================================================

CREATE TABLE email_verification_tokens (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Email verification token indexes
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token) WHERE NOT consumed;
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_email ON email_verification_tokens(email);

-- Comment for documentation
COMMENT ON TABLE email_verification_tokens IS 'Email verification tokens for user registration - separate from OAuth for clean architecture';