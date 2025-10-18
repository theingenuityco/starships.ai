-- Migration: Remove waitlist table and related constraints
-- Description: Remove waitlist functionality as registration flow is now simplified
-- Author: Claude Code
-- Version: 3.15.0
-- Date: 2025-10-12

-- ============================================================================
-- REMOVE WAITLIST TABLE
-- ============================================================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_waitlist_status;
DROP INDEX IF EXISTS idx_waitlist_created_at;

-- Drop the waitlist table
DROP TABLE IF EXISTS waitlist;

-- Note: This migration removes the waitlist feature entirely
-- All users now get automatic access after email verification