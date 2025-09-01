// Migration 000: Complete Database Schema
// Description: Comprehensive schema for all starships.ai entities based on protocol models
// Date: 2025-01-27
// Author: System
// Dependencies: None - Complete fresh schema

// ============================================================================
// CONSTRAINTS AND UNIQUENESS
// ============================================================================

// User constraints
CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT user_kinde_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.kindeId IS UNIQUE;
CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE;
CREATE CONSTRAINT user_required_props IF NOT EXISTS FOR (u:User) REQUIRE (u.id, u.username, u.createdAt) IS NOT NULL;

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
CREATE CONSTRAINT agent_category_values IF NOT EXISTS FOR (a:Agent) REQUIRE a.category IN ['general', 'coding', 'creative', 'analysis', 'support'];

// Agent Template constraints
CREATE CONSTRAINT agent_template_id_unique IF NOT EXISTS FOR (at:AgentTemplateModel) REQUIRE at.id IS UNIQUE;
CREATE CONSTRAINT agent_template_required_props IF NOT EXISTS FOR (at:AgentTemplateModel) REQUIRE (at.id, at.name, at.createdAt) IS NOT NULL;
CREATE CONSTRAINT agent_template_category_values IF NOT EXISTS FOR (at:AgentTemplateModel) REQUIRE at.category IN ['general', 'coding', 'creative', 'analysis', 'support'];

// Mission constraints
CREATE CONSTRAINT mission_id_unique IF NOT EXISTS FOR (m:MissionModel) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT mission_required_props IF NOT EXISTS FOR (m:MissionModel) REQUIRE (m.id, m.starshipId, m.name, m.description, m.status, m.phase, m.createdAt, m.createdBy) IS NOT NULL;
CREATE CONSTRAINT mission_status_values IF NOT EXISTS FOR (m:MissionModel) REQUIRE m.status IN ['draft', 'active', 'completed', 'failed', 'cancelled'];
CREATE CONSTRAINT mission_phase_values IF NOT EXISTS FOR (m:MissionModel) REQUIRE m.phase IN ['welcome', 'analysis', 'plan', 'execute', 'converse'];
CREATE CONSTRAINT mission_approval_values IF NOT EXISTS FOR (m:MissionModel) REQUIRE m.approvalStatus IN ['pending', 'approved', 'rejected', 'modified'];

// Mission Message constraints
CREATE CONSTRAINT mission_message_id_unique IF NOT EXISTS FOR (mm:MissionMessageModel) REQUIRE mm.id IS UNIQUE;
CREATE CONSTRAINT mission_message_required_props IF NOT EXISTS FOR (mm:MissionMessageModel) REQUIRE (mm.id, mm.missionId, mm.role, mm.content, mm.timestamp) IS NOT NULL;
CREATE CONSTRAINT mission_message_role_values IF NOT EXISTS FOR (mm:MissionMessageModel) REQUIRE mm.role IN ['user', 'orchestrator', 'system'];

// Mission Clarity constraints
CREATE CONSTRAINT mission_clarity_id_unique IF NOT EXISTS FOR (mc:MissionClarity) REQUIRE mc.id IS UNIQUE;
CREATE CONSTRAINT mission_clarity_required_props IF NOT EXISTS FOR (mc:MissionClarity) REQUIRE (mc.id, mc.missionId, mc.createdAt) IS NOT NULL;

// Vision constraints
CREATE CONSTRAINT vision_id_unique IF NOT EXISTS FOR (v:Vision) REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT vision_starship_unique IF NOT EXISTS FOR (v:Vision) REQUIRE v.starshipId IS UNIQUE;

// Workflow constraints
CREATE CONSTRAINT workflow_id_unique IF NOT EXISTS FOR (w:Workflow) REQUIRE w.id IS UNIQUE;
CREATE CONSTRAINT workflow_required_props IF NOT EXISTS FOR (w:Workflow) REQUIRE (w.id, w.name, w.authorId, w.createdAt) IS NOT NULL;
CREATE CONSTRAINT workflow_execution_mode_values IF NOT EXISTS FOR (w:Workflow) REQUIRE w.executionMode IN ['simple', 'workflow'];

// Blueprint constraints
CREATE CONSTRAINT blueprint_id_unique IF NOT EXISTS FOR (b:Blueprint) REQUIRE b.id IS UNIQUE;

// Node constraints
CREATE CONSTRAINT node_id_unique IF NOT EXISTS FOR (n:Node) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT node_required_props IF NOT EXISTS FOR (n:Node) REQUIRE (n.id, n.type, n.name) IS NOT NULL;

// Edge constraints
CREATE CONSTRAINT edge_id_unique IF NOT EXISTS FOR (e:Edge) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT edge_required_props IF NOT EXISTS FOR (e:Edge) REQUIRE (e.id, e.from, e.to) IS NOT NULL;

// Memory constraints
CREATE CONSTRAINT memory_id_unique IF NOT EXISTS FOR (mem:Memory) REQUIRE mem.id IS UNIQUE;
CREATE CONSTRAINT memory_required_props IF NOT EXISTS FOR (mem:Memory) REQUIRE (mem.id, mem.starshipId, mem.createdAt) IS NOT NULL;

// AgentMemory constraints
CREATE CONSTRAINT agent_memory_id_unique IF NOT EXISTS FOR (am:AgentMemory) REQUIRE am.id IS UNIQUE;
CREATE CONSTRAINT agent_memory_required_props IF NOT EXISTS FOR (am:AgentMemory) REQUIRE (am.id, am.starshipId, am.agentId, am.createdAt) IS NOT NULL;

// Message constraints
CREATE CONSTRAINT message_id_unique IF NOT EXISTS FOR (msg:Message) REQUIRE msg.id IS UNIQUE;
CREATE CONSTRAINT message_required_props IF NOT EXISTS FOR (msg:Message) REQUIRE (msg.id, msg.role, msg.content, msg.starshipId, msg.createdAt) IS NOT NULL;
CREATE CONSTRAINT message_role_values IF NOT EXISTS FOR (msg:Message) REQUIRE msg.role IN ['system', 'user', 'assistant'];
CREATE CONSTRAINT message_type_values IF NOT EXISTS FOR (msg:Message) REQUIRE msg.messageType IN ['user_input', 'agent_response', 'system_event', 'tool_output', 'error'];
CREATE CONSTRAINT message_importance_values IF NOT EXISTS FOR (msg:Message) REQUIRE msg.importance IN ['low', 'medium', 'high', 'critical'];
CREATE CONSTRAINT message_processing_status_values IF NOT EXISTS FOR (msg:Message) REQUIRE msg.processingStatus IN ['pending', 'processing', 'processed', 'failed'];

// Chat Session constraints
CREATE CONSTRAINT chat_session_id_unique IF NOT EXISTS FOR (cs:ChatSession) REQUIRE cs.id IS UNIQUE;
CREATE CONSTRAINT chat_session_required_props IF NOT EXISTS FOR (cs:ChatSession) REQUIRE (cs.id, cs.source, cs.created_by, cs.created_at, cs.last_activity_at, cs.total_tokens) IS NOT NULL;
CREATE CONSTRAINT chat_session_source_values IF NOT EXISTS FOR (cs:ChatSession) REQUIRE cs.source IN ['sibil', 'agent'];

// Chat Message constraints
CREATE CONSTRAINT chat_message_id_unique IF NOT EXISTS FOR (cm:ChatMessage) REQUIRE cm.id IS UNIQUE;
CREATE CONSTRAINT chat_message_required_props IF NOT EXISTS FOR (cm:ChatMessage) REQUIRE (cm.id, cm.session_id, cm.role, cm.content, cm.timestamp) IS NOT NULL;
CREATE CONSTRAINT chat_message_role_values IF NOT EXISTS FOR (cm:ChatMessage) REQUIRE cm.role IN ['user', 'assistant', 'system'];

// Execution constraints
CREATE CONSTRAINT execution_id_unique IF NOT EXISTS FOR (ex:Execution) REQUIRE ex.id IS UNIQUE;
CREATE CONSTRAINT execution_required_props IF NOT EXISTS FOR (ex:Execution) REQUIRE (ex.id, ex.workflowId, ex.createdAt) IS NOT NULL;
CREATE CONSTRAINT execution_status_values IF NOT EXISTS FOR (ex:Execution) REQUIRE ex.status IN ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'];


// MCP Server Option constraints
CREATE CONSTRAINT mcp_server_option_id_unique IF NOT EXISTS FOR (m:MCPServerOption) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT mcp_server_option_name_unique IF NOT EXISTS FOR (m:MCPServerOption) REQUIRE m.name IS UNIQUE;

// MCP Connector constraints
CREATE CONSTRAINT mcp_connector_id_unique IF NOT EXISTS FOR (mc:MCPConnector) REQUIRE mc.id IS UNIQUE;

// Native Tool API Key constraints
CREATE CONSTRAINT native_tool_api_key_unique IF NOT EXISTS FOR (k:NativeToolApiKey) REQUIRE (k.starshipId, k.toolName) IS UNIQUE;

// Workflow Runtime State constraints
CREATE CONSTRAINT workflow_runtime_state_id_unique IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) REQUIRE wrs.id IS UNIQUE;

// Stripe event idempotency constraints
CREATE CONSTRAINT stripe_event_id_unique IF NOT EXISTS FOR (se:StripeEvent) REQUIRE se.eventId IS UNIQUE;

// Waitlist constraints
CREATE CONSTRAINT waitlist_email_unique IF NOT EXISTS FOR (w:Waitlist) REQUIRE w.email IS UNIQUE;
CREATE CONSTRAINT waitlist_status_values IF NOT EXISTS FOR (w:Waitlist) REQUIRE w.status IN ['approved', 'pending', 'rejected'];

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
CREATE INDEX agent_template_id_index IF NOT EXISTS FOR (a:Agent) ON (a.templateId);

// Agent Template indexes
CREATE INDEX agent_template_category_index IF NOT EXISTS FOR (at:AgentTemplateModel) ON (at.category);
CREATE INDEX agent_template_author_index IF NOT EXISTS FOR (at:AgentTemplateModel) ON (at.authorId);
CREATE INDEX agent_template_public_index IF NOT EXISTS FOR (at:AgentTemplateModel) ON (at.isPublic);
CREATE INDEX agent_template_usage_index IF NOT EXISTS FOR (at:AgentTemplateModel) ON (at.usageCount);

// Mission indexes
CREATE INDEX mission_starship_id_index IF NOT EXISTS FOR (m:MissionModel) ON (m.starshipId);
CREATE INDEX mission_status_index IF NOT EXISTS FOR (m:MissionModel) ON (m.status);
CREATE INDEX mission_phase_index IF NOT EXISTS FOR (m:MissionModel) ON (m.phase);
CREATE INDEX mission_created_by_index IF NOT EXISTS FOR (m:MissionModel) ON (m.createdBy);
CREATE INDEX mission_blueprint_id_index IF NOT EXISTS FOR (m:MissionModel) ON (m.blueprintId);
CREATE INDEX mission_approval_status_index IF NOT EXISTS FOR (m:MissionModel) ON (m.approvalStatus);
CREATE RANGE INDEX mission_created_at_range IF NOT EXISTS FOR (m:MissionModel) ON (m.createdAt);

// Mission Message indexes
CREATE INDEX mission_message_mission_id_index IF NOT EXISTS FOR (mm:MissionMessageModel) ON (mm.missionId);
CREATE INDEX mission_message_role_index IF NOT EXISTS FOR (mm:MissionMessageModel) ON (mm.role);
CREATE INDEX mission_message_user_id_index IF NOT EXISTS FOR (mm:MissionMessageModel) ON (mm.userId);
CREATE RANGE INDEX mission_message_timestamp_range IF NOT EXISTS FOR (mm:MissionMessageModel) ON (mm.timestamp);

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

// Workflow indexes
CREATE INDEX workflow_author_id_index IF NOT EXISTS FOR (w:Workflow) ON (w.authorId);
CREATE INDEX workflow_starship_id_index IF NOT EXISTS FOR (w:Workflow) ON (w.starshipId);
CREATE INDEX workflow_category_index IF NOT EXISTS FOR (w:Workflow) ON (w.category);
CREATE INDEX workflow_public_index IF NOT EXISTS FOR (w:Workflow) ON (w.isPublic);
CREATE INDEX workflow_execution_mode_index IF NOT EXISTS FOR (w:Workflow) ON (w.executionMode);
CREATE INDEX workflow_approval_status_idx IF NOT EXISTS FOR (w:Workflow) ON (w.approvalStatus);
CREATE INDEX workflow_tags_array IF NOT EXISTS FOR (w:Workflow) ON (w.tags);
CREATE RANGE INDEX workflow_created_at_range IF NOT EXISTS FOR (w:Workflow) ON (w.createdAt);

// Blueprint indexes
CREATE INDEX blueprint_name_index IF NOT EXISTS FOR (b:Blueprint) ON (b.name);
CREATE INDEX blueprint_category_index IF NOT EXISTS FOR (b:Blueprint) ON (b.category);
CREATE INDEX blueprint_usage_count_index IF NOT EXISTS FOR (b:Blueprint) ON (b.usageCount);
CREATE RANGE INDEX blueprint_created_at_range IF NOT EXISTS FOR (b:Blueprint) ON (b.createdAt);

// Node indexes
CREATE INDEX node_type_index IF NOT EXISTS FOR (n:Node) ON (n.type);
CREATE INDEX node_workflow_id_index IF NOT EXISTS FOR (n:Node) ON (n.workflowId);
CREATE INDEX node_name_index IF NOT EXISTS FOR (n:Node) ON (n.name);
CREATE INDEX workflow_node_type_idx IF NOT EXISTS FOR (wn:WorkflowNode) ON (wn.type);

// Edge indexes
CREATE INDEX edge_from_index IF NOT EXISTS FOR (e:Edge) ON (e.from);
CREATE INDEX edge_to_index IF NOT EXISTS FOR (e:Edge) ON (e.to);
CREATE INDEX edge_workflow_id_index IF NOT EXISTS FOR (e:Edge) ON (e.workflowId);

// Memory indexes
CREATE INDEX memory_starship_id_index IF NOT EXISTS FOR (mem:Memory) ON (mem.starshipId);
CREATE INDEX memory_agent_id_index IF NOT EXISTS FOR (mem:Memory) ON (mem.agentId);
CREATE INDEX memory_tags_array IF NOT EXISTS FOR (mem:Memory) ON (mem.tags);
CREATE INDEX memory_message_count_index IF NOT EXISTS FOR (mem:Memory) ON (mem.messageCount);
CREATE RANGE INDEX memory_created_at_range IF NOT EXISTS FOR (mem:Memory) ON (mem.createdAt);

// AgentMemory indexes
CREATE INDEX agent_memory_starship_id_index IF NOT EXISTS FOR (am:AgentMemory) ON (am.starshipId);
CREATE INDEX agent_memory_agent_id_index IF NOT EXISTS FOR (am:AgentMemory) ON (am.agentId);
CREATE INDEX agent_memory_tags_array IF NOT EXISTS FOR (am:AgentMemory) ON (am.tags);
CREATE RANGE INDEX agent_memory_created_at_range IF NOT EXISTS FOR (am:AgentMemory) ON (am.createdAt);

// Message indexes
CREATE INDEX message_starship_id_index IF NOT EXISTS FOR (msg:Message) ON (msg.starshipId);
CREATE INDEX message_agent_id_index IF NOT EXISTS FOR (msg:Message) ON (msg.agentId);
CREATE INDEX message_memory_id_index IF NOT EXISTS FOR (msg:Message) ON (msg.memoryId);
CREATE INDEX message_conversation_id_index IF NOT EXISTS FOR (msg:Message) ON (msg.conversationId);
CREATE INDEX message_parent_message_id_index IF NOT EXISTS FOR (msg:Message) ON (msg.parentMessageId);
CREATE INDEX message_role_index IF NOT EXISTS FOR (msg:Message) ON (msg.role);
CREATE INDEX message_type_index IF NOT EXISTS FOR (msg:Message) ON (msg.messageType);
CREATE INDEX message_importance_index IF NOT EXISTS FOR (msg:Message) ON (msg.importance);
CREATE INDEX message_processing_status_index IF NOT EXISTS FOR (msg:Message) ON (msg.processingStatus);
CREATE INDEX message_content_hash_index IF NOT EXISTS FOR (msg:Message) ON (msg.contentHash);
CREATE RANGE INDEX message_timestamp_range IF NOT EXISTS FOR (msg:Message) ON (msg.timestamp);
CREATE RANGE INDEX message_created_at_range IF NOT EXISTS FOR (msg:Message) ON (msg.createdAt);

// Chat Session indexes
CREATE INDEX chat_session_created_by_index IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_by);
CREATE INDEX chat_session_source_index IF NOT EXISTS FOR (cs:ChatSession) ON (cs.source);
CREATE RANGE INDEX chat_session_created_at_range IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_at);
CREATE RANGE INDEX chat_session_last_activity_range IF NOT EXISTS FOR (cs:ChatSession) ON (cs.last_activity_at);
CREATE INDEX chat_session_total_tokens_index IF NOT EXISTS FOR (cs:ChatSession) ON (cs.total_tokens);
CREATE INDEX chat_session_user_activity_composite IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_by, cs.last_activity_at);
CREATE INDEX chat_session_user_source_composite IF NOT EXISTS FOR (cs:ChatSession) ON (cs.created_by, cs.source);

// Chat Message indexes
CREATE INDEX chat_message_session_index IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.session_id);
CREATE INDEX chat_message_role_index IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.role);
CREATE INDEX chat_message_stream_index IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.stream_id);
CREATE RANGE INDEX chat_message_timestamp_range IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.timestamp);
CREATE INDEX chat_message_session_role_composite IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.session_id, cm.role);
CREATE INDEX chat_message_session_timestamp_composite IF NOT EXISTS FOR (cm:ChatMessage) ON (cm.session_id, cm.timestamp);

// Execution indexes
CREATE INDEX execution_workflow_id_index IF NOT EXISTS FOR (ex:Execution) ON (ex.workflowId);
CREATE INDEX execution_status_index IF NOT EXISTS FOR (ex:Execution) ON (ex.status);
CREATE INDEX execution_current_node_ref_index IF NOT EXISTS FOR (ex:Execution) ON (ex.currentNodeRef);
CREATE RANGE INDEX execution_created_at_range IF NOT EXISTS FOR (ex:Execution) ON (ex.createdAt);
CREATE RANGE INDEX execution_start_time_range IF NOT EXISTS FOR (ex:Execution) ON (ex.startTime);
CREATE RANGE INDEX execution_end_time_range IF NOT EXISTS FOR (ex:Execution) ON (ex.endTime);

// MCP Server Option indexes
CREATE INDEX mcp_server_name_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.name);
CREATE INDEX mcp_server_command_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.command);
CREATE INDEX mcp_server_slug_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.slug);

// MCP Connector indexes
CREATE INDEX mcp_connector_starship_id_index IF NOT EXISTS FOR (mc:MCPConnector) ON (mc.starshipId);
CREATE INDEX mcp_connector_server_option_id_index IF NOT EXISTS FOR (mc:MCPConnector) ON (mc.serverOptionId);

// Native Tool API Key indexes
CREATE INDEX native_tool_api_key_starship IF NOT EXISTS FOR (n:NativeToolApiKey) ON (n.starshipId);

// Workflow Runtime State indexes
CREATE INDEX workflow_runtime_workflow_id_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.workflowId);
CREATE INDEX workflow_runtime_status_idx IF NOT EXISTS FOR (wrs:WorkflowRuntimeState) ON (wrs.status);

// Waitlist indexes
CREATE INDEX waitlist_status_index IF NOT EXISTS FOR (w:Waitlist) ON (w.status);
CREATE INDEX waitlist_added_by_index IF NOT EXISTS FOR (w:Waitlist) ON (w.addedBy);
CREATE RANGE INDEX waitlist_created_at_range IF NOT EXISTS FOR (w:Waitlist) ON (w.createdAt);

// ============================================================================
// FULL-TEXT SEARCH INDEXES
// ============================================================================

// Agent full-text search
CALL db.index.fulltext.createNodeIndex('agentSearch', ['Agent'], ['name', 'description', 'systemPrompt', 'tags']) YIELD name
RETURN "Created full-text search index: " + name as result;

// Mission full-text search
CALL db.index.fulltext.createNodeIndex('missionSearch', ['Mission'], ['name', 'description']) YIELD name
RETURN "Created full-text search index: " + name as result;

// Message full-text search
CALL db.index.fulltext.createNodeIndex('messageSearch', ['Message'], ['content']) YIELD name
RETURN "Created full-text search index: " + name as result;

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
  id: '000_complete_schema',
  name: 'Complete Database Schema',
  description: 'Comprehensive schema with all starships.ai entities based on protocol models',
  version: '2.0.0',
  appliedAt: datetime().epochMillis,
  appliedBy: 'system',
  dependencies: [],
  features: [
    'user_management',
    'starship_system',
    'agent_deployment',
    'agent_templates',
    'mission_clarity',
    'mission_messages',
    'vision_metrics',
    'mission_execution',
    'workflow_dsl',
    'blueprint_management',
    'node_edge_system',
    'memory_management',
    'agent_memory',
    'message_system',
    'chat_sessions',
    'chat_messages',
    'execution_tracking',
    'stripe_integration',
    'mcp_servers',
    'native_tool_api_keys',
    'waitlist_management',
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