-- Migration: Add password reset tokens table
-- Description: Password reset tokens for account recovery functionality
-- Author: Engineering Team
-- Version: 1.0.0

CREATE TABLE password_reset_tokens (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token VARCHAR(64) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes following email verification pattern
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token) WHERE NOT consumed;
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_email ON password_reset_tokens(email);

COMMENT ON TABLE password_reset_tokens IS 'Password reset tokens for account recovery - 1 hour expiry for security';