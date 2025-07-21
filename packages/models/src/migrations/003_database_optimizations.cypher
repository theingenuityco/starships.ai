// Migration: 003_database_optimizations.cypher
// Description: Comprehensive database performance optimizations and constraints
// Date: 2025-01-20
// Author: System
// Dependencies: 002_expedition_system.cypher

// ============================================================================
// ENHANCED CONSTRAINTS FOR DATA INTEGRITY
// ============================================================================

// Node existence constraints - ensure required properties exist
CREATE CONSTRAINT expedition_required_props IF NOT EXISTS 
FOR (e:Expedition) REQUIRE (e.id, e.starshipId, e.title, e.status, e.createdAt, e.createdBy) IS NOT NULL;

CREATE CONSTRAINT expedition_task_required_props IF NOT EXISTS 
FOR (t:ExpeditionTask) REQUIRE (t.id, t.expeditionId, t.title, t.status, t.createdAt) IS NOT NULL;

CREATE CONSTRAINT expedition_message_required_props IF NOT EXISTS 
FOR (m:ExpeditionMessage) REQUIRE (m.id, m.expeditionId, m.role, m.content, m.timestamp) IS NOT NULL;

CREATE CONSTRAINT expedition_result_required_props IF NOT EXISTS 
FOR (r:ExpeditionResult) REQUIRE (r.id, r.expeditionId, r.title, r.content, r.resultType, r.format, r.createdAt, r.createdBy) IS NOT NULL;

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
CREATE CONSTRAINT expedition_status_values IF NOT EXISTS 
FOR (e:Expedition) REQUIRE e.status IN ['draft', 'planning', 'in-progress', 'review', 'completed', 'failed', 'cancelled'];

CREATE CONSTRAINT expedition_priority_values IF NOT EXISTS 
FOR (e:Expedition) REQUIRE e.priority IN ['low', 'medium', 'high', 'urgent'];

CREATE CONSTRAINT task_status_values IF NOT EXISTS 
FOR (t:ExpeditionTask) REQUIRE t.status IN ['pending', 'assigned', 'in-progress', 'blocked', 'review', 'completed', 'failed'];

CREATE CONSTRAINT task_priority_values IF NOT EXISTS 
FOR (t:ExpeditionTask) REQUIRE t.priority IN ['low', 'medium', 'high', 'critical'];

CREATE CONSTRAINT message_role_values IF NOT EXISTS 
FOR (m:ExpeditionMessage) REQUIRE m.role IN ['user', 'first-officer', 'agent', 'system'];

CREATE CONSTRAINT message_type_values IF NOT EXISTS 
FOR (m:ExpeditionMessage) REQUIRE m.messageType IN ['coordination', 'task-work', 'user-input', 'status-update', 'result', 'question', 'notification'];

CREATE CONSTRAINT result_type_values IF NOT EXISTS 
FOR (r:ExpeditionResult) REQUIRE r.resultType IN ['final-report', 'task-output', 'analysis', 'code', 'document', 'design', 'data', 'recommendation'];

CREATE CONSTRAINT result_format_values IF NOT EXISTS 
FOR (r:ExpeditionResult) REQUIRE r.format IN ['text', 'markdown', 'json', 'code', 'html', 'pdf', 'image', 'video', 'audio', 'archive'];

CREATE CONSTRAINT starship_class_values IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.class IN ['scout', 'cruiser'];

CREATE CONSTRAINT starship_status_values IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.status IN ['active', 'inactive'];

// ============================================================================
// COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
// ============================================================================

// Expedition composite indexes
CREATE INDEX expedition_starship_status_composite IF NOT EXISTS 
FOR (e:Expedition) ON (e.starshipId, e.status);

CREATE INDEX expedition_starship_priority_composite IF NOT EXISTS 
FOR (e:Expedition) ON (e.starshipId, e.priority);

CREATE INDEX expedition_starship_created_composite IF NOT EXISTS 
FOR (e:Expedition) ON (e.starshipId, e.createdAt);

CREATE INDEX expedition_status_priority_composite IF NOT EXISTS 
FOR (e:Expedition) ON (e.status, e.priority);

CREATE INDEX expedition_status_created_composite IF NOT EXISTS 
FOR (e:Expedition) ON (e.status, e.createdAt);

CREATE INDEX expedition_created_by_status_composite IF NOT EXISTS 
FOR (e:Expedition) ON (e.createdBy, e.status);

// Task composite indexes
CREATE INDEX task_expedition_status_composite IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.expeditionId, t.status);

CREATE INDEX task_expedition_priority_composite IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.expeditionId, t.priority);

CREATE INDEX task_expedition_agent_composite IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.expeditionId, t.assignedAgentId);

CREATE INDEX task_agent_status_composite IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.assignedAgentId, t.status);

CREATE INDEX task_status_priority_composite IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.status, t.priority);

// Message composite indexes
CREATE INDEX message_expedition_timestamp_composite IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.expeditionId, m.timestamp);

CREATE INDEX message_expedition_role_composite IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.expeditionId, m.role);

CREATE INDEX message_expedition_type_composite IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.expeditionId, m.messageType);

CREATE INDEX message_thread_timestamp_composite IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.threadId, m.timestamp);

CREATE INDEX message_agent_timestamp_composite IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.agentId, m.timestamp);

// Result composite indexes
CREATE INDEX result_expedition_type_composite IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.expeditionId, r.resultType);

CREATE INDEX result_expedition_created_composite IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.expeditionId, r.createdAt);

CREATE INDEX result_creator_type_composite IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.createdBy, r.resultType);

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

CREATE RANGE INDEX expedition_created_at_range IF NOT EXISTS 
FOR (e:Expedition) ON (e.createdAt);

CREATE RANGE INDEX expedition_updated_at_range IF NOT EXISTS 
FOR (e:Expedition) ON (e.updatedAt);

CREATE RANGE INDEX task_created_at_range IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.createdAt);

CREATE RANGE INDEX task_updated_at_range IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.updatedAt);

CREATE RANGE INDEX message_timestamp_range IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.timestamp);

CREATE RANGE INDEX result_created_at_range IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.createdAt);

CREATE RANGE INDEX starship_created_at_range IF NOT EXISTS 
FOR (s:Starship) ON (s.createdAt);

CREATE RANGE INDEX agent_created_at_range IF NOT EXISTS 
FOR (a:Agent) ON (a.createdAt);

// ============================================================================
// ARRAY INDEXES FOR MULTI-VALUE PROPERTIES
// ============================================================================

CREATE INDEX expedition_tags_array IF NOT EXISTS 
FOR (e:Expedition) ON (e.tags);

CREATE INDEX expedition_assigned_agents_array IF NOT EXISTS 
FOR (e:Expedition) ON (e.assignedAgents);

CREATE INDEX task_required_skills_array IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.requiredSkills);

CREATE INDEX task_dependencies_array IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.dependencies);

CREATE INDEX agent_tags_array IF NOT EXISTS 
FOR (a:Agent) ON (a.tags);

CREATE INDEX agent_allowed_starship_classes_array IF NOT EXISTS 
FOR (a:Agent) ON (a.allowedStarshipClasses);

// ============================================================================
// RELATIONSHIP CONSTRAINTS
// ============================================================================

// Ensure expedition belongs to exactly one starship
CREATE CONSTRAINT expedition_single_starship IF NOT EXISTS 
FOR ()-[r:HAS_EXPEDITION]-() REQUIRE r IS NOT NULL;

// Ensure task belongs to exactly one expedition
CREATE CONSTRAINT task_single_expedition IF NOT EXISTS 
FOR ()-[r:HAS_TASK]-() REQUIRE r IS NOT NULL;

// Ensure message belongs to exactly one expedition
CREATE CONSTRAINT message_single_expedition IF NOT EXISTS 
FOR ()-[r:HAS_MESSAGE]-() REQUIRE r IS NOT NULL;

// Ensure result belongs to exactly one expedition
CREATE CONSTRAINT result_single_expedition IF NOT EXISTS 
FOR ()-[r:HAS_RESULT]-() REQUIRE r IS NOT NULL;

// ============================================================================
// PERFORMANCE MONITORING SETUP
// ============================================================================

// Create performance monitoring node
CREATE (pm:PerformanceMonitor {
  id: 'expedition_system_monitor',
  name: 'Expedition System Performance Monitor',
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
WHERE name CONTAINS 'expedition' OR name CONTAINS 'starship' OR name CONTAINS 'agent' OR name CONTAINS 'task' OR name CONTAINS 'message' OR name CONTAINS 'result'
RETURN count(*) as totalConstraints;

// Count all indexes
SHOW INDEXES 
YIELD name, type, entityType, labelsOrTypes, properties, options
WHERE name CONTAINS 'expedition' OR name CONTAINS 'starship' OR name CONTAINS 'agent' OR name CONTAINS 'task' OR name CONTAINS 'message' OR name CONTAINS 'result'
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
  dependencies: ['002_expedition_system']
})
RETURN m.id as migrationId, m.appliedAt as appliedAt;