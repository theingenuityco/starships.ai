-- Migration: Add preview_prompts to agents as TEXT[]
-- Description: Store example prompts on agents to support inline suggestions
-- Author: Migration Script
-- Date: 2025-10-21

ALTER TABLE agents ADD COLUMN IF NOT EXISTS preview_prompts TEXT[] DEFAULT ARRAY[]::TEXT[];


