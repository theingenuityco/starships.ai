-- Migration: Add last_login_at column to users table
-- Description: Track user's last login timestamp for welcome modal and security features
-- Author: Claude Code
-- Version: 3.16.0
-- Date: 2025-10-25

-- ============================================================================
-- ADD LAST_LOGIN_AT COLUMN TO USERS TABLE
-- ============================================================================

-- Add last_login_at column to track when user last logged in
ALTER TABLE users
ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;

-- Add index for last_login_at (useful for queries filtering by login activity)
CREATE INDEX idx_users_last_login_at ON users(last_login_at);

-- Comment for documentation
COMMENT ON COLUMN users.last_login_at IS 'Timestamp of user''s last successful login - used for welcome modal (first login detection) and security features';
