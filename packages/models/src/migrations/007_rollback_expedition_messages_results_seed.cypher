// Rollback Migration: 007_rollback_expedition_messages_results_seed.cypher
// Description: Rollback expedition messages and results seed data
// Date: 2025-01-21
// Author: System
// Rollback for: 007_expedition_messages_results_seed

// ============================================================================
// ROLLBACK SEED DATA RELATIONSHIPS
// ============================================================================

// Remove result creator relationships
MATCH ()-[r:CREATED_RESULT]->(:ExpeditionResult)
WHERE r.createdAt IS NOT NULL
DELETE r;

// Remove expedition result relationships
MATCH ()-[r:HAS_RESULT]->(:ExpeditionResult)
WHERE r.createdAt IS NOT NULL
DELETE r;

// Remove agent message relationships
MATCH ()-[r:SENT_MESSAGE]->(:ExpeditionMessage)
WHERE r.timestamp IS NOT NULL
DELETE r;

// Remove message threading relationships
MATCH ()-[r:REPLIES_TO]->(:ExpeditionMessage)
WHERE r.timestamp IS NOT NULL
DELETE r;

// Remove expedition message relationships
MATCH ()-[r:HAS_MESSAGE]->(:ExpeditionMessage)
WHERE r.timestamp IS NOT NULL
DELETE r;

// ============================================================================
// ROLLBACK SEED DATA NODES
// ============================================================================

// Remove seed results
MATCH (r:ExpeditionResult)
WHERE r.id IN [
  'result-seed-001', 'result-seed-002', 'result-seed-003', 'result-seed-004'
]
DETACH DELETE r;

// Remove seed messages
MATCH (m:ExpeditionMessage)
WHERE m.id IN [
  'message-seed-001', 'message-seed-002', 'message-seed-003', 'message-seed-004',
  'message-seed-005', 'message-seed-006', 'message-seed-007', 'message-seed-008',
  'message-seed-009', 'message-seed-010', 'message-seed-011', 'message-seed-012',
  'message-seed-013', 'message-seed-014', 'message-seed-015', 'message-seed-016',
  'message-seed-017'
]
DETACH DELETE m;

// Remove migration record
MATCH (m:Migration {id: '007_expedition_messages_results_seed'})
DETACH DELETE m;

// ============================================================================
// VERIFICATION OF ROLLBACK
// ============================================================================

// Verify seed messages were removed
MATCH (m:ExpeditionMessage)
WHERE m.id STARTS WITH 'message-seed-'
RETURN count(m) as remainingMessages;

// Verify seed results were removed
MATCH (r:ExpeditionResult)
WHERE r.id STARTS WITH 'result-seed-'
RETURN count(r) as remainingResults;

// Verify relationships were cleaned up
MATCH ()-[r:HAS_MESSAGE]->(:ExpeditionMessage)
WHERE r.timestamp IS NOT NULL
RETURN count(r) as remainingMessageRelationships;

MATCH ()-[r:HAS_RESULT]->(:ExpeditionResult)
WHERE r.createdAt IS NOT NULL
RETURN count(r) as remainingResultRelationships;

MATCH ()-[r:SENT_MESSAGE]->(:ExpeditionMessage)
WHERE r.timestamp IS NOT NULL
RETURN count(r) as remainingSentMessageRelationships;

MATCH ()-[r:CREATED_RESULT]->(:ExpeditionResult)
WHERE r.createdAt IS NOT NULL
RETURN count(r) as remainingCreatedResultRelationships;

MATCH ()-[r:REPLIES_TO]->(:ExpeditionMessage)
WHERE r.timestamp IS NOT NULL
RETURN count(r) as remainingReplyRelationships;

// Log rollback completion
CREATE (rollback:MigrationRollback {
  id: '007_rollback_expedition_messages_results_seed',
  originalMigration: '007_expedition_messages_results_seed',
  description: 'Rollback of expedition messages and results seed data',
  rolledBackAt: datetime().epochMillis,
  rolledBackBy: 'system',
  itemsRemoved: [
    'seed_messages',
    'seed_results',
    'message_relationships',
    'result_relationships',
    'threading_relationships',
    'creator_relationships'
  ]
})
RETURN rollback.id as rollbackId, rollback.rolledBackAt as rolledBackAt, rollback.itemsRemoved as itemsRemoved;