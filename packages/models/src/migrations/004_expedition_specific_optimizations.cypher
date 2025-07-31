// Migration: 004_expedition_specific_optimizations.cypher
// Description: Expedition-specific performance optimizations and advanced indexes
// Date: 2025-01-20
// Author: System
// Dependencies: 003_database_optimizations.cypher

// ============================================================================
// EXPEDITION WORKFLOW OPTIMIZATIONS
// ============================================================================

// Create specialized indexes for expedition workflow queries
CREATE INDEX expedition_workflow_state_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.workflowState);

CREATE INDEX expedition_active_status_index IF NOT EXISTS 
FOR (e:Expedition) ON (e.status) 
WHERE e.status IN ['planning', 'in-progress', 'review'];

// Composite index for active expeditions by starship
CREATE INDEX expedition_starship_active_composite IF NOT EXISTS 
FOR (e:Expedition) ON (e.starshipId, e.status) 
WHERE e.status IN ['planning', 'in-progress', 'review'];

// Index for expedition capacity management
CREATE INDEX starship_active_expeditions_index IF NOT EXISTS 
FOR (s:Starship) ON (s.activeExpeditions);

CREATE INDEX starship_max_expeditions_index IF NOT EXISTS 
FOR (s:Starship) ON (s.maxActiveExpeditions);

// ============================================================================
// AGENT ASSIGNMENT OPTIMIZATIONS
// ============================================================================

// Specialized indexes for agent availability queries
CREATE INDEX agent_availability_composite IF NOT EXISTS 
FOR (a:Agent) ON (a.starshipId, a.category);

CREATE INDEX agent_skills_availability IF NOT EXISTS 
FOR (a:Agent) ON (a.tags) 
WHERE a.starshipId IS NOT NULL;

// Index for agent workload calculations
CREATE INDEX task_agent_active_status IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.assignedAgentId, t.status) 
WHERE t.status IN ['assigned', 'in-progress', 'blocked', 'review'];

// ============================================================================
// MESSAGE THREADING OPTIMIZATIONS
// ============================================================================

// Specialized indexes for message threading and conversation flow
CREATE INDEX message_parent_child_index IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.parentMessageId);

CREATE INDEX message_thread_role_composite IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.threadId, m.role, m.timestamp);

// Index for real-time message queries
CREATE INDEX message_expedition_recent IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.expeditionId, m.timestamp) 
WHERE m.timestamp > datetime().epochMillis - 86400000; // Last 24 hours

// ============================================================================
// TASK DEPENDENCY OPTIMIZATIONS
// ============================================================================

// Specialized indexes for task dependency resolution
CREATE INDEX task_dependency_status IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.dependencies, t.status);

CREATE INDEX task_ready_for_execution IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.expeditionId, t.status) 
WHERE t.status = 'pending';

// Index for critical path analysis
CREATE INDEX task_priority_dependencies IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.priority, t.dependencies);

// ============================================================================
// RESULT QUALITY OPTIMIZATIONS
// ============================================================================

// Specialized indexes for result quality assessment
CREATE INDEX result_quality_overall IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.quality.overall);

CREATE INDEX result_quality_assessment IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.quality.assessedBy, r.quality.overall);

CREATE INDEX result_needs_assessment IF NOT EXISTS 
FOR (r:ExpeditionResult) ON (r.expeditionId) 
WHERE r.quality.overall = 0 OR r.quality.assessedBy = 'system';

// ============================================================================
// PERFORMANCE STATISTICS OPTIMIZATIONS
// ============================================================================

// Indexes for expedition statistics calculations
CREATE INDEX expedition_duration_stats IF NOT EXISTS 
FOR (e:Expedition) ON (e.actualDuration) 
WHERE e.actualDuration IS NOT NULL;

CREATE INDEX expedition_success_rate_stats IF NOT EXISTS 
FOR (e:Expedition) ON (e.starshipId, e.status, e.createdAt) 
WHERE e.status IN ['completed', 'failed', 'cancelled'];

// Task performance statistics
CREATE INDEX task_effort_stats IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.actualEffort) 
WHERE t.actualEffort IS NOT NULL;

CREATE INDEX task_completion_stats IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.assignedAgentId, t.status, t.createdAt) 
WHERE t.status IN ['completed', 'failed'];

// ============================================================================
// SEARCH AND FILTERING OPTIMIZATIONS
// ============================================================================

// Enhanced full-text search with better configuration
CALL db.index.fulltext.createNodeIndex(
  'expeditionAdvancedSearch',
  ['Expedition'],
  ['title', 'description', 'objective', 'tags'],
  {
    analyzer: 'standard-no-stop-words',
    eventually_consistent: 'true',
    similarity: 'BM25'
  }
) YIELD name, labels, properties, options
RETURN name, labels, properties, options;

// Task search with skills matching
CALL db.index.fulltext.createNodeIndex(
  'taskSkillsSearch',
  ['ExpeditionTask'],
  ['title', 'description', 'requiredSkills', 'deliverable'],
  {
    analyzer: 'keyword',
    eventually_consistent: 'true'
  }
) YIELD name, labels, properties, options
RETURN name, labels, properties, options;

// Agent capabilities search
CALL db.index.fulltext.createNodeIndex(
  'agentCapabilitiesSearch',
  ['Agent'],
  ['name', 'description', 'tags', 'category'],
  {
    analyzer: 'standard-no-stop-words',
    eventually_consistent: 'true'
  }
) YIELD name, labels, properties, options
RETURN name, labels, properties, options;

// ============================================================================
// RELATIONSHIP PERFORMANCE OPTIMIZATIONS
// ============================================================================

// Index relationship properties for better join performance
CREATE INDEX has_expedition_created_at IF NOT EXISTS 
FOR ()-[r:HAS_EXPEDITION]-() ON (r.createdAt);

CREATE INDEX has_task_created_at IF NOT EXISTS 
FOR ()-[r:HAS_TASK]-() ON (r.createdAt);

CREATE INDEX has_message_timestamp IF NOT EXISTS 
FOR ()-[r:HAS_MESSAGE]-() ON (r.timestamp);

CREATE INDEX assigned_to_assigned_at IF NOT EXISTS 
FOR ()-[r:ASSIGNED_TO]-() ON (r.assignedAt);

CREATE INDEX deployed_on_active IF NOT EXISTS 
FOR ()-[r:DEPLOYED_ON]-() ON (r.isActive) 
WHERE r.isActive = true;

// ============================================================================
// CACHING HINTS AND QUERY OPTIMIZATION
// ============================================================================

// Create materialized views for common aggregations (using nodes as cache)
CREATE (cache:QueryCache {
  id: 'expedition_stats_cache',
  type: 'expedition_statistics',
  lastUpdated: datetime().epochMillis,
  ttl: 300000, // 5 minutes
  data: {}
});

CREATE (cache:QueryCache {
  id: 'agent_availability_cache',
  type: 'agent_availability',
  lastUpdated: datetime().epochMillis,
  ttl: 60000, // 1 minute
  data: {}
});

CREATE (cache:QueryCache {
  id: 'starship_capacity_cache',
  type: 'starship_capacity',
  lastUpdated: datetime().epochMillis,
  ttl: 120000, // 2 minutes
  data: {}
});

// ============================================================================
// QUERY PERFORMANCE MONITORING
// ============================================================================

// Create query performance tracking
CREATE (qp:QueryPerformance {
  id: 'expedition_query_monitor',
  name: 'Expedition Query Performance Monitor',
  createdAt: datetime().epochMillis,
  slowQueries: [],
  queryStats: {
    expeditionList: { count: 0, avgTime: 0, maxTime: 0 },
    expeditionDetails: { count: 0, avgTime: 0, maxTime: 0 },
    taskAssignment: { count: 0, avgTime: 0, maxTime: 0 },
    agentAvailability: { count: 0, avgTime: 0, maxTime: 0 },
    messageHistory: { count: 0, avgTime: 0, maxTime: 0 },
    resultSearch: { count: 0, avgTime: 0, maxTime: 0 }
  }
});

// ============================================================================
// SPECIALIZED CONSTRAINTS FOR EXPEDITION LOGIC
// ============================================================================

// Ensure expedition capacity limits
CREATE CONSTRAINT expedition_capacity_limit IF NOT EXISTS 
FOR (s:Starship) REQUIRE s.activeExpeditions <= s.maxActiveExpeditions;

// Ensure task dependencies are valid (no circular dependencies)
// Note: This would require a custom procedure in production
// CREATE CONSTRAINT task_no_circular_deps IF NOT EXISTS 
// FOR (t:ExpeditionTask) REQUIRE NOT EXISTS((t)-[:DEPENDS_ON*]->(t));

// Ensure message threading consistency
CREATE CONSTRAINT message_thread_consistency IF NOT EXISTS 
FOR (m:ExpeditionMessage) REQUIRE (m.threadId IS NULL) = (m.parentMessageId IS NULL);

// ============================================================================
// BATCH OPERATION OPTIMIZATIONS
// ============================================================================

// Create indexes for bulk operations
CREATE INDEX expedition_bulk_status_update IF NOT EXISTS 
FOR (e:Expedition) ON (e.id, e.status);

CREATE INDEX task_bulk_assignment IF NOT EXISTS 
FOR (t:ExpeditionTask) ON (t.id, t.assignedAgentId);

CREATE INDEX message_bulk_insert IF NOT EXISTS 
FOR (m:ExpeditionMessage) ON (m.expeditionId, m.id);

// ============================================================================
// VERIFICATION AND MONITORING
// ============================================================================

// Create monitoring queries for index usage
CREATE (im:IndexMonitor {
  id: 'expedition_index_monitor',
  name: 'Expedition Index Usage Monitor',
  createdAt: datetime().epochMillis,
  indexUsage: {},
  recommendations: []
});

// ============================================================================
// MIGRATION COMPLETION
// ============================================================================

CREATE (m:Migration {
  id: '004_expedition_specific_optimizations',
  name: 'Expedition-Specific Performance Optimizations',
  description: 'Advanced indexes, caching, query hints, and expedition-specific constraints',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  dependencies: ['003_database_optimizations'],
  optimizations: [
    'workflow_state_indexes',
    'agent_assignment_optimization',
    'message_threading_optimization',
    'task_dependency_optimization',
    'result_quality_optimization',
    'performance_statistics_optimization',
    'advanced_search_indexes',
    'relationship_performance_optimization',
    'query_caching',
    'batch_operation_optimization'
  ]
})
RETURN m.id as migrationId, m.appliedAt as appliedAt;