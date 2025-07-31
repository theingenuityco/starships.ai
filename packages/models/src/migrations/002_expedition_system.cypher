// Migration: 002_expedition_system.cypher
// Description: Create expedition orchestration system schema
// Date: 2025-01-19
// Author: System

// ============================================================================
// EXPEDITION SYSTEM CONSTRAINTS
// ============================================================================

// Create unique constraints for expedition entities
CREATE CONSTRAINT expedition_id_unique IF NOT EXISTS 
FOR (e:Expedition) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT expedition_task_id_unique IF NOT EXISTS 
FOR (t:ExpeditionTask) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT expedition_message_id_unique IF NOT EXISTS 
FOR (m:ExpeditionMessage) REQUIRE m.id IS UNIQUE;

CREATE CONSTRAINT expedition_result_id_unique IF NOT EXISTS 
FOR (r:ExpeditionResult) REQUIRE r.id IS UNIQUE;

// ============================================================================
// EXPEDITION SYSTEM INDEXES
// ============================================================================

// Expedition indexes for performance
CREATE INDEX expedition_starship_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.starshipId);

CREATE INDEX expedition_status_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.status);

CREATE INDEX expedition_priority_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.priority);

CREATE INDEX expedition_created_by_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.createdBy);

CREATE INDEX expedition_created_at_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.createdAt);

CREATE INDEX expedition_updated_at_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.updatedAt);

// Task indexes for performance
CREATE INDEX expedition_task_expedition_index IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.expeditionId);

CREATE INDEX expedition_task_status_index IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.status);

CREATE INDEX expedition_task_priority_index IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.priority);

CREATE INDEX expedition_task_assigned_agent_index IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.assignedAgentId);

CREATE INDEX expedition_task_created_at_index IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.createdAt);

// Message indexes for performance
CREATE INDEX expedition_message_expedition_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.expeditionId);

CREATE INDEX expedition_message_role_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.role);

CREATE INDEX expedition_message_type_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.messageType);

CREATE INDEX expedition_message_timestamp_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.timestamp);

CREATE INDEX expedition_message_agent_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.agentId);

CREATE INDEX expedition_message_user_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.userId);

CREATE INDEX expedition_message_thread_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.threadId);

// Result indexes for performance
CREATE INDEX expedition_result_expedition_index IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.expeditionId);

CREATE INDEX expedition_result_type_index IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.resultType);

CREATE INDEX expedition_result_format_index IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.format);

CREATE INDEX expedition_result_created_by_index IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.createdBy);

CREATE INDEX expedition_result_created_at_index IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.createdAt);

// ============================================================================
// FULL-TEXT SEARCH INDEXES
// ============================================================================

// Create full-text search index for expeditions
CALL db.index.fulltext.createNodeIndex(
  'expeditionSearch',
  ['Expedition'],
  ['title', 'description', 'objective'],
  {
    analyzer: 'standard-no-stop-words',
    eventually_consistent: 'true'
  }
) YIELD name, labels, properties, options
RETURN name, labels, properties, options;

// Create full-text search index for expedition tasks
CALL db.index.fulltext.createNodeIndex(
  'expeditionTaskSearch',
  ['ExpeditionTask'],
  ['title', 'description', 'deliverable'],
  {
    analyzer: 'standard-no-stop-words',
    eventually_consistent: 'true'
  }
) YIELD name, labels, properties, options
RETURN name, labels, properties, options;

// Create full-text search index for expedition messages
CALL db.index.fulltext.createNodeIndex(
  'expeditionMessageSearch',
  ['ExpeditionMessage'],
  ['content'],
  {
    analyzer: 'standard-no-stop-words',
    eventually_consistent: 'true'
  }
) YIELD name, labels, properties, options
RETURN name, labels, properties, options;

// Create full-text search index for expedition results
CALL db.index.fulltext.createNodeIndex(
  'expeditionResultSearch',
  ['ExpeditionResult'],
  ['title', 'description', 'content'],
  {
    analyzer: 'standard-no-stop-words',
    eventually_consistent: 'true'
  }
) YIELD name, labels, properties, options
RETURN name, labels, properties, options;

// ============================================================================
// SAMPLE DATA (Optional - for development/testing)
// ============================================================================

// Note: Sample data creation is commented out for production safety
// Uncomment the following sections if you want to create sample data

/*
// Create sample expedition for testing
MATCH (s:Starship) 
WHERE s.name CONTAINS 'Test' OR s.slug CONTAINS 'test'
WITH s LIMIT 1
CREATE (e:Expedition {
  id: 'expedition-sample-001',
  starshipId: s.id,
  title: 'Sample Research Expedition',
  description: 'A sample expedition to test the system functionality',
  objective: 'Validate expedition orchestration system',
  status: 'draft',
  priority: 'medium',
  assignedAgents: [],
  tags: ['sample', 'test', 'research'],
  createdAt: datetime().epochMillis,
  updatedAt: datetime().epochMillis,
  createdBy: 'system'
})
CREATE (s)-[:HAS_EXPEDITION {createdAt: datetime().epochMillis}]->(e)
RETURN e.id as expeditionId, s.name as starshipName;

// Create sample task for the expedition
MATCH (e:Expedition {id: 'expedition-sample-001'})
CREATE (t:ExpeditionTask {
  id: 'task-sample-001',
  expeditionId: e.id,
  title: 'Initial Analysis',
  description: 'Perform initial analysis of the expedition requirements',
  requiredSkills: ['analysis', 'research'],
  status: 'pending',
  priority: 'high',
  dependencies: [],
  deliverable: 'Analysis report in markdown format',
  createdAt: datetime().epochMillis,
  updatedAt: datetime().epochMillis
})
CREATE (e)-[:HAS_TASK {createdAt: datetime().epochMillis}]->(t)
RETURN t.id as taskId, e.title as expeditionTitle;
*/

// ============================================================================
// VERIFICATION QUERIES
// ============================================================================

// Verify constraints were created
SHOW CONSTRAINTS 
WHERE name CONTAINS 'expedition';

// Verify indexes were created
SHOW INDEXES 
WHERE name CONTAINS 'expedition';

// Verify full-text indexes were created
CALL db.index.fulltext.listAvailableAnalyzers() 
YIELD analyzer, description 
WHERE analyzer = 'standard-no-stop-words'
RETURN analyzer, description;

// ============================================================================
// MIGRATION COMPLETION
// ============================================================================

// Log migration completion
CREATE (m:Migration {
  id: '002_expedition_system',
  name: 'Expedition Orchestration System',
  description: 'Create expedition system schema with constraints, indexes, and full-text search',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system'
})
RETURN m.id as migrationId, m.appliedAt as appliedAt;