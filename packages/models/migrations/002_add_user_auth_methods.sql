-- Migration: Add user authentication method tracking
-- Purpose: Support adaptive OAuth security UI by tracking user auth methods

-- Add new columns to users table for auth method tracking
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS has_password BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auth_methods TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS primary_auth_method VARCHAR(10) DEFAULT 'password';

-- Update existing users based on current data
-- Set has_password flag based on password column
UPDATE users 
SET has_password = (password IS NOT NULL AND password != '');

-- Set auth_methods array for password users
UPDATE users 
SET auth_methods = ARRAY['password']::TEXT[]
WHERE has_password = TRUE;

-- Set primary_auth_method for password users  
UPDATE users 
SET primary_auth_method = 'password'
WHERE has_password = TRUE;

-- Update OAuth users by joining with oauth_accounts table
-- Add OAuth providers to auth_methods array
UPDATE users 
SET 
  auth_methods = auth_methods || ARRAY[oa.provider]::TEXT[],
  primary_auth_method = CASE 
    WHEN has_password = FALSE THEN 'oauth'
    ELSE primary_auth_method
  END
FROM oauth_accounts oa 
WHERE users.id = oa.user_id;

-- Handle edge case: users with no auth methods (shouldn't happen but safety first)
UPDATE users 
SET 
  auth_methods = ARRAY['password']::TEXT[],
  primary_auth_method = 'password'
WHERE array_length(auth_methods, 1) IS NULL OR array_length(auth_methods, 1) = 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_has_password ON users(has_password);
CREATE INDEX IF NOT EXISTS idx_users_auth_methods ON users USING GIN(auth_methods);
CREATE INDEX IF NOT EXISTS idx_users_primary_auth_method ON users(primary_auth_method);

-- Add constraints to ensure data consistency
ALTER TABLE users 
ADD CONSTRAINT chk_users_primary_auth_method 
CHECK (primary_auth_method IN ('password', 'oauth'));

-- Ensure auth_methods array contains valid values
ALTER TABLE users 
ADD CONSTRAINT chk_users_auth_methods 
CHECK (
  auth_methods <@ ARRAY['password', 'google', 'github']::TEXT[] 
  AND array_length(auth_methods, 1) > 0
);

-- Ensure consistency between has_password and auth_methods
ALTER TABLE users 
ADD CONSTRAINT chk_users_password_consistency 
CHECK (
  (has_password = TRUE AND 'password' = ANY(auth_methods)) OR
  (has_password = FALSE AND NOT('password' = ANY(auth_methods)))
);