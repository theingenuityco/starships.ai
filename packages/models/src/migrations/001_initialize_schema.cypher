// Migration 001: Complete Database Schema Initialization
// Description: Consolidated schema from all previous migrations for fresh database setup
// Date: 2025-01-26
// Author: System
// Dependencies: None - Complete fresh schema

// ============================================================================
// CONSTRAINTS AND UNIQUENESS
// ============================================================================

// User constraints
CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT user_kinde_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.kindeId IS UNIQUE;
CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE;
CREATE CONSTRAINT user_required_props IF NOT EXISTS FOR (u:User) REQUIRE (u.id, u.createdAt) IS NOT NULL;

// Starship constraints
CREATE CONSTRAINT starship_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT starship_owner_slug_key IF NOT EXISTS FOR (s:Starship) REQUIRE (s.ownerId, s.slug) IS NODE KEY;
CREATE CONSTRAINT starship_required_props IF NOT EXISTS FOR (s:Starship) REQUIRE (s.id, s.ownerId, s.name, s.class, s.status, s.maxAgents, s.maxActiveMissions, s.createdAt) IS NOT NULL;
CREATE CONSTRAINT starship_class_values IF NOT EXISTS FOR (s:Starship) REQUIRE s.class IN ['scout', 'cruiser', 'draught'];
CREATE CONSTRAINT starship_status_values IF NOT EXISTS FOR (s:Starship) REQUIRE s.status IN ['active', 'inactive', 'restricted', 'disabled', 'pending_payment'];
CREATE CONSTRAINT starship_subscription_id_unique IF NOT EXISTS FOR (s:Starship) REQUIRE s.subscriptionId IS UNIQUE;

// Agent constraints
CREATE CONSTRAINT agent_id_unique IF NOT EXISTS FOR (a:Agent) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT agent_required_props IF NOT EXISTS FOR (a:Agent) REQUIRE (a.id, a.name, a.starshipId, a.authorId, a.createdAt) IS NOT NULL;

// Agent Template constraints
CREATE CONSTRAINT agent_template_id_unique IF NOT EXISTS FOR (at:AgentTemplate) REQUIRE at.id IS UNIQUE;
CREATE CONSTRAINT agent_template_required_props IF NOT EXISTS FOR (at:AgentTemplate) REQUIRE (at.id, at.name, at.authorId, at.createdAt) IS NOT NULL;

// Mission Clarity constraints
CREATE CONSTRAINT mission_clarity_id_unique IF NOT EXISTS FOR (mc:MissionClarity) REQUIRE mc.id IS UNIQUE;
CREATE CONSTRAINT mission_clarity_required_props IF NOT EXISTS FOR (mc:MissionClarity) REQUIRE (mc.id, mc.missionId, mc.createdAt) IS NOT NULL;

// Vision constraints
CREATE CONSTRAINT vision_id_unique IF NOT EXISTS FOR (v:Vision) REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT vision_starship_unique IF NOT EXISTS FOR (v:Vision) REQUIRE v.starshipId IS UNIQUE;

// Mission constraints
CREATE CONSTRAINT mission_id_unique IF NOT EXISTS FOR (m:Mission) REQUIRE m.id IS UNIQUE;

// Mission message constraints
CREATE CONSTRAINT mission_message_id_unique IF NOT EXISTS FOR (mm:MissionMessage) REQUIRE mm.id IS UNIQUE;

// LLM constraints
CREATE CONSTRAINT llm_id_unique IF NOT EXISTS FOR (l:LLM) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT llm_name_provider_unique IF NOT EXISTS FOR (l:LLM) REQUIRE (l.name, l.provider) IS NODE KEY;

// MCP Server Option constraints
CREATE CONSTRAINT mcp_server_option_id_unique IF NOT EXISTS FOR (m:MCPServerOption) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT mcp_server_option_name_unique IF NOT EXISTS FOR (m:MCPServerOption) REQUIRE m.name IS UNIQUE;

// MCP Connector constraints
CREATE CONSTRAINT mcp_connector_id_unique IF NOT EXISTS FOR (mc:MCPConnector) REQUIRE mc.id IS UNIQUE;

// Native Tool API Key constraints
CREATE CONSTRAINT native_tool_api_key_unique IF NOT EXISTS FOR (k:NativeToolApiKey) REQUIRE (k.starshipId, k.toolName) IS UNIQUE;

// Workflow constraints
CREATE CONSTRAINT workflow_id_unique IF NOT EXISTS FOR (w:Workflow) REQUIRE w.id IS UNIQUE;
CREATE CONSTRAINT workflow_node_id_unique IF NOT EXISTS FOR (wn:WorkflowNode) REQUIRE wn.id IS UNIQUE;
CREATE CONSTRAINT workflow_edge_id_unique IF NOT EXISTS FOR (we:WorkflowEdge) REQUIRE we.id IS UNIQUE;
CREATE CONSTRAINT workflow_runtime_state_id_unique IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) REQUIRE wrs.id IS UNIQUE;

// Stripe event idempotency constraints
CREATE CONSTRAINT stripe_event_id_unique IF NOT EXISTS FOR (se:StripeEvent) REQUIRE se.eventId IS UNIQUE;

// Waitlist constraints
CREATE CONSTRAINT waitlist_email_unique IF NOT EXISTS FOR (w:Waitlist) REQUIRE w.email IS UNIQUE;

// ============================================================================
// PERFORMANCE INDEXES
// ============================================================================

// User indexes
CREATE INDEX user_stripe_customer_id IF NOT EXISTS FOR (u:User) ON (u.stripeCustomerId);
CREATE INDEX user_username_index IF NOT EXISTS FOR (u:User) ON (u.username);
CREATE RANGE INDEX user_created_at_range IF NOT EXISTS FOR (u:User) ON (u.createdAt);

// Starship indexes
CREATE INDEX starship_owner_id_index IF NOT EXISTS FOR (s:Starship) ON (s.ownerId);
CREATE INDEX starship_class_index IF NOT EXISTS FOR (s:Starship) ON (s.class);
CREATE INDEX starship_status_index IF NOT EXISTS FOR (s:Starship) ON (s.status);
CREATE INDEX starship_subscription_id IF NOT EXISTS FOR (s:Starship) ON (s.subscriptionId);
CREATE INDEX starship_stripe_customer_id IF NOT EXISTS FOR (s:Starship) ON (s.stripeCustomerId);
CREATE INDEX starship_owner_status_composite IF NOT EXISTS FOR (s:Starship) ON (s.ownerId, s.status);
CREATE INDEX starship_class_status_composite IF NOT EXISTS FOR (s:Starship) ON (s.class, s.status);
CREATE RANGE INDEX starship_created_at_range IF NOT EXISTS FOR (s:Starship) ON (s.createdAt);

// Agent indexes
CREATE INDEX agent_category_index IF NOT EXISTS FOR (a:Agent) ON (a.category);
CREATE INDEX agent_public_index IF NOT EXISTS FOR (a:Agent) ON (a.isPublic);
CREATE INDEX agent_author_index IF NOT EXISTS FOR (a:Agent) ON (a.authorId);
CREATE INDEX agent_starship_index IF NOT EXISTS FOR (a:Agent) ON (a.starshipId);
CREATE INDEX agent_tags_index IF NOT EXISTS FOR (a:Agent) ON (a.tags);
CREATE INDEX agent_starship_category_composite IF NOT EXISTS FOR (a:Agent) ON (a.starshipId, a.category);
CREATE INDEX agent_author_public_composite IF NOT EXISTS FOR (a:Agent) ON (a.authorId, a.isPublic);
CREATE INDEX agent_tags_array IF NOT EXISTS FOR (a:Agent) ON (a.tags);
CREATE INDEX agent_allowed_starship_classes_array IF NOT EXISTS FOR (a:Agent) ON (a.allowedStarshipClasses);
CREATE RANGE INDEX agent_created_at_range IF NOT EXISTS FOR (a:Agent) ON (a.createdAt);

// Agent Template indexes
CREATE INDEX agent_template_category_index IF NOT EXISTS FOR (at:AgentTemplate) ON (at.category);
CREATE INDEX agent_template_author_index IF NOT EXISTS FOR (at:AgentTemplate) ON (at.authorId);
CREATE INDEX agent_template_public_index IF NOT EXISTS FOR (at:AgentTemplate) ON (at.isPublic);
CREATE INDEX agent_template_usage_index IF NOT EXISTS FOR (at:AgentTemplate) ON (at.usageCount);

// Mission Clarity indexes
CREATE INDEX mission_clarity_mission_index IF NOT EXISTS FOR (mc:MissionClarity) ON (mc.missionId);
CREATE INDEX mission_clarity_score_index IF NOT EXISTS FOR (mc:MissionClarity) ON (mc.overallScore);

// Vision indexes
CREATE INDEX vision_starship_id_index IF NOT EXISTS FOR (v:Vision) ON (v.starshipId);
CREATE INDEX vision_clarity_score_index IF NOT EXISTS FOR (v:Vision) ON (v.clarityScore);
CREATE INDEX vision_specificity_score_index IF NOT EXISTS FOR (v:Vision) ON (v.specificityScore);
CREATE INDEX vision_actionability_score_index IF NOT EXISTS FOR (v:Vision) ON (v.actionabilityScore);
CREATE INDEX vision_inspirational_score_index IF NOT EXISTS FOR (v:Vision) ON (v.inspirationalScore);
CREATE INDEX vision_overall_quality_index IF NOT EXISTS FOR (v:Vision) ON (v.overallQuality);
CREATE INDEX vision_starship_quality_index IF NOT EXISTS FOR (v:Vision) ON (v.starshipId, v.overallQuality);
CREATE INDEX vision_starship_active_index IF NOT EXISTS FOR (v:Vision) ON (v.starshipId, v.isActive);
CREATE INDEX vision_has_objectives_index IF NOT EXISTS FOR (v:Vision) ON (v.hasObjectives);
CREATE INDEX vision_has_timeframe_index IF NOT EXISTS FOR (v:Vision) ON (v.hasTimeframe);
CREATE INDEX vision_has_measurables_index IF NOT EXISTS FOR (v:Vision) ON (v.hasMeasurables);

// Mission indexes
CREATE INDEX mission_starship_id_index IF NOT EXISTS FOR (m:Mission) ON (m.starshipId);
CREATE INDEX mission_status_index IF NOT EXISTS FOR (m:Mission) ON (m.status);
CREATE RANGE INDEX mission_created_at_range IF NOT EXISTS FOR (m:Mission) ON (m.createdAt);

// Mission message indexes
CREATE INDEX mission_message_mission_id_index IF NOT EXISTS FOR (mm:MissionMessage) ON (mm.missionId);
CREATE INDEX mission_message_type_index IF NOT EXISTS FOR (mm:MissionMessage) ON (mm.type);
CREATE RANGE INDEX mission_message_created_at_range IF NOT EXISTS FOR (mm:MissionMessage) ON (mm.createdAt);

// LLM indexes
CREATE INDEX llm_provider_index IF NOT EXISTS FOR (l:LLM) ON (l.provider);
CREATE INDEX llm_active_index IF NOT EXISTS FOR (l:LLM) ON (l.isActive);

// MCP Server Option indexes
CREATE INDEX mcp_server_name_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.name);
CREATE INDEX mcp_server_command_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.command);
CREATE INDEX mcp_server_slug_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.slug);

// MCP Connector indexes
CREATE INDEX mcp_connector_starship_id_index IF NOT EXISTS FOR (mc:MCPConnector) ON (mc.starshipId);
CREATE INDEX mcp_connector_server_option_id_index IF NOT EXISTS FOR (mc:MCPConnector) ON (mc.serverOptionId);

// Native Tool API Key indexes
CREATE INDEX native_tool_api_key_starship IF NOT EXISTS FOR (n:NativeToolApiKey) ON (n.starshipId);

// Workflow indexes
CREATE INDEX workflow_approval_status_idx IF NOT EXISTS FOR (w:Workflow) ON (w.approvalStatus);
CREATE INDEX workflow_runtime_workflow_id_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.workflowId);
CREATE INDEX workflow_runtime_status_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.status);
CREATE INDEX workflow_node_type_idx IF NOT EXISTS FOR (wn:WorkflowNode) ON (wn.type);

// ============================================================================
// FULL-TEXT SEARCH INDEXES
// ============================================================================

// Agent full-text search
CALL db.index.fulltext.createNodeIndex('agentSearch', ['Agent'], ['name', 'description', 'systemPrompt', 'tags']) YIELD name
RETURN "Created full-text search index: " + name as result;

// ============================================================================
// SEED DATA - LLM MODELS
// ============================================================================

// OpenAI Models - Updated to match Protocol interface
MERGE (l:LLM {name: 'gpt-4o', provider: 'openai'})
SET l.id = COALESCE(l.id, randomUUID()),
    l.maxTokens = 128000,
    l.temperature = 0.7,
    l.supportsStreaming = true,
    l.supportsTools = true,
    l.costPer1kTokens = 0.015,
    l.createdAt = COALESCE(l.createdAt, toString(datetime()));

MERGE (l:LLM {name: 'gpt-4o-mini', provider: 'openai'})
SET l.id = COALESCE(l.id, randomUUID()),
    l.maxTokens = 128000,
    l.temperature = 0.7,
    l.supportsStreaming = true,
    l.supportsTools = true,
    l.costPer1kTokens = 0.0015,
    l.createdAt = COALESCE(l.createdAt, toString(datetime()));

MERGE (l:LLM {name: 'gpt-3.5-turbo', provider: 'openai'})
SET l.id = COALESCE(l.id, randomUUID()),
    l.maxTokens = 16385,
    l.temperature = 0.7,
    l.supportsStreaming = true,
    l.supportsTools = true,
    l.costPer1kTokens = 0.002,
    l.createdAt = COALESCE(l.createdAt, toString(datetime()));

// Anthropic Models - Updated to match Protocol interface
MERGE (l:LLM {name: 'claude-3-5-sonnet-20241022', provider: 'anthropic'})
SET l.id = COALESCE(l.id, randomUUID()),
    l.maxTokens = 8192,
    l.temperature = 0.7,
    l.supportsStreaming = true,
    l.supportsTools = true,
    l.costPer1kTokens = 0.018,
    l.createdAt = COALESCE(l.createdAt, toString(datetime()));

MERGE (l:LLM {name: 'claude-3-haiku-20240307', provider: 'anthropic'})
SET l.id = COALESCE(l.id, randomUUID()),
    l.maxTokens = 4096,
    l.temperature = 0.7,
    l.supportsStreaming = true,
    l.supportsTools = true,
    l.costPer1kTokens = 0.00125,
    l.createdAt = COALESCE(l.createdAt, toString(datetime()));

// ============================================================================
// SEED DATA - MCP SERVER OPTIONS
// ============================================================================

// GitHub MCP Server
MERGE (m:MCPServerOption {name: 'GitHub'})
SET m.id = COALESCE(m.id, 'github-' + randomUUID()),
    m.command = 'docker',
    m.args = ['run', '-i', '--rm', 'mcp/github'],
    m.env = '{"GITHUB_PERSONAL_ACCESS_TOKEN":"Your GitHub Personal Access Token"}',
    m.slug = 'github',
    m.description = 'GitHub integration for repository management',
    m.category = 'development',
    m.isActive = true,
    m.dockerImage = 'mcp/github',
    m.dockerTag = 'latest',
    m.httpBridgePort = null,
    m.httpBridgeEnabled = false;

// Puppeteer MCP Server
MERGE (m:MCPServerOption {name: 'Puppeteer'})
SET m.id = COALESCE(m.id, 'puppeteer-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-puppeteer'],
    m.env = '{}',
    m.slug = 'puppeteer',
    m.description = 'Web automation and scraping capabilities',
    m.category = 'automation',
    m.isActive = true,
    m.httpBridgePort = 3001,
    m.httpBridgeEnabled = true;

// SQLite MCP Server
MERGE (m:MCPServerOption {name: 'SQLite'})
SET m.id = COALESCE(m.id, 'sqlite-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
    m.env = '{}',
    m.slug = 'sqlite',
    m.description = 'SQLite database operations',
    m.category = 'database',
    m.isActive = true,
    m.httpBridgePort = null,
    m.httpBridgeEnabled = false;

// PostgreSQL MCP Server
MERGE (m:MCPServerOption {name: 'PostgreSQL'})
SET m.id = COALESCE(m.id, 'postgresql-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-postgres'],
    m.env = '{"POSTGRES_CONNECTION_STRING":"[POSTGRES-CONNECTION]"}',
    m.slug = 'postgresql',
    m.description = 'PostgreSQL database operations',
    m.category = 'database',
    m.isActive = true,
    m.httpBridgePort = null,
    m.httpBridgeEnabled = false;

// Brave Search MCP Server
MERGE (m:MCPServerOption {name: 'Brave Search'})
SET m.id = COALESCE(m.id, 'brave-search-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-brave-search'],
    m.env = '{"BRAVE_API_KEY":"Your Brave Search API Key"}',
    m.slug = 'brave-search',
    m.description = 'Web search capabilities using Brave Search',
    m.category = 'search',
    m.isActive = true,
    m.httpBridgePort = 3002,
    m.httpBridgeEnabled = true;

// Google Drive MCP Server
MERGE (m:MCPServerOption {name: 'Google Drive'})
SET m.id = COALESCE(m.id, 'gdrive-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-gdrive'],
    m.env = '{"GOOGLE_CLIENT_ID":"Your Google Client ID","GOOGLE_CLIENT_SECRET":"Your Google Client Secret"}',
    m.slug = 'google-drive',
    m.description = 'Google Drive file management',
    m.category = 'storage',
    m.isActive = true,
    m.httpBridgePort = null,
    m.httpBridgeEnabled = false;

// Slack MCP Server
MERGE (m:MCPServerOption {name: 'Slack'})
SET m.id = COALESCE(m.id, 'slack-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-slack'],
    m.env = '{"SLACK_BOT_TOKEN":"Your Slack Bot Token"}',
    m.slug = 'slack',
    m.description = 'Slack messaging and workspace integration',
    m.category = 'communication',
    m.isActive = true,
    m.httpBridgePort = null,
    m.httpBridgeEnabled = false;

// Everything MCP Server
MERGE (m:MCPServerOption {name: 'Everything'})
SET m.id = COALESCE(m.id, 'everything-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-everything'],
    m.env = '{}',
    m.slug = 'everything',
    m.description = 'File system search on Windows',
    m.category = 'search',
    m.isActive = true,
    m.httpBridgePort = null,
    m.httpBridgeEnabled = false;

// Fetch MCP Server
MERGE (m:MCPServerOption {name: 'Fetch'})
SET m.id = COALESCE(m.id, 'fetch-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-fetch'],
    m.env = '{}',
    m.slug = 'fetch',
    m.description = 'HTTP request capabilities',
    m.category = 'networking',
    m.isActive = true,
    m.httpBridgePort = 3003,
    m.httpBridgeEnabled = true;

// Time MCP Server
MERGE (m:MCPServerOption {name: 'Time'})
SET m.id = COALESCE(m.id, 'time-' + randomUUID()),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-time'],
    m.env = '{}',
    m.slug = 'time',
    m.description = 'Time and date operations',
    m.category = 'utility',
    m.isActive = true,
    m.httpBridgePort = null,
    m.httpBridgeEnabled = false;

// ============================================================================
// PERFORMANCE MONITORING SETUP
// ============================================================================

// Create performance monitoring node
MERGE (pm:PerformanceMonitor {id: 'starship_system_monitor'})
SET pm.name = 'Starship System Performance Monitor',
    pm.createdAt = COALESCE(pm.createdAt, datetime().epochMillis),
    pm.lastUpdated = datetime().epochMillis,
    pm.queryStats = {},
    pm.indexUsage = {},
    pm.constraintViolations = 0;

// ============================================================================
// MIGRATION COMPLETION RECORD
// ============================================================================

CREATE (m:Migration {
  id: '001_initialize_schema',
  name: 'Complete Database Schema Initialization',
  description: 'Consolidated schema with all features: users, starships, agents, visions, missions, workflows, stripe, MCP servers',
  version: '1.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  dependencies: [],
  features: [
    'user_management',
    'starship_system',
    'agent_deployment',
    'agent_templates',
    'mission_clarity',
    'vision_metrics',
    'mission_execution',
    'workflow_dsl',
    'stripe_integration',
    'mcp_servers',
    'native_tool_api_keys',
    'performance_optimizations'
  ]
});

// ============================================================================
// VERIFICATION AND SUMMARY
// ============================================================================

// Return summary of created schema
MATCH (n) 
WITH labels(n)[0] as nodeType, count(n) as count
WHERE nodeType IS NOT NULL
RETURN nodeType, count
ORDER BY nodeType;