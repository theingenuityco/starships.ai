// Migration 002: Add Chat Session Schema
// Description: Add ChatSession node with constraints and indexes for chat functionality
// Date: 2025-01-27
// Author: System
// Dependencies: 001_initialize_schema

// ============================================================================
// CHAT SESSION CONSTRAINTS
// ============================================================================

// Chat session constraints
CREATE CONSTRAINT chat_session_id_unique IF NOT EXISTS FOR (cs:ChatSession) REQUIRE cs.id IS UNIQUE;
CREATE CONSTRAINT chat_session_required_props IF NOT EXISTS FOR (cs:ChatSession) REQUIRE (cs.id, cs.source, cs.created_by, cs.created_at, cs.last_activity_at, cs.total_tokens) IS NOT NULL;
CREATE CONSTRAINT chat_session_source_values IF NOT EXISTS FOR (cs:ChatSession) REQUIRE cs.source IN ['sibil', 'agent'];

// ============================================================================
// CHAT SESSION INDEXES
// ============================================================================

// Basic indexes for lookups
CREATE INDEX chat_session_created_by_index IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_by);
CREATE INDEX chat_session_source_index IF NOT EXISTS FOR (cs:ChatSession) ON (cs.source);
CREATE RANGE INDEX chat_session_created_at_range IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_at);
CREATE RANGE INDEX chat_session_last_activity_range IF NOT EXISTS FOR (cs:ChatSession) ON (cs.last_activity_at);
CREATE INDEX chat_session_total_tokens_index IF NOT EXISTS FOR (cs:ChatSession) ON (cs.total_tokens);

// Composite indexes for common queries
CREATE INDEX chat_session_user_activity_composite IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_by, cs.last_activity_at);
CREATE INDEX chat_session_user_source_composite IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_by, cs.source);

// ============================================================================
// MIGRATION COMPLETION RECORD
// ============================================================================

CREATE (m:Migration {
  id: '002_add_chat_session_schema',
  name: 'Add Chat Session Schema',
  description: 'Add ChatSession node with constraints and indexes for chat functionality',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  dependencies: ['001_initialize_schema'],
  features: [
    'chat_session_management',
    'chat_session_constraints',
    'chat_session_indexes'
  ]
});

// ============================================================================
// VERIFICATION
// ============================================================================

// Return summary of chat session schema
MATCH (cs:ChatSession)
RETURN count(cs) as chatSessionCount;