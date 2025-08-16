// Migration: Create Parameter Pattern Schema for Smart Parameter Adapter
// Version: 004
// Date: 2024-01-15
// Description: Creates indexes and constraints for parameter pattern storage

// Create unique constraint to prevent duplicate patterns
CREATE CONSTRAINT pattern_unique_toolhash IF NOT EXISTS FOR (p:ParameterPattern) REQUIRE (p.toolId, p.inputHash) IS UNIQUE;

// Create indexes for fast pattern lookups
CREATE INDEX pattern_success IF NOT EXISTS FOR (p:ParameterPattern) ON (p.successCount);
CREATE INDEX pattern_lastused IF NOT EXISTS FOR (p:ParameterPattern) ON (p.lastUsed);

// Create indexes for pattern failures (for debugging and learning)
CREATE INDEX failure_lookup IF NOT EXISTS FOR (f:PatternFailure) ON (f.toolId, f.inputHash);
CREATE INDEX failure_lastseen IF NOT EXISTS FOR (f:PatternFailure) ON (f.lastSeen);

// Create constraint to ensure unique pattern IDs
CREATE CONSTRAINT pattern_unique_id IF NOT EXISTS FOR (p:ParameterPattern) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT failure_unique_id IF NOT EXISTS FOR (f:PatternFailure) REQUIRE f.id IS UNIQUE;

// Sample data structure for reference (not executed)
// (:ParameterPattern {
//   id: 'uuid',
//   toolId: 'notion_API-post-page',
//   inputHash: 'sha256_hash_16_chars',
//   inputStructure: '{"properties":{"title":"string"}}',
//   transformation: '{"properties":{"title":[{"type":"text","text":{"content":"..."}}]}}',
//   successCount: 5,
//   createdAt: timestamp(),
//   lastUsed: timestamp()
// })

// (:PatternFailure {
//   id: 'uuid',
//   toolId: 'notion_API-post-page',
//   inputHash: 'sha256_hash_16_chars',
//   errorMessage: 'Invalid parameter structure',
//   failureCount: 2,
//   firstSeen: timestamp(),
//   lastSeen: timestamp()
// })