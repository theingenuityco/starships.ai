-- Rollback migration: Remove user authentication method tracking
-- Purpose: Rollback adaptive OAuth security UI auth method changes

-- Drop constraints first
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_password_consistency;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_auth_methods;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_primary_auth_method;

-- Drop indexes
DROP INDEX IF EXISTS idx_users_primary_auth_method;
DROP INDEX IF EXISTS idx_users_auth_methods;
DROP INDEX IF EXISTS idx_users_has_password;

-- Remove columns
ALTER TABLE users DROP COLUMN IF EXISTS primary_auth_method;
ALTER TABLE users DROP COLUMN IF EXISTS auth_methods;
ALTER TABLE users DROP COLUMN IF EXISTS has_password;