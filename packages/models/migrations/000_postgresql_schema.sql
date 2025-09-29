-- PostgreSQL Migration: Complete Database Schema
-- Description: Convert Neo4j graph database to PostgreSQL relational database
-- Author: Migration Script
-- Version: 1.0.0

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(100),
    avatar VARCHAR(500),
    password VARCHAR(255),
    stripe_customer_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ============================================================================
-- STARSHIPS TABLE
-- ============================================================================

CREATE TABLE starships (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(100) NOT NULL,
    owner_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class VARCHAR(50) NOT NULL CHECK (class IN ('scout', 'cruiser', 'draught')),
    name VARCHAR(100) NOT NULL,
    max_agents INTEGER NOT NULL DEFAULT 3,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'restricted', 'disabled', 'pending_payment')),
    subscription_id VARCHAR(255) UNIQUE,
    plan VARCHAR(50) CHECK (plan IN ('scout', 'cruiser', 'draught')),
    billing_period VARCHAR(20) CHECK (billing_period IN ('monthly', 'yearly')),
    stripe_customer_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(owner_id, slug)
);

-- Starship indexes
CREATE INDEX idx_starships_owner_id ON starships(owner_id);
CREATE INDEX idx_starships_status ON starships(status);
CREATE INDEX idx_starships_created_at ON starships(created_at);
CREATE INDEX idx_starships_subscription_id ON starships(subscription_id);

-- ============================================================================
-- AGENT TEMPLATES TABLE
-- ============================================================================

CREATE TABLE agent_templates (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    tags JSONB DEFAULT '[]'::jsonb,
    system_prompt TEXT,
    model VARCHAR(100) NOT NULL,
    temperature DECIMAL(3,2),
    max_tokens INTEGER,
    timeout INTEGER NOT NULL DEFAULT 30000,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Agent template indexes
CREATE INDEX idx_agent_templates_category ON agent_templates(category);
CREATE INDEX idx_agent_templates_usage_count ON agent_templates(usage_count);
CREATE INDEX idx_agent_templates_is_public ON agent_templates(is_public);
CREATE GIN INDEX idx_agent_templates_tags ON agent_templates USING GIN(tags);

-- ============================================================================
-- AGENTS TABLE
-- ============================================================================

CREATE TABLE agents (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    model VARCHAR(100) NOT NULL,
    temperature DECIMAL(3,2),
    max_tokens INTEGER,
    timeout INTEGER NOT NULL DEFAULT 30000,
    system_prompt TEXT,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    starship_id VARCHAR(255) REFERENCES starships(id) ON DELETE SET NULL,
    template_id VARCHAR(255) REFERENCES agent_templates(id) ON DELETE SET NULL,
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Agent indexes
CREATE INDEX idx_agents_starship_id ON agents(starship_id);
CREATE INDEX idx_agents_template_id ON agents(template_id);
CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_created_at ON agents(created_at);

-- ============================================================================
-- TOOL TEMPLATES TABLE
-- ============================================================================

CREATE TABLE tool_templates (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    tags JSONB DEFAULT '[]'::jsonb,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Tool template indexes
CREATE INDEX idx_tool_templates_category ON tool_templates(category);
CREATE INDEX idx_tool_templates_usage_count ON tool_templates(usage_count);
CREATE GIN INDEX idx_tool_templates_tags ON tool_templates USING GIN(tags);

-- ============================================================================
-- TOOLS TABLE
-- ============================================================================

CREATE TABLE tools (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    starship_id VARCHAR(255) REFERENCES starships(id) ON DELETE CASCADE,
    template_id VARCHAR(255) REFERENCES tool_templates(id) ON DELETE SET NULL,
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(starship_id, slug)
);

-- Tool indexes  
CREATE INDEX idx_tools_starship_id ON tools(starship_id);
CREATE INDEX idx_tools_template_id ON tools(template_id);
CREATE INDEX idx_tools_name ON tools(name);
CREATE INDEX idx_tools_slug ON tools(slug);
CREATE INDEX idx_tools_enabled ON tools(is_enabled);

-- ============================================================================
-- WORKFLOWS TABLE
-- ============================================================================

CREATE TABLE workflows (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    author_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    category VARCHAR(255) NOT NULL DEFAULT 'general',
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT false,
    tags JSONB DEFAULT '[]'::jsonb,
    rating DECIMAL(3,2),
    execution_mode VARCHAR(20) NOT NULL DEFAULT 'workflow' CHECK (execution_mode IN ('simple', 'workflow')),
    allowed_starship_classes JSONB DEFAULT '[]'::jsonb,
    timeout INTEGER DEFAULT 30000,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    starship_id VARCHAR(255) REFERENCES starships(id) ON DELETE SET NULL,
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Workflow indexes
CREATE INDEX idx_workflows_author_id ON workflows(author_id);
CREATE INDEX idx_workflows_category ON workflows(category);
CREATE INDEX idx_workflows_starship_id ON workflows(starship_id);
CREATE INDEX idx_workflows_execution_mode ON workflows(execution_mode);
CREATE INDEX idx_workflows_usage_count ON workflows(usage_count);
CREATE INDEX idx_workflows_is_public ON workflows(is_public);
CREATE GIN INDEX idx_workflows_tags ON workflows USING GIN(tags);

-- ============================================================================
-- BLUEPRINTS TABLE
-- ============================================================================

CREATE TABLE blueprints (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL DEFAULT 'general',
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT false,
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Blueprint indexes
CREATE INDEX idx_blueprints_category ON blueprints(category);
CREATE INDEX idx_blueprints_usage_count ON blueprints(usage_count);
CREATE GIN INDEX idx_blueprints_tags ON blueprints USING GIN(tags);

-- ============================================================================
-- NODES TABLE
-- ============================================================================

CREATE TABLE nodes (
    id VARCHAR(255) PRIMARY KEY,
    ref VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    position JSONB DEFAULT '{}'::jsonb,
    blueprint_id VARCHAR(255) NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Node indexes
CREATE INDEX idx_nodes_blueprint_id ON nodes(blueprint_id);
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_nodes_ref ON nodes(ref);

-- ============================================================================
-- EDGES TABLE
-- ============================================================================

CREATE TABLE edges (
    id VARCHAR(255) PRIMARY KEY,
    ref VARCHAR(255) NOT NULL,
    from_node_id VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    to_node_id VARCHAR(255) NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    blueprint_id VARCHAR(255) NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Edge indexes
CREATE INDEX idx_edges_blueprint_id ON edges(blueprint_id);
CREATE INDEX idx_edges_from_node_id ON edges(from_node_id);
CREATE INDEX idx_edges_to_node_id ON edges(to_node_id);

-- ============================================================================
-- CONVERSATIONS TABLE
-- ============================================================================

CREATE TABLE conversations (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    starship_id VARCHAR(255) REFERENCES starships(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Conversation indexes
CREATE INDEX idx_conversations_starship_id ON conversations(starship_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

CREATE TABLE messages (
    id VARCHAR(255) PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL CHECK (message_type IN ('user_input', 'agent_response', 'system_notification', 'system_instruction', 'workflow_output', 'error', 'tool_result')),
    reasoning TEXT,
    tool_calls JSONB,
    tool_call_id VARCHAR(255),
    starship_id VARCHAR(255) REFERENCES starships(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Message indexes
CREATE INDEX idx_messages_starship_id ON messages(starship_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_messages_message_type ON messages(message_type);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================================================
-- EXECUTIONS TABLE
-- ============================================================================

CREATE TABLE executions (
    id VARCHAR(255) PRIMARY KEY,
    workflow_id VARCHAR(255) NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')),
    result JSONB,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Execution indexes
CREATE INDEX idx_executions_workflow_id ON executions(workflow_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_created_at ON executions(created_at);
CREATE INDEX idx_executions_started_at ON executions(started_at);

-- ============================================================================
-- ENVIRONMENTS TABLE
-- ============================================================================

CREATE TABLE environments (
    id VARCHAR(255) PRIMARY KEY,
    starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value TEXT,
    is_encrypted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(starship_id, key)
);

-- Environment indexes
CREATE INDEX idx_environments_starship_id ON environments(starship_id);
CREATE INDEX idx_environments_key ON environments(key);

-- ============================================================================
-- USAGE TABLE
-- ============================================================================

CREATE TABLE usage (
    id VARCHAR(255) PRIMARY KEY,
    starship_id VARCHAR(255) REFERENCES starships(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255) REFERENCES conversations(id) ON DELETE CASCADE,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    model VARCHAR(100) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    cost DECIMAL(10,6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Usage indexes
CREATE INDEX idx_usage_starship_id ON usage(starship_id);
CREATE INDEX idx_usage_conversation_id ON usage(conversation_id);
CREATE INDEX idx_usage_created_at ON usage(created_at);
CREATE INDEX idx_usage_model ON usage(model);

-- ============================================================================
-- WAITLIST TABLE
-- ============================================================================

CREATE TABLE waitlist (
    email VARCHAR(255) PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Waitlist indexes
CREATE INDEX idx_waitlist_status ON waitlist(status);
CREATE INDEX idx_waitlist_created_at ON waitlist(created_at);

-- ============================================================================
-- STRIPE EVENTS TABLE
-- ============================================================================

CREATE TABLE stripe_events (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Stripe events indexes
CREATE INDEX idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX idx_stripe_events_processed_at ON stripe_events(processed_at);

-- ============================================================================
-- JUNCTION TABLES FOR RELATIONSHIPS
-- ============================================================================

-- Agent-Tool relationships (replaces USES_TOOL relationship)
CREATE TABLE agent_tools (
    agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tool_id VARCHAR(255) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_id, tool_id)
);

-- Agent Template-Tool Template relationships (replaces USES_TOOL_TEMPLATE relationship)
CREATE TABLE agent_template_tool_templates (
    agent_template_id VARCHAR(255) NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
    tool_template_id VARCHAR(255) NOT NULL REFERENCES tool_templates(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_template_id, tool_template_id)
);

-- Conversation-Agent relationships (replaces INVOLVES_AGENT relationship)
CREATE TABLE conversation_agents (
    conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, agent_id)
);

-- ============================================================================
-- FULL-TEXT SEARCH INDEXES
-- ============================================================================

-- Create full-text search indexes using PostgreSQL's built-in text search
CREATE INDEX idx_agents_search ON agents USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(system_prompt, '')));
CREATE INDEX idx_messages_search ON messages USING GIN(to_tsvector('english', content));
CREATE INDEX idx_workflows_search ON workflows USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_users_search ON users USING GIN(to_tsvector('english', COALESCE(display_name, '') || ' ' || COALESCE(email, '')));
CREATE INDEX idx_starships_search ON starships USING GIN(to_tsvector('english', name || ' ' || COALESCE(slug, '')));
CREATE INDEX idx_tools_search ON tools USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_tool_templates_search ON tool_templates USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_starships_updated_at BEFORE UPDATE ON starships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_templates_updated_at BEFORE UPDATE ON agent_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tool_templates_updated_at BEFORE UPDATE ON tool_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tools_updated_at BEFORE UPDATE ON tools FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blueprints_updated_at BEFORE UPDATE ON blueprints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_nodes_updated_at BEFORE UPDATE ON nodes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_edges_updated_at BEFORE UPDATE ON edges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_executions_updated_at BEFORE UPDATE ON executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_environments_updated_at BEFORE UPDATE ON environments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE users IS 'User accounts with authentication and billing information';
COMMENT ON TABLE starships IS 'Starships owned by users with configuration and billing details';
COMMENT ON TABLE agent_templates IS 'Reusable agent templates from the marketplace';
COMMENT ON TABLE agents IS 'Deployed agent instances associated with starships';
COMMENT ON TABLE tool_templates IS 'Reusable tool templates from the marketplace';
COMMENT ON TABLE tools IS 'Deployed tool instances associated with starships';
COMMENT ON TABLE workflows IS 'Workflow definitions with execution blueprints';
COMMENT ON TABLE blueprints IS 'Reusable workflow blueprints containing nodes and edges';
COMMENT ON TABLE nodes IS 'Individual workflow nodes within blueprints';
COMMENT ON TABLE edges IS 'Connections between workflow nodes';
COMMENT ON TABLE conversations IS 'Chat conversations within starships';
COMMENT ON TABLE messages IS 'Individual messages within conversations';
COMMENT ON TABLE executions IS 'Workflow execution instances with status and results';
COMMENT ON TABLE environments IS 'Environment variables scoped to starships';
COMMENT ON TABLE usage IS 'LLM usage tracking for billing and analytics';
COMMENT ON TABLE waitlist IS 'User waitlist for controlled access';
COMMENT ON TABLE stripe_events IS 'Stripe webhook events for payment processing';
COMMENT ON TABLE agent_tools IS 'Many-to-many relationship between agents and tools';
COMMENT ON TABLE agent_template_tool_templates IS 'Many-to-many relationship between agent templates and tool templates';
COMMENT ON TABLE conversation_agents IS 'Many-to-many relationship between conversations and agents';