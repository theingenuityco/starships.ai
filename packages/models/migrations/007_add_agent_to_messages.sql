-- Migration: Add agent tracking to messages table
-- Description: Add agent_id and agent_name columns to track which agent responded to each message
-- Version: 007
-- Date: 2025-10-26

-- Add agent_id column to messages table
ALTER TABLE messages
ADD COLUMN agent_id VARCHAR(255) REFERENCES agents(id) ON DELETE SET NULL;

-- Add agent_name column for display (denormalized for performance)
ALTER TABLE messages
ADD COLUMN agent_name VARCHAR(100);

-- Create index for agent_id lookups
CREATE INDEX idx_messages_agent_id ON messages(agent_id);

-- Add comments for documentation
COMMENT ON COLUMN messages.agent_id IS 'ID of the agent that generated this message (assistant messages only)';
COMMENT ON COLUMN messages.agent_name IS 'Denormalized agent name for display without join (assistant messages only)';
