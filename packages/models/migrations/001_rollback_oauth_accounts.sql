-- PostgreSQL Migration Rollback: OAuth Support
-- Description: Rollback OAuth Support changes
-- Author: OAuth Implementation Team
-- Version: 1.0.0
-- Rollback for: 001_oauth_accounts.sql
-- Last Updated: 2024-10-05

-- Remove OAuth accounts table and related components
DROP TRIGGER IF EXISTS update_oauth_accounts_updated_at ON oauth_accounts;
DROP TABLE IF EXISTS oauth_accounts;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;