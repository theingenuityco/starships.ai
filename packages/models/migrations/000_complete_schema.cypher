// Migration 000: Complete Database Schema
// Description: Essential schema for starships.ai entities
// Author: System

// ============================================================================
// USER COLLECTION
// ============================================================================

// User constraints
CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE;

// ============================================================================
// STARSHIP COLLECTION
// ============================================================================

// Starship constraints
CREATE CONSTRAINT starship_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS UNIQUE;
CREATE CONSTRAINT starship_subscription_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.subscriptionId IS UNIQUE;

// Starship indexes
CREATE INDEX starship_owner_id IF NOT EXISTS FOR (s:Starship) ON (s.ownerId);
CREATE INDEX starship_status IF NOT EXISTS FOR (s:Starship) ON (s.status);
CREATE RANGE INDEX starship_created_at IF NOT EXISTS FOR (s:Starship) ON (s.createdAt);

// ============================================================================
// AGENT COLLECTION
// ============================================================================

// Agent constraints
CREATE CONSTRAINT unique_agent_id IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE;

// Agent relationship constraints
CREATE CONSTRAINT unique_agent_starship IF NOT EXISTS FOR ()-[r:DEPLOYED_ON]-() REQUIRE r.key IS UNIQUE;

// Tool-Agent relationship constraints
CREATE CONSTRAINT unique_agent_tool IF NOT EXISTS FOR ()-[r:USES_TOOL]-() REQUIRE r.key IS UNIQUE;

// Tool-Template relationship constraints
CREATE CONSTRAINT unique_tool_template IF NOT EXISTS FOR ()-[r:BASED_ON]-() REQUIRE r.key IS UNIQUE;

// ============================================================================
// AGENT TEMPLATE COLLECTION
// ============================================================================

// Agent Template constraints
CREATE CONSTRAINT unique_agent_template_id IF NOT EXISTS FOR (at:AgentTemplate) REQUIRE at.id IS UNIQUE;

// ============================================================================
// TOOL COLLECTION
// ============================================================================

// Tool constraints
CREATE CONSTRAINT tool_id_unique IF NOT EXISTS FOR (t:Tool) REQUIRE t.id IS UNIQUE;

// Tool indexes
CREATE INDEX tool_name IF NOT EXISTS FOR (t:Tool) ON (t.name);
CREATE INDEX tool_enabled IF NOT EXISTS FOR (t:Tool) ON (t.isEnabled);

// ============================================================================
// TOOL TEMPLATE COLLECTION
// ============================================================================

// Tool Template constraints
CREATE CONSTRAINT tool_template_id_unique IF NOT EXISTS FOR (tt:ToolTemplate) REQUIRE tt.id IS UNIQUE;
CREATE CONSTRAINT tool_template_slug_unique IF NOT EXISTS FOR (tt:ToolTemplate) REQUIRE tt.slug IS UNIQUE;

// Tool Template indexes
CREATE INDEX tool_template_category IF NOT EXISTS FOR (tt:ToolTemplate) ON (tt.category);
CREATE INDEX tool_template_usage_count IF NOT EXISTS FOR (tt:ToolTemplate) ON (tt.usageCount);

// ============================================================================
// WORKFLOW COLLECTION
// ============================================================================

// Workflow constraints
CREATE CONSTRAINT workflow_id_unique IF NOT EXISTS FOR (w:Workflow) REQUIRE w.id IS UNIQUE;

// Workflow indexes
CREATE INDEX workflow_execution_mode IF NOT EXISTS FOR (w:Workflow) ON (w.executionMode);

// ============================================================================
// BLUEPRINT COLLECTION
// ============================================================================

// Blueprint constraints
CREATE CONSTRAINT blueprint_id_unique IF NOT EXISTS FOR (b:Blueprint) REQUIRE b.id IS UNIQUE;

// ============================================================================
// NODE COLLECTION
// ============================================================================

// Node constraints
CREATE CONSTRAINT node_id_unique IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE;

// ============================================================================
// EDGE COLLECTION
// ============================================================================

// Edge constraints
CREATE CONSTRAINT edge_id_unique IF NOT EXISTS FOR (e:Edge) REQUIRE e.id IS UNIQUE;

// ============================================================================
// MEMORY COLLECTION
// ============================================================================

// Memory constraints
CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (mem:Memory) REQUIRE mem.id IS UNIQUE;

// ============================================================================
// MESSAGE COLLECTION
// ============================================================================

// Message constraints
CREATE CONSTRAINT message_id_unique IF NOT EXISTS FOR (msg:Message) REQUIRE msg.id IS UNIQUE;

// Message indexes
CREATE INDEX message_starship_id IF NOT EXISTS FOR (msg:Message) ON (msg.starshipId);
CREATE RANGE INDEX message_created_at IF NOT EXISTS FOR (msg:Message) ON (msg.createdAt);

// ============================================================================
// SESSION COLLECTION
// ============================================================================

// Session constraints
CREATE CONSTRAINT unique_conversation_id IF NOT EXISTS FOR (c:Conversation) REQUIRE c.id IS UNIQUE;

// Session relationship constraints
CREATE CONSTRAINT unique_starship_conversation IF NOT EXISTS FOR ()-[r:HAS_SESSION]-() REQUIRE r.key IS UNIQUE;

// Conversation relationship constraints
CREATE CONSTRAINT unique_conversation_agent IF NOT EXISTS FOR ()-[r:INVOLVES_AGENT]-() REQUIRE r.key IS UNIQUE;

// ============================================================================
// EXECUTION COLLECTION
// ============================================================================

// Execution constraints
CREATE CONSTRAINT execution_id_unique IF NOT EXISTS FOR (ex:Execution) REQUIRE ex.id IS UNIQUE;

// Execution indexes
CREATE INDEX execution_status IF NOT EXISTS FOR (ex:Execution) ON (ex.status);

// ============================================================================
// NATIVE TOOL API KEY COLLECTION
// ============================================================================

// Native Tool API Key constraints
CREATE CONSTRAINT native_tool_api_key_unique IF NOT EXISTS FOR (k:NativeToolApiKey) REQUIRE (k.starshipId, k.toolName) IS UNIQUE;

// ============================================================================
// WORKFLOW RUNTIME STATE COLLECTION
// ============================================================================

// Workflow Runtime State constraints
CREATE CONSTRAINT workflow_runtime_state_id_unique IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) REQUIRE wrs.id IS UNIQUE;

// ============================================================================
// STRIPE EVENT COLLECTION
// ============================================================================

// Stripe event constraints
CREATE CONSTRAINT stripe_event_id_unique IF NOT EXISTS FOR (se:StripeEvent) REQUIRE se.eventId IS UNIQUE;

// ============================================================================
// WAITLIST COLLECTION
// ============================================================================

// Waitlist constraints
CREATE CONSTRAINT waitlist_email_unique IF NOT EXISTS FOR (w:Waitlist) REQUIRE w.email IS UNIQUE;

// ============================================================================
// FULL-TEXT SEARCH INDEXES (Neo4j 5.x syntax)
// ============================================================================

CREATE FULLTEXT INDEX agentSearch IF NOT EXISTS FOR (n:Agent) ON EACH [n.name, n.description, n.systemPrompt, n.tags];
CREATE FULLTEXT INDEX messageSearch IF NOT EXISTS FOR (n:Message) ON EACH [n.content];
CREATE FULLTEXT INDEX workflowSearch IF NOT EXISTS FOR (n:Workflow) ON EACH [n.name, n.description, n.category, n.tags];
CREATE FULLTEXT INDEX userSearch IF NOT EXISTS FOR (n:User) ON EACH [n.username, n.displayName, n.email];
CREATE FULLTEXT INDEX starshipSearch IF NOT EXISTS FOR (n:Starship) ON EACH [n.name, n.description];
CREATE FULLTEXT INDEX toolSearch IF NOT EXISTS FOR (n:Tool) ON EACH [n.name, n.description];
CREATE FULLTEXT INDEX toolTemplateSearch IF NOT EXISTS FOR (n:ToolTemplate) ON EACH [n.name, n.description, n.category];

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
    'tool_system',
    'tool_templates',
    'tool_agent_relationships',
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