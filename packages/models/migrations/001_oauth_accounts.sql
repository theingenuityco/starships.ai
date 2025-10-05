-- PostgreSQL Migration: OAuth Support
-- Description: Adds oauth_accounts table and email verification to users
-- Author: OAuth Implementation Team
-- Version: 1.0.0
-- Dependencies: 000_postgresql_schema
-- Last Updated: 2024-10-05

-- Add email verification to existing users table (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Mark existing users as verified (they proved email access via password)
UPDATE users SET email_verified = TRUE WHERE password IS NOT NULL;

-- Create simplified OAuth accounts table (if not exists)
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    profile_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Prevent duplicate provider accounts
    UNIQUE(provider, provider_user_id)
);

-- Performance indexes (if not exists)
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_email ON oauth_accounts(email);

-- Auto-update timestamp trigger (avoiding function definition issues in migration runner)
-- Use PostgreSQL's built-in approach with ON UPDATE CURRENT_TIMESTAMP equivalent
-- We'll handle this via application logic instead of database triggers to avoid migration runner issues

-- Documentation
COMMENT ON TABLE oauth_accounts IS 'OAuth account links - supports multiple providers per user';
COMMENT ON COLUMN users.email_verified IS 'Email verification status - true for OAuth and password users';