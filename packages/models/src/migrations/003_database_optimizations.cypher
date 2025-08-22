// Migration: 003_database_optimizations.cypher
// Description: Comprehensive database performance optimizations and constraints
// Date: 2025-01-20
// Author: System
// Dependencies: None

// ============================================================================
// ENHANCED CONSTRAINTS FOR DATA INTEGRITY
// ============================================================================

// Node existence constraints - ensure required properties exist
CREATE CONSTRAINT starship_required_props IF NOT EXISTS 
FOR (s:Starship) REQUIRE (s.id, s.ownerId, s.name, s.class, s.status, s.createdAt) IS NOT NULL;

CREATE CONSTRAINT agent_required_props IF NOT EXISTS 
FOR (a:Agent) REQUIRE (a.id, a.name, a.starshipId, a.createdAt) IS NOT NULL;

CREATE CONSTRAINT user_required_props IF NOT EXISTS 
FOR (u:User) REQUIRE (u.id, u.username, u.createdAt) IS NOT NULL;

// Node key constraints for composite uniqueness
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS 
FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS NODE KEY;

// Property value constraints
CREATE CONSTRAINT starship_class_values IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.class IN ['scout', 'cruiser'];

CREATE CONSTRAINT starship_status_values IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.status IN ['active', 'inactive'];

// ============================================================================
// COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
// ============================================================================

// Starship composite indexes
CREATE INDEX starship_owner_status_composite IF NOT EXISTS 
FOR (s:Starship) ON (s.ownerId, s.status);

CREATE INDEX starship_class_status_composite IF NOT EXISTS 
FOR (s:Starship) ON (s.class, s.status);

// Agent composite indexes
CREATE INDEX agent_starship_category_composite IF NOT EXISTS 
FOR (a:Agent) ON (a.starshipId, a.category);

CREATE INDEX agent_author_public_composite IF NOT EXISTS 
FOR (a:Agent) ON (a.authorId, a.isPublic);

// ============================================================================
// RANGE INDEXES FOR DATE/TIME QUERIES
// ============================================================================

CREATE RANGE INDEX starship_created_at_range IF NOT EXISTS 
FOR (s:Starship) ON (s.createdAt);

CREATE RANGE INDEX agent_created_at_range IF NOT EXISTS 
FOR (a:Agent) ON (a.createdAt);

// ============================================================================
// ARRAY INDEXES FOR MULTI-VALUE PROPERTIES
// ============================================================================

CREATE INDEX agent_tags_array IF NOT EXISTS 
FOR (a:Agent) ON (a.tags);

CREATE INDEX agent_allowed_starship_classes_array IF NOT EXISTS 
FOR (a:Agent) ON (a.allowedStarshipClasses);

// ============================================================================
// RELATIONSHIP CONSTRAINTS
// ============================================================================

// ============================================================================
// PERFORMANCE MONITORING SETUP
// ============================================================================

// Create performance monitoring node
CREATE (pm:PerformanceMonitor {
  id: 'starship_system_monitor',
  name: 'Starship System Performance Monitor',
  createdAt: datetime().epochMillis,
  lastUpdated: datetime().epochMillis,
  queryStats: {},
  indexUsage: {},
  constraintViolations: 0
});

// ============================================================================
// VERIFICATION QUERIES
// ============================================================================

// Count all constraints
SHOW CONSTRAINTS 
YIELD name, type, entityType, labelsOrTypes, properties, options
WHERE name CONTAINS 'starship' OR name CONTAINS 'agent' OR name CONTAINS 'user'
RETURN count(*) as totalConstraints;

// Count all indexes
SHOW INDEXES 
YIELD name, type, entityType, labelsOrTypes, properties, options
WHERE name CONTAINS 'starship' OR name CONTAINS 'agent' OR name CONTAINS 'user'
RETURN count(*) as totalIndexes;

// ============================================================================
// MIGRATION COMPLETION
// ============================================================================

CREATE (m:Migration {
  id: '003_database_optimizations',
  name: 'Database Performance Optimizations',
  description: 'Enhanced constraints, composite indexes, range indexes, and relationship constraints',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  dependencies: []
})
RETURN m.id as migrationId, m.appliedAt as appliedAt;