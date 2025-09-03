// Migration 000: Complete Database Schema
// Description: Essential schema for starships.ai entities
// Author: System

// ============================================================================
// ESSENTIAL CONSTRAINTS
// ============================================================================

// User constraints
CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE;

// Starship constraints
CREATE CONSTRAINT starship_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS UNIQUE;
CREATE CONSTRAINT starship_subscription_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.subscriptionId IS UNIQUE;

// Agent constraints
CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE;

// Agent Template constraints
CREATE CONSTRAINT agent_template_id_unique IF NOT EXISTS FOR (at:AgentTemplate) REQUIRE at.id IS UNIQUE;

// Mission constraints
CREATE CONSTRAINT mission_id_unique IF NOT EXISTS FOR (m:MissionModel) REQUIRE m.id IS UNIQUE;

// Mission Message constraints
CREATE CONSTRAINT mission_message_id_unique IF NOT EXISTS FOR (mm:MissionMessageModel) REQUIRE mm.id IS UNIQUE;

// Mission Clarity constraints
CREATE CONSTRAINT mission_clarity_id_unique IF NOT EXISTS FOR (mc:MissionClarity) REQUIRE mc.id IS UNIQUE;

// Workflow constraints
CREATE CONSTRAINT workflow_id_unique IF NOT EXISTS FOR (w:Workflow) REQUIRE w.id IS UNIQUE;

// Blueprint constraints
CREATE CONSTRAINT blueprint_id_unique IF NOT EXISTS FOR (b:Blueprint) REQUIRE b.id IS UNIQUE;

// Node constraints
CREATE CONSTRAINT node_id_unique IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE;

// Edge constraints
CREATE CONSTRAINT edge_id_unique IF NOT EXISTS FOR (e:Edge) REQUIRE e.id IS UNIQUE;

// Memory constraints
CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (mem:Memory) REQUIRE mem.id IS UNIQUE;

// Message constraints
CREATE CONSTRAINT message_id_unique IF NOT EXISTS FOR (msg:Message) REQUIRE msg.id IS UNIQUE;

// Session Model constraints
CREATE CONSTRAINT session_model_id_unique IF NOT EXISTS FOR (cs:SessionModel) REQUIRE cs.id IS UNIQUE;

// Execution constraints
CREATE CONSTRAINT execution_id_unique IF NOT EXISTS FOR (ex:Execution) REQUIRE ex.id IS UNIQUE;

// Native Tool API Key constraints
CREATE CONSTRAINT native_tool_api_key_unique IF NOT EXISTS FOR (k:NativeToolApiKey) REQUIRE (k.starshipId, k.toolName) IS UNIQUE;

// Workflow Runtime State constraints
CREATE CONSTRAINT workflow_runtime_state_id_unique IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) REQUIRE wrs.id IS UNIQUE;

// Stripe event constraints
CREATE CONSTRAINT stripe_event_id_unique IF NOT EXISTS FOR (se:StripeEvent) REQUIRE se.eventId IS UNIQUE;

// Waitlist constraints
CREATE CONSTRAINT waitlist_email_unique IF NOT EXISTS FOR (w:Waitlist) REQUIRE w.email IS UNIQUE;

// ============================================================================
// CRITICAL INDEXES
// ============================================================================

// Core entity lookups
CREATE INDEX starship_owner_id IF NOT EXISTS FOR (s:Starship) ON (s.ownerId);
CREATE INDEX agent_starship_id IF NOT EXISTS FOR (a:Agent) ON (a.starshipId);
CREATE INDEX mission_starship_id IF NOT EXISTS FOR (m:MissionModel) ON (m.starshipId);
CREATE INDEX message_starship_id IF NOT EXISTS FOR (msg:Message) ON (msg.starshipId);

// Status and filtering
CREATE INDEX starship_status IF NOT EXISTS FOR (s:Starship) ON (s.status);
CREATE INDEX mission_status IF NOT EXISTS FOR (m:MissionModel) ON (m.status);
CREATE INDEX mission_phase IF NOT EXISTS FOR (m:MissionModel) ON (m.phase);
CREATE INDEX workflow_execution_mode IF NOT EXISTS FOR (w:Workflow) ON (w.executionMode);
CREATE INDEX execution_status IF NOT EXISTS FOR (ex:Execution) ON (ex.status);

// Timestamps for sorting
CREATE RANGE INDEX starship_created_at IF NOT EXISTS FOR (s:Starship) ON (s.createdAt);
CREATE RANGE INDEX mission_created_at IF NOT EXISTS FOR (m:MissionModel) ON (m.createdAt);
CREATE RANGE INDEX message_created_at IF NOT EXISTS FOR (msg:Message) ON (msg.createdAt);

// ============================================================================
// FULL-TEXT SEARCH INDEXES (Neo4j 5.x syntax)
// ============================================================================

CREATE FULLTEXT INDEX agentSearch IF NOT EXISTS FOR (n:Agent) ON EACH [n.name, n.description, n.systemPrompt, n.tags];
CREATE FULLTEXT INDEX missionSearch IF NOT EXISTS FOR (n:Mission) ON EACH [n.name, n.description];
CREATE FULLTEXT INDEX messageSearch IF NOT EXISTS FOR (n:Message) ON EACH [n.content];
CREATE FULLTEXT INDEX workflowSearch IF NOT EXISTS FOR (n:Workflow) ON EACH [n.name, n.description, n.category, n.tags];
CREATE FULLTEXT INDEX userSearch IF NOT EXISTS FOR (n:User) ON EACH [n.username, n.displayName, n.email];
CREATE FULLTEXT INDEX starshipSearch IF NOT EXISTS FOR (n:Starship) ON EACH [n.name, n.description];

// ============================================================================
// MIGRATION RECORD
// ============================================================================

CREATE (m:Migration {
  id: '000_complete_schema',
  name: 'Complete Database Schema',
  description: 'Essential schema with all starships.ai entities',
  version: '2.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  features: [
    'user_management',
    'starship_system',
    'agent_deployment',
    'agent_templates',
    'mission_system',
    'workflow_dsl',
    'blueprint_management',
    'memory_management',
    'message_system',
    'execution_tracking',
    'full_text_search'
  ]
});

// Verification
MATCH (n) 
WITH labels(n)[0] as nodeType, count(n) as count
WHERE nodeType IS NOT NULL
RETURN nodeType, count
ORDER BY nodeType;