// Rollback Migration: 006_rollback_expedition_seed_data.cypher
// Description: Rollback expedition system seed data
// Date: 2025-01-21
// Author: System
// Rollback for: 006_expedition_seed_data

// ============================================================================
// ROLLBACK SEED DATA
// ============================================================================

// Remove all seed data relationships first
MATCH ()-[r:ASSIGNED_TO]->(:ExpeditionTask)
WHERE r.assignedAt IS NOT NULL
DELETE r;

MATCH ()-[r:DEPENDS_ON]->(:ExpeditionTask)
WHERE r.createdAt IS NOT NULL
DELETE r;

MATCH ()-[r:HAS_TASK]->(:ExpeditionTask)
WHERE r.createdAt IS NOT NULL
DELETE r;

MATCH ()-[r:ASSIGNED_TO]->(:Expedition)
WHERE r.assignedAt IS NOT NULL AND r.role IS NOT NULL
DELETE r;

MATCH ()-[r:HAS_EXPEDITION]->(:Expedition)
WHERE r.createdAt IS NOT NULL
DELETE r;

MATCH ()-[r:DEPLOYED_ON]->(:Starship)
WHERE r.deployedAt IS NOT NULL AND r.isActive IS NOT NULL
DELETE r;

MATCH ()-[r:OWNS]->(:Starship)
WHERE r.ownedSince IS NOT NULL
DELETE r;

// Remove seed data nodes
MATCH (t:ExpeditionTask)
WHERE t.id IN [
  'task-seed-001', 'task-seed-002', 'task-seed-003', 'task-seed-004',
  'task-seed-005', 'task-seed-006', 'task-seed-007'
]
DETACH DELETE t;

MATCH (e:Expedition)
WHERE e.id IN [
  'expedition-seed-001', 'expedition-seed-002', 'expedition-seed-003', 'expedition-seed-004'
]
DETACH DELETE e;

MATCH (a:Agent)
WHERE a.id IN ['agent-seed-001', 'agent-seed-002', 'agent-seed-003']
DETACH DELETE a;

MATCH (s:Starship)
WHERE s.id IN ['starship-seed-001', 'starship-seed-002']
DETACH DELETE s;

MATCH (u:User)
WHERE u.id IN ['user-seed-001', 'user-seed-002']
DETACH DELETE u;

// Remove seed data configuration
MATCH (config:SeedDataConfig {id: 'expedition_seed_config'})
DETACH DELETE config;

// Remove migration record
MATCH (m:Migration {id: '006_expedition_seed_data'})
DETACH DELETE m;

// ============================================================================
// VERIFICATION OF ROLLBACK
// ============================================================================

// Verify seed data was removed
MATCH (e:Expedition)
WHERE e.id STARTS WITH 'expedition-seed-'
RETURN count(e) as remainingExpeditions;

MATCH (t:ExpeditionTask)
WHERE t.id STARTS WITH 'task-seed-'
RETURN count(t) as remainingTasks;

MATCH (a:Agent)
WHERE a.id STARTS WITH 'agent-seed-'
RETURN count(a) as remainingAgents;

MATCH (s:Starship)
WHERE s.id STARTS WITH 'starship-seed-'
RETURN count(s) as remainingStarships;

MATCH (u:User)
WHERE u.id STARTS WITH 'user-seed-'
RETURN count(u) as remainingUsers;

MATCH (config:SeedDataConfig)
WHERE config.id = 'expedition_seed_config'
RETURN count(config) as remainingConfig;

// Log rollback completion
CREATE (rollback:MigrationRollback {
  id: '006_rollback_expedition_seed_data',
  originalMigration: '006_expedition_seed_data',
  description: 'Rollback of expedition system seed data',
  rolledBackAt: datetime().epochMillis,
  rolledBackBy: 'system',
  itemsRemoved: [
    'seed_expeditions',
    'seed_tasks',
    'seed_agents',
    'seed_starships',
    'seed_users',
    'seed_relationships',
    'seed_config'
  ]
})
RETURN rollback.id as rollbackId, rollback.rolledBackAt as rolledBackAt, rollback.itemsRemoved as itemsRemoved;