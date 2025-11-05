-- Migration: Add email change tokens table
-- Description: Enables email change verification flow
-- Created: 2025-01-XX

CREATE TABLE email_change_tokens (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_email VARCHAR(255) NOT NULL,
    new_email VARCHAR(255) NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes following password reset token pattern
CREATE INDEX idx_email_change_tokens_token ON email_change_tokens(token) WHERE NOT consumed;
CREATE INDEX idx_email_change_tokens_expires_at ON email_change_tokens(expires_at);
CREATE INDEX idx_email_change_tokens_user_id ON email_change_tokens(user_id);
CREATE INDEX idx_email_change_tokens_new_email ON email_change_tokens(new_email);

