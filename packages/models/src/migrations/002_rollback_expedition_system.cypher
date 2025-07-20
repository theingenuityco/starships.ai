// Rollback Migration: 002_rollback_expedition_system.cypher
// Description: Rollback expedition orchestration system schema
// Date: 2025-01-19
// Author: System

// ============================================================================
// WARNING: DESTRUCTIVE OPERATIONS
// ============================================================================
// This rollback script will permanently delete all expedition data.
// Make sure to backup your data before running this script.

// ============================================================================
// DROP FULL-TEXT SEARCH INDEXES
// ============================================================================

// Drop full-text search indexes
CALL db.index.fulltext.drop('expeditionSearch');
CALL db.index.fulltext.drop('expeditionTaskSearch');
CALL db.index.fulltext.drop('expeditionMessageSearch');
CALL db.index.fulltext.drop('expeditionResultSearch');

// ============================================================================
// DROP REGULAR INDEXES
// ============================================================================

// Drop expedition indexes
DROP INDEX expedition_starship_index IF EXISTS;
DROP INDEX expedition_status_index IF EXISTS;
DROP INDEX expedition_priority_index IF EXISTS;
DROP INDEX expedition_created_by_index IF EXISTS;
DROP INDEX expedition_created_at_index IF EXISTS;
DROP INDEX expedition_updated_at_index IF EXISTS;

// Drop task indexes
DROP INDEX expedition_task_expedition_index IF EXISTS;
DROP INDEX expedition_task_status_index IF EXISTS;
DROP INDEX expedition_task_priority_index IF EXISTS;
DROP INDEX expedition_task_assigned_agent_index IF EXISTS;
DROP INDEX expedition_task_created_at_index IF EXISTS;

// Drop message indexes
DROP INDEX expedition_message_expedition_index IF EXISTS;
DROP INDEX expedition_message_role_index IF EXISTS;
DROP INDEX expedition_message_type_index IF EXISTS;
DROP INDEX expedition_message_timestamp_index IF EXISTS;
DROP INDEX expedition_message_agent_index IF EXISTS;
DROP INDEX expedition_message_user_index IF EXISTS;
DROP INDEX expedition_message_thread_index IF EXISTS;

// Drop result indexes
DROP INDEX expedition_result_expedition_index IF EXISTS;
DROP INDEX expedition_result_type_index IF EXISTS;
DROP INDEX expedition_result_format_index IF EXISTS;
DROP INDEX expedition_result_created_by_index IF EXISTS;
DROP INDEX expedition_result_created_at_index IF EXISTS;

// ============================================================================
// DELETE ALL EXPEDITION DATA
// ============================================================================

// Delete all expedition results and their relationships
MATCH (r:ExpeditionResult)
DETACH DELETE r;

// Delete all expedition messages and their relationships
MATCH (m:ExpeditionMessage)
DETACH DELETE m;

// Delete all expedition tasks and their relationships
MATCH (t:ExpeditionTask)
DETACH DELETE t;

// Delete all expeditions and their relationships
MATCH (e:Expedition)
DETACH DELETE e;

// ============================================================================
// DROP CONSTRAINTS
// ============================================================================

// Drop expedition system constraints
DROP CONSTRAINT expedition_id_unique IF EXISTS;
DROP CONSTRAINT expedition_task_id_unique IF EXISTS;
DROP CONSTRAINT expedition_message_id_unique IF EXISTS;
DROP CONSTRAINT expedition_result_id_unique IF EXISTS;

// ============================================================================
// CLEAN UP STARSHIP EXPEDITION COUNTERS
// ============================================================================

// Reset activeExpeditions counter on all starships
MATCH (s:Starship)
SET s.activeExpeditions = 0;

// ============================================================================
// VERIFICATION QUERIES
// ============================================================================

// Verify all expedition data has been removed
MATCH (e:Expedition) RETURN count(e) as expeditionCount;
MATCH (t:ExpeditionTask) RETURN count(t) as taskCount;
MATCH (m:ExpeditionMessage) RETURN count(m) as messageCount;
MATCH (r:ExpeditionResult) RETURN count(r) as resultCount;

// Verify constraints were dropped
SHOW CONSTRAINTS 
WHERE name CONTAINS 'expedition';

// Verify indexes were dropped
SHOW INDEXES 
WHERE name CONTAINS 'expedition';

// ============================================================================
// LOG ROLLBACK COMPLETION
// ============================================================================

// Log rollback completion
CREATE (m:Migration {
  id: '002_rollback_expedition_system',
  name: 'Rollback Expedition Orchestration System',
  description: 'Remove expedition system schema, data, constraints, and indexes',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  type: 'rollback',
  rolledBackMigration: '002_expedition_system'
})
RETURN m.id as rollbackId, m.appliedAt as appliedAt;

// ============================================================================
// FINAL VERIFICATION
// ============================================================================

// Final count verification - should all return 0
RETURN 
  size([(e:Expedition) | e]) as expeditions,
  size([(t:ExpeditionTask) | t]) as tasks,
  size([(m:ExpeditionMessage) | m]) as messages,
  size([(r:ExpeditionResult) | r]) as results;