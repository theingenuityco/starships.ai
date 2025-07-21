// Rollback Migration: 003_rollback_database_optimizations.cypher
// Description: Rollback database performance optimizations and constraints
// Date: 2025-01-20
// Author: System

// ============================================================================
// DROP ENHANCED CONSTRAINTS
// ============================================================================

// Drop node existence constraints
DROP CONSTRAINT expedition_required_props IF EXISTS;
DROP CONSTRAINT expedition_task_required_props IF EXISTS;
DROP CONSTRAINT expedition_message_required_props IF EXISTS;
DROP CONSTRAINT expedition_result_required_props IF EXISTS;
DROP CONSTRAINT starship_required_props IF EXISTS;
DROP CONSTRAINT agent_required_props IF EXISTS;
DROP CONSTRAINT user_required_props IF EXISTS;

// Drop node key constraints
DROP CONSTRAINT starship_owner_slug_key IF EXISTS;

// Drop property value constraints
DROP CONSTRAINT expedition_status_values IF EXISTS;
DROP CONSTRAINT expedition_priority_values IF EXISTS;
DROP CONSTRAINT task_status_values IF EXISTS;
DROP CONSTRAINT task_priority_values IF EXISTS;
DROP CONSTRAINT message_role_values IF EXISTS;
DROP CONSTRAINT message_type_values IF EXISTS;
DROP CONSTRAINT result_type_values IF EXISTS;
DROP CONSTRAINT result_format_values IF EXISTS;
DROP CONSTRAINT starship_class_values IF EXISTS;
DROP CONSTRAINT starship_status_values IF EXISTS;

// ============================================================================
// DROP COMPOSITE INDEXES
// ============================================================================

// Drop expedition composite indexes
DROP INDEX expedition_starship_status_composite IF EXISTS;
DROP INDEX expedition_starship_priority_composite IF EXISTS;
DROP INDEX expedition_starship_created_composite IF EXISTS;
DROP INDEX expedition_status_priority_composite IF EXISTS;
DROP INDEX expedition_status_created_composite IF EXISTS;
DROP INDEX expedition_created_by_status_composite IF EXISTS;

// Drop task composite indexes
DROP INDEX task_expedition_status_composite IF EXISTS;
DROP INDEX task_expedition_priority_composite IF EXISTS;
DROP INDEX task_expedition_agent_composite IF EXISTS;
DROP INDEX task_agent_status_composite IF EXISTS;
DROP INDEX task_status_priority_composite IF EXISTS;

// Drop message composite indexes
DROP INDEX message_expedition_timestamp_composite IF EXISTS;
DROP INDEX message_expedition_role_composite IF EXISTS;
DROP INDEX message_expedition_type_composite IF EXISTS;
DROP INDEX message_thread_timestamp_composite IF EXISTS;
DROP INDEX message_agent_timestamp_composite IF EXISTS;

// Drop result composite indexes
DROP INDEX result_expedition_type_composite IF EXISTS;
DROP INDEX result_expedition_created_composite IF EXISTS;
DROP INDEX result_creator_type_composite IF EXISTS;

// Drop starship composite indexes
DROP INDEX starship_owner_status_composite IF EXISTS;
DROP INDEX starship_class_status_composite IF EXISTS;

// Drop agent composite indexes
DROP INDEX agent_starship_category_composite IF EXISTS;
DROP INDEX agent_author_public_composite IF EXISTS;

// ============================================================================
// DROP RANGE INDEXES
// ============================================================================

DROP INDEX expedition_created_at_range IF EXISTS;
DROP INDEX expedition_updated_at_range IF EXISTS;
DROP INDEX task_created_at_range IF EXISTS;
DROP INDEX task_updated_at_range IF EXISTS;
DROP INDEX message_timestamp_range IF EXISTS;
DROP INDEX result_created_at_range IF EXISTS;
DROP INDEX starship_created_at_range IF EXISTS;
DROP INDEX agent_created_at_range IF EXISTS;

// ============================================================================
// DROP ARRAY INDEXES
// ============================================================================

DROP INDEX expedition_tags_array IF EXISTS;
DROP INDEX expedition_assigned_agents_array IF EXISTS;
DROP INDEX task_required_skills_array IF EXISTS;
DROP INDEX task_dependencies_array IF EXISTS;
DROP INDEX agent_tags_array IF EXISTS;
DROP INDEX agent_allowed_starship_classes_array IF EXISTS;

// ============================================================================
// DROP RELATIONSHIP CONSTRAINTS
// ============================================================================

DROP CONSTRAINT expedition_single_starship IF EXISTS;
DROP CONSTRAINT task_single_expedition IF EXISTS;
DROP CONSTRAINT message_single_expedition IF EXISTS;
DROP CONSTRAINT result_single_expedition IF EXISTS;

// ============================================================================
// CLEANUP PERFORMANCE MONITORING
// ============================================================================

MATCH (pm:PerformanceMonitor {id: 'expedition_system_monitor'})
DELETE pm;

// ============================================================================
// REMOVE MIGRATION RECORD
// ============================================================================

MATCH (m:Migration {id: '003_database_optimizations'})
DELETE m;

// ============================================================================
// ROLLBACK COMPLETION
// ============================================================================

CREATE (r:MigrationRollback {
  id: '003_rollback_database_optimizations',
  originalMigration: '003_database_optimizations',
  name: 'Rollback Database Performance Optimizations',
  description: 'Removed enhanced constraints, composite indexes, range indexes, and relationship constraints',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system'
})
RETURN r.id as rollbackId, r.appliedAt as appliedAt;