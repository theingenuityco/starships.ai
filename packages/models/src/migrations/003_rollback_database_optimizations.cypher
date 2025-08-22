// Rollback Migration: 003_rollback_database_optimizations.cypher
// Description: Rollback database performance optimizations and constraints
// Date: 2025-01-20
// Author: System

// ============================================================================
// DROP ENHANCED CONSTRAINTS
// ============================================================================

// Drop node existence constraints
DROP CONSTRAINT starship_required_props IF EXISTS;
DROP CONSTRAINT agent_required_props IF EXISTS;
DROP CONSTRAINT user_required_props IF EXISTS;

// Drop node key constraints
DROP CONSTRAINT starship_owner_slug_key IF EXISTS;

// Drop property value constraints
DROP CONSTRAINT starship_class_values IF EXISTS;
DROP CONSTRAINT starship_status_values IF EXISTS;

// ============================================================================
// DROP COMPOSITE INDEXES
// ============================================================================

// Drop starship composite indexes
DROP INDEX starship_owner_status_composite IF EXISTS;
DROP INDEX starship_class_status_composite IF EXISTS;

// Drop agent composite indexes
DROP INDEX agent_starship_category_composite IF EXISTS;
DROP INDEX agent_author_public_composite IF EXISTS;

// ============================================================================
// DROP RANGE INDEXES
// ============================================================================

DROP INDEX starship_created_at_range IF EXISTS;
DROP INDEX agent_created_at_range IF EXISTS;

// ============================================================================
// DROP ARRAY INDEXES
// ============================================================================

DROP INDEX agent_tags_array IF EXISTS;
DROP INDEX agent_allowed_starship_classes_array IF EXISTS;

// ============================================================================
// DROP RELATIONSHIP CONSTRAINTS
// ============================================================================

// ============================================================================
// CLEANUP PERFORMANCE MONITORING
// ============================================================================

MATCH (pm:PerformanceMonitor {id: 'starship_system_monitor'})
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