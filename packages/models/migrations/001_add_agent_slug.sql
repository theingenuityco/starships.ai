-- Migration: Add slug column to agents table with unique constraint
-- Description: Add globally unique slug column to agents table
-- Author: Migration Script
-- Version: 2.2.0
-- Date: 2025-01-10

-- Add slug column to agents table
ALTER TABLE agents ADD COLUMN slug VARCHAR(100);

-- Create unique index on slug column
CREATE UNIQUE INDEX idx_agents_slug_unique ON agents(slug);

-- Add index for performance
CREATE INDEX idx_agents_slug ON agents(slug);

-- Update existing agents with generated slugs (if any exist)
-- This will generate slugs in the format: agent-{id}
UPDATE agents 
SET slug = 'agent-' || id 
WHERE slug IS NULL;

-- Make slug column NOT NULL after populating existing records
ALTER TABLE agents ALTER COLUMN slug SET NOT NULL;
