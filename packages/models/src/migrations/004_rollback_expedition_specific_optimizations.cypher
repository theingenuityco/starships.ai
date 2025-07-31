// Rollback Migration: 004_rollback_expedition_specific_optimizations.cypher
// Description: Rollback expedition-specific performance optimizations
// Date: 2025-01-20
// Author: System

// ============================================================================
// DROP EXPEDITION WORKFLOW OPTIMIZATIONS
// ============================================================================

DROP INDEX expedition_workflow_state_index IF EXISTS;
DROP INDEX expedition_active_status_index IF EXISTS;
DROP INDEX expedition_starship_active_composite IF EXISTS;
DROP INDEX starship_active_expeditions_index IF EXISTS;
DROP INDEX starship_max_expeditions_index IF EXISTS;

// ============================================================================
// DROP AGENT ASSIGNMENT OPTIMIZATIONS
// ============================================================================

DROP INDEX agent_availability_composite IF EXISTS;
DROP INDEX agent_skills_availability IF EXISTS;
DROP INDEX task_agent_active_status IF EXISTS;

// ============================================================================
// DROP MESSAGE THREADING OPTIMIZATIONS
// ============================================================================

DROP INDEX message_parent_child_index IF EXISTS;
DROP INDEX message_thread_role_composite IF EXISTS;
DROP INDEX message_expedition_recent IF EXISTS;

// ============================================================================
// DROP TASK DEPENDENCY OPTIMIZATIONS
// ============================================================================

DROP INDEX task_dependency_status IF EXISTS;
DROP INDEX task_ready_for_execution IF EXISTS;
DROP INDEX task_priority_dependencies IF EXISTS;

// ============================================================================
// DROP RESULT QUALITY OPTIMIZATIONS
// ============================================================================

DROP INDEX result_quality_overall IF EXISTS;
DROP INDEX result_quality_assessment IF EXISTS;
DROP INDEX result_needs_assessment IF EXISTS;

// ============================================================================
// DROP PERFORMANCE STATISTICS OPTIMIZATIONS
// ============================================================================

DROP INDEX expedition_duration_stats IF EXISTS;
DROP INDEX expedition_success_rate_stats IF EXISTS;
DROP INDEX task_effort_stats IF EXISTS;
DROP INDEX task_completion_stats IF EXISTS;

// ============================================================================
// DROP SEARCH AND FILTERING OPTIMIZATIONS
// ============================================================================

CALL db.index.fulltext.drop('expeditionAdvancedSearch');
CALL db.index.fulltext.drop('taskSkillsSearch');
CALL db.index.fulltext.drop('agentCapabilitiesSearch');

// ============================================================================
// DROP RELATIONSHIP PERFORMANCE OPTIMIZATIONS
// ============================================================================

DROP INDEX has_expedition_created_at IF EXISTS;
DROP INDEX has_task_created_at IF EXISTS;
DROP INDEX has_message_timestamp IF EXISTS;
DROP INDEX assigned_to_assigned_at IF EXISTS;
DROP INDEX deployed_on_active IF EXISTS;

// ============================================================================
// DROP CACHING HINTS AND QUERY OPTIMIZATION
// ============================================================================

MATCH (cache:QueryCache) 
WHERE cache.id IN ['expedition_stats_cache', 'agent_availability_cache', 'starship_capacity_cache']
DELETE cache;

// ============================================================================
// DROP QUERY PERFORMANCE MONITORING
// ============================================================================

MATCH (qp:QueryPerformance {id: 'expedition_query_monitor'})
DELETE qp;

// ============================================================================
// DROP SPECIALIZED CONSTRAINTS
// ============================================================================

DROP CONSTRAINT expedition_capacity_limit IF EXISTS;
DROP CONSTRAINT message_thread_consistency IF EXISTS;

// ============================================================================
// DROP BATCH OPERATION OPTIMIZATIONS
// ============================================================================

DROP INDEX expedition_bulk_status_update IF EXISTS;
DROP INDEX task_bulk_assignment IF EXISTS;
DROP INDEX message_bulk_insert IF EXISTS;

// ============================================================================
// DROP MONITORING
// ============================================================================

MATCH (im:IndexMonitor {id: 'expedition_index_monitor'})
DELETE im;

// ============================================================================
// REMOVE MIGRATION RECORD
// ============================================================================

MATCH (m:Migration {id: '004_expedition_specific_optimizations'})
DELETE m;

// ============================================================================
// ROLLBACK COMPLETION
// ============================================================================

CREATE (r:MigrationRollback {
  id: '004_rollback_expedition_specific_optimizations',
  originalMigration: '004_expedition_specific_optimizations',
  name: 'Rollback Expedition-Specific Performance Optimizations',
  description: 'Removed advanced indexes, caching, query hints, and expedition-specific constraints',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system'
})
RETURN r.id as rollbackId, r.appliedAt as appliedAt;