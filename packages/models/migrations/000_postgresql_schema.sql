-- PostgreSQL Migration: Complete Database Schema
-- Description: Complete database schema for starships.ai
-- Author: Migration Script
-- Version: 2.1.0
-- Last Updated: 2025-09-30
-- Note: Removed workflows, blueprints, and executions tables - no repository implementations exist

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
CREATE INDEX idx_agent_templates_tags ON agent_templates USING GIN(tags);

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
    parameters JSONB NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    transforms JSONB,
    mutations JSONB,
    condition TEXT,
    category VARCHAR(100) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    tags JSONB DEFAULT '[]'::jsonb,
    example_usage TEXT,
    requires_api_key BOOLEAN DEFAULT false,
    configuration_fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Tool template indexes
CREATE INDEX idx_tool_templates_category ON tool_templates(category);
CREATE INDEX idx_tool_templates_usage_count ON tool_templates(usage_count);
CREATE INDEX idx_tool_templates_tags ON tool_templates USING GIN(tags);

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
-- NOTE: WORKFLOWS, BLUEPRINTS, AND EXECUTIONS TABLES REMOVED
-- ============================================================================
-- These tables have been removed as no repository implementations exist for them.
-- If workflow functionality is needed in the future, repositories must be created first.
-- Previous blueprint storage used JSONB for nodes/edges within agent and tool blueprints.

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
-- ENVIRONMENTS TABLE
-- ============================================================================

CREATE TABLE environments (
    id VARCHAR(255) PRIMARY KEY,
    starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    encrypted_value TEXT NOT NULL,
    description VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    
    UNIQUE(starship_id, key)
);

-- Environment indexes
CREATE INDEX idx_environments_starship_id ON environments(starship_id);
CREATE INDEX idx_environments_key ON environments(key);
CREATE INDEX idx_environments_created_by ON environments(created_by);

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
CREATE INDEX idx_agent_templates_search ON agent_templates USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_messages_search ON messages USING GIN(to_tsvector('english', content));
CREATE INDEX idx_users_search ON users USING GIN(to_tsvector('english', COALESCE(display_name, '') || ' ' || COALESCE(email, '')));
CREATE INDEX idx_starships_search ON starships USING GIN(to_tsvector('english', name || ' ' || COALESCE(slug, '')));
CREATE INDEX idx_tools_search ON tools USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_tool_templates_search ON tool_templates USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- ============================================================================
-- NOTE: Triggers removed for simplicity
-- Application code will handle updated_at timestamps manually
-- ============================================================================

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE users IS 'User accounts with authentication and billing information';
COMMENT ON TABLE starships IS 'Starships owned by users with configuration and billing details';
COMMENT ON TABLE agent_templates IS 'Reusable agent templates from the marketplace';
COMMENT ON TABLE agents IS 'Deployed agent instances associated with starships';
COMMENT ON TABLE tool_templates IS 'Reusable tool templates from the marketplace';
COMMENT ON TABLE tools IS 'Deployed tool instances associated with starships';
COMMENT ON TABLE conversations IS 'Chat conversations within starships';
COMMENT ON TABLE messages IS 'Individual messages within conversations';
COMMENT ON TABLE environments IS 'Environment variables scoped to starships with encryption';
COMMENT ON TABLE usage IS 'LLM usage tracking for billing and analytics';
COMMENT ON TABLE waitlist IS 'User waitlist for controlled access';
COMMENT ON TABLE stripe_events IS 'Stripe webhook events for payment processing';
COMMENT ON TABLE agent_tools IS 'Many-to-many relationship between agents and tools';
COMMENT ON TABLE agent_template_tool_templates IS 'Many-to-many relationship between agent templates and tool templates';
COMMENT ON TABLE conversation_agents IS 'Many-to-many relationship between conversations and agents';