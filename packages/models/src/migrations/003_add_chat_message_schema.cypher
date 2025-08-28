// Migration 003: Add Chat Message Schema
// Description: Add ChatMessage node with constraints and indexes for chat message storage
// Date: 2025-01-27
// Author: System
// Dependencies: 002_add_chat_session_schema

// ============================================================================
// CHAT MESSAGE CONSTRAINTS
// ============================================================================

// Chat message constraints
CREATE CONSTRAINT chat_message_id_unique IF NOT EXISTS FOR (cm:ChatMessage) REQUIRE cm.id IS UNIQUE;
CREATE CONSTRAINT chat_message_required_props IF NOT EXISTS FOR (cm:ChatMessage) REQUIRE (cm.id, cm.session_id, cm.role, cm.content, cm.timestamp) IS NOT NULL;
CREATE CONSTRAINT chat_message_role_values IF NOT EXISTS FOR (cm:ChatMessage) REQUIRE cm.role IN ['user', 'assistant', 'system'];

// ============================================================================
// CHAT MESSAGE INDEXES
// ============================================================================

// Basic indexes for lookups
CREATE INDEX chat_message_session_index IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.session_id);
CREATE INDEX chat_message_role_index IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.role);
CREATE INDEX chat_message_stream_index IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.stream_id);

// Range indexes for time-based queries
CREATE RANGE INDEX chat_message_timestamp_range IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.timestamp);

// Composite indexes for common query patterns
CREATE INDEX chat_message_session_role_composite IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.session_id, cm.role);
CREATE INDEX chat_message_session_timestamp_composite IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.session_id, cm.timestamp);

// ============================================================================
// MIGRATION COMPLETION RECORD
// ============================================================================

CREATE (m:Migration {
  id: '003_add_chat_message_schema',
  name: 'Add Chat Message Schema',
  description: 'Add ChatMessage node with constraints and indexes for chat message storage',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  dependencies: ['002_add_chat_session_schema'],
  features: [
    'chat_message_management',
    'chat_message_constraints',
    'chat_message_indexes',
    'chat_message_relationships'
  ]
});

// ============================================================================
// VERIFICATION
// ============================================================================

// Return summary of chat message schema
MATCH (cm:ChatMessage)
RETURN count(cm) as chatMessageCount;