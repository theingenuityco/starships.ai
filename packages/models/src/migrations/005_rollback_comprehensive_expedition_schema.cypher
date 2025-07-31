// Rollback Migration: 005_rollback_comprehensive_expedition_schema.cypher
// Description: Rollback comprehensive expedition orchestration system schema enhancements
// Date: 2025-01-21
// Author: System
// Rollback for: 005_comprehensive_expedition_schema

// ============================================================================
// ROLLBACK PERFORMANCE MONITORING AND BACKUP METADATA
// ============================================================================

// Remove performance monitoring nodes
MATCH (monitor:PerformanceMonitor:ExpeditionSystem {id: 'expedition_performance_monitor'})
DETACH DELETE monitor;

// Remove backup metadata nodes
MATCH (backup:BackupMetadata:ExpeditionSystem {id: 'expedition_backup_metadata'})
DETACH DELETE backup;

// ============================================================================
// ROLLBACK QUERY CACHE NODES
// ============================================================================

// Remove cache nodes
MATCH (cache:QueryCache:ExpeditionStats {id: 'expedition_stats_cache'})
DETACH DELETE cache;

MATCH (cache:QueryCache:TaskStats {id: 'task_stats_cache'})
DETACH DELETE cache;

MATCH (cache:QueryCache:AgentPerformance {id: 'agent_performance_cache'})
DETACH DELETE cache;

// ============================================================================
// ROLLBACK CUSTOM PROCEDURES
// ============================================================================

// Remove custom validation procedures
CALL apoc.custom.removeProcedure('expedition.validateIntegrity');

// ============================================================================
// ROLLBACK RELATIONSHIP INDEXES
// ============================================================================

// Drop relationship indexes
DROP INDEX has_expedition_created_at_index IF EXISTS;
DROP INDEX assigned_to_expedition_index IF EXISTS;
DROP INDEX has_task_created_at_index IF EXISTS;
DROP INDEX has_message_timestamp_index IF EXISTS;
DROP INDEX has_result_created_at_index IF EXISTS;
DROP INDEX depends_on_created_at_index IF EXISTS;
DROP INDEX replies_to_timestamp_index IF EXISTS;
DROP INDEX sent_message_timestamp_index IF EXISTS;
DROP INDEX created_result_timestamp_index IF EXISTS;

// ============================================================================
// ROLLBACK ADVANCED FULL-TEXT SEARCH INDEXES
// ============================================================================

// Drop enhanced full-text search indexes
CALL db.index.fulltext.drop('expeditionAdvancedSearch');
CALL db.index.fulltext.drop('expeditionTaskAdvancedSearch');
CALL db.index.fulltext.drop('expeditionMessageAdvancedSearch');
CALL db.index.fulltext.drop('expeditionResultAdvancedSearch');

// ============================================================================
// ROLLBACK ENHANCED PERFORMANCE INDEXES
// ============================================================================

// Drop result indexes (enhanced)
DROP INDEX expedition_result_quality_accuracy_index IF EXISTS;
DROP INDEX expedition_result_quality_completeness_index IF EXISTS;
DROP INDEX expedition_result_quality_overall_index IF EXISTS;
DROP INDEX expedition_result_creator_type_index IF EXISTS;
DROP INDEX expedition_result_expedition_format_index IF EXISTS;
DROP INDEX expedition_result_expedition_type_index IF EXISTS;

// Drop message indexes (enhanced)
DROP INDEX expedition_message_parent_index IF EXISTS;
DROP INDEX expedition_message_thread_timestamp_index IF EXISTS;
DROP INDEX expedition_message_user_timestamp_index IF EXISTS;
DROP INDEX expedition_message_agent_timestamp_index IF EXISTS;
DROP INDEX expedition_message_expedition_type_index IF EXISTS;
DROP INDEX expedition_message_expedition_role_index IF EXISTS;

// Drop task indexes (enhanced)
DROP INDEX expedition_task_dependencies_index IF EXISTS;
DROP INDEX expedition_task_skills_index IF EXISTS;
DROP INDEX expedition_task_priority_created_at_index IF EXISTS;
DROP INDEX expedition_task_status_created_at_index IF EXISTS;
DROP INDEX expedition_task_agent_status_index IF EXISTS;
DROP INDEX expedition_task_expedition_priority_index IF EXISTS;
DROP INDEX expedition_task_expedition_status_index IF EXISTS;

// Drop expedition indexes (enhanced)
DROP INDEX expedition_tags_index IF EXISTS;
DROP INDEX expedition_created_by_status_index IF EXISTS;
DROP INDEX expedition_priority_created_at_index IF EXISTS;
DROP INDEX expedition_status_created_at_index IF EXISTS;
DROP INDEX expedition_starship_priority_index IF EXISTS;
DROP INDEX expedition_starship_status_index IF EXISTS;

// ============================================================================
// ROLLBACK ENHANCED CONSTRAINTS
// ============================================================================

// Drop enhanced constraints (keep basic ones from 002_expedition_system)
DROP CONSTRAINT message_thread_unique IF EXISTS;
DROP CONSTRAINT task_dependency_unique IF EXISTS;
DROP CONSTRAINT agent_expedition_assignment_unique IF EXISTS;
DROP CONSTRAINT expedition_starship_title_unique IF EXISTS;

// Note: We keep the basic unique constraints from 002_expedition_system:
// - expedition_id_unique
// - expedition_task_id_unique
// - expedition_message_id_unique
// - expedition_result_id_unique

// ============================================================================
// ROLLBACK MIGRATION RECORD
// ============================================================================

// Remove migration record
MATCH (m:Migration {id: '005_comprehensive_expedition_schema'})
DETACH DELETE m;

// ============================================================================
// VERIFICATION OF ROLLBACK
// ============================================================================

// Verify enhanced constraints were removed
SHOW CONSTRAINTS 
WHERE name IN [
  'expedition_starship_title_unique',
  'agent_expedition_assignment_unique',
  'task_dependency_unique',
  'message_thread_unique'
]
YIELD name, type, entityType, labelsOrTypes, properties, options
RETURN count(*) as remainingEnhancedConstraints, collect(name) as constraintNames;

// Verify enhanced indexes were removed
SHOW INDEXES 
WHERE name IN [
  'expedition_starship_status_index',
  'expedition_starship_priority_index',
  'expedition_status_created_at_index',
  'expedition_priority_created_at_index',
  'expedition_created_by_status_index',
  'expedition_tags_index',
  'expedition_task_expedition_status_index',
  'expedition_task_expedition_priority_index',
  'expedition_task_agent_status_index',
  'expedition_task_status_created_at_index',
  'expedition_task_priority_created_at_index',
  'expedition_task_skills_index',
  'expedition_task_dependencies_index',
  'expedition_message_expedition_role_index',
  'expedition_message_expedition_type_index',
  'expedition_message_agent_timestamp_index',
  'expedition_message_user_timestamp_index',
  'expedition_message_thread_timestamp_index',
  'expedition_message_parent_index',
  'expedition_result_expedition_type_index',
  'expedition_result_expedition_format_index',
  'expedition_result_creator_type_index',
  'expedition_result_quality_overall_index',
  'expedition_result_quality_completeness_index',
  'expedition_result_quality_accuracy_index'
]
YIELD name, type, entityType, labelsOrTypes, properties, options
RETURN count(*) as remainingEnhancedIndexes, collect(name) as indexNames;

// Verify cache nodes were removed
MATCH (cache:QueryCache)
RETURN count(cache) as remainingCacheNodes, collect(cache.id) as cacheIds;

// Verify monitoring nodes were removed
MATCH (monitor:PerformanceMonitor)
RETURN count(monitor) as remainingMonitorNodes, collect(monitor.id) as monitorIds;

// Verify backup metadata nodes were removed
MATCH (backup:BackupMetadata)
RETURN count(backup) as remainingBackupNodes, collect(backup.id) as backupIds;

// Log rollback completion
CREATE (rollback:MigrationRollback {
  id: '005_rollback_comprehensive_expedition_schema',
  originalMigration: '005_comprehensive_expedition_schema',
  description: 'Rollback of comprehensive expedition schema enhancements',
  rolledBackAt: datetime().epochMillis,
  rolledBackBy: 'system',
  itemsRemoved: [
    'enhanced_constraints',
    'composite_indexes',
    'advanced_full_text_search',
    'relationship_indexes',
    'query_cache_nodes',
    'performance_monitoring',
    'backup_metadata',
    'custom_procedures'
  ]
})
RETURN rollback.id as rollbackId, rollback.rolledBackAt as rolledBackAt, rollback.itemsRemoved as itemsRemoved;