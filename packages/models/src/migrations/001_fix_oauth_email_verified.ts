import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  const sql = `-- Migration: Fix email_verified for OAuth-only users
-- Description: Backfill email_verified = true for users who only have OAuth accounts
-- Reason: OAuth providers (Google, GitHub) verify emails before we receive them,
--         so these users should have email_verified = true
-- Created: 2025-10-31

-- Update users who:
-- 1. Have email_verified = false (unverified)
-- 2. Have primary_auth_method = 'oauth' (OAuth-only users)
-- 3. Have no password (has_password = false)
UPDATE users
SET email_verified = true,
    updated_at = NOW()
WHERE email_verified = false
  AND primary_auth_method = 'oauth'
  AND has_password = false;
`;
  await client.query(sql);
}
