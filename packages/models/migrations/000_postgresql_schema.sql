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
    email_verified BOOLEAN NOT NULL DEFAULT false,
    has_password BOOLEAN NOT NULL DEFAULT false,
    auth_methods TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    primary_auth_method VARCHAR(10) NOT NULL DEFAULT 'password' CHECK (primary_auth_method IN ('password', 'oauth')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX idx_users_email_verified ON users(email_verified);
CREATE INDEX idx_users_has_password ON users(has_password);
CREATE INDEX idx_users_auth_methods ON users USING GIN(auth_methods);
CREATE INDEX idx_users_primary_auth_method ON users(primary_auth_method);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ============================================================================
-- OAUTH ACCOUNTS TABLE
-- ============================================================================

CREATE TABLE oauth_accounts (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'github')),
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    profile_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate provider accounts
    UNIQUE(provider, provider_user_id)
);

-- OAuth accounts indexes
CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX idx_oauth_accounts_email ON oauth_accounts(email);

-- ============================================================================
-- OAUTH AUTHORIZATION CODES TABLE (for secure token exchange)
-- ============================================================================

CREATE TABLE oauth_auth_codes (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    code VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- OAuth authorization codes indexes
CREATE INDEX idx_oauth_auth_codes_code ON oauth_auth_codes(code) WHERE NOT consumed;
CREATE INDEX idx_oauth_auth_codes_expires_at ON oauth_auth_codes(expires_at);
CREATE INDEX idx_oauth_auth_codes_user_id ON oauth_auth_codes(user_id);

-- Note: OAuth cleanup is handled by OAuthAuthCodeRepository.cleanupExpiredCodes()

-- ============================================================================
-- STARSHIPS TABLE
-- ============================================================================

CREATE TABLE starships (
    id VARCHAR(255) PRIMARY KEY,
    slug VARCHAR(100) NOT NULL,
    owner_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    max_agents INTEGER NOT NULL DEFAULT 3,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(owner_id, slug)
);

-- Starship indexes
CREATE INDEX idx_starships_owner_id ON starships(owner_id);
CREATE INDEX idx_starships_status ON starships(status);
CREATE INDEX idx_starships_created_at ON starships(created_at);

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
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    system_prompt TEXT,
    model VARCHAR(100) NOT NULL,
    temperature DECIMAL(3,2),
    max_tokens INTEGER,
    timeout INTEGER NOT NULL DEFAULT 30000,
    state JSONB NOT NULL,
    blueprint JSONB NOT NULL,
    assigned_tool_slugs TEXT[] DEFAULT ARRAY[]::TEXT[],
    icon VARCHAR(10),
    preview_prompts TEXT[] DEFAULT ARRAY[]::TEXT[],
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
    state JSONB NOT NULL,
    blueprint JSONB NOT NULL,
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
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    transforms JSONB,
    mutations JSONB,
    condition TEXT,
    category VARCHAR(100) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    example_usage TEXT,
    requires_api_key BOOLEAN DEFAULT false,
    configuration_fields JSONB DEFAULT '{}'::jsonb,
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
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    blueprint JSONB NOT NULL DEFAULT '{}'::jsonb,
    transforms JSONB,
    mutations JSONB,
    condition TEXT,
    configuration JSONB DEFAULT '{}'::jsonb,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
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
    model VARCHAR(100),
    cost DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
    billed_at TIMESTAMP WITH TIME ZONE NULL,
    billed_ledger_id VARCHAR(255) NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Usage indexes
CREATE INDEX idx_usage_starship_id ON usage(starship_id);
CREATE INDEX idx_usage_conversation_id ON usage(conversation_id);
CREATE INDEX idx_usage_created_at ON usage(created_at);
CREATE INDEX idx_usage_model ON usage(model);
-- Composite indexes for owner-scoped queries and filters
CREATE INDEX idx_usage_starship_created_at ON usage(starship_id, created_at);
CREATE INDEX idx_usage_starship_model ON usage(starship_id, model);
-- Billing reconciliation indexes
CREATE INDEX idx_usage_billed_at ON usage(billed_at);
CREATE UNIQUE INDEX idx_usage_billed_ledger_unique ON usage(billed_ledger_id) WHERE billed_ledger_id IS NOT NULL;

-- ============================================================================
-- WALLETS TABLE
-- ============================================================================

CREATE TABLE wallets (
  id VARCHAR(255) PRIMARY KEY,
  starship_id VARCHAR(255) UNIQUE NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  balance DECIMAL(18,6) NOT NULL DEFAULT 0.000000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Wallets indexes
CREATE INDEX idx_wallets_created_at ON wallets(created_at);
CREATE INDEX idx_wallets_updated_at ON wallets(updated_at);
CREATE INDEX idx_wallets_currency ON wallets(currency);

-- ============================================================================
-- TOPUPS TABLE
-- ============================================================================

CREATE TABLE topups (
  id VARCHAR(255) PRIMARY KEY,
  wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount_usd DECIMAL(18,4) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  stripe_session_id VARCHAR(255),
  stripe_payment_intent VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  idempotency_key VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Topups indexes
CREATE INDEX idx_topups_wallet_id ON topups(wallet_id);
CREATE INDEX idx_topups_status ON topups(status);
CREATE INDEX idx_topups_created_at ON topups(created_at);
CREATE INDEX idx_topups_stripe_session_id ON topups(stripe_session_id);
CREATE UNIQUE INDEX idx_topups_idempotency_key_unique ON topups(idempotency_key);
CREATE INDEX idx_topups_stripe_payment_intent ON topups(stripe_payment_intent);
CREATE INDEX idx_topups_stripe_charge_id ON topups(stripe_charge_id);

-- ============================================================================
-- LEDGER ENTRIES TABLE
-- ============================================================================

CREATE TABLE ledger_entries (
  id VARCHAR(255) PRIMARY KEY,
  wallet_id VARCHAR(255) NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('TOPUP','USAGE','REFUND','ADJUSTMENT')),
  amount DECIMAL(18,6) NOT NULL,
  balance_after DECIMAL(18,6) NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ledger_wallet_created_at ON ledger_entries (wallet_id, created_at DESC);

-- Idempotency: One USAGE ledger per (wallet, usageId)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_usage_wallet_unique
ON ledger_entries (wallet_id, (meta->>'usageId'))
WHERE type = 'USAGE';

-- Helper index to accelerate scans by wallet+type
CREATE INDEX IF NOT EXISTS idx_ledger_wallet_type_created
ON ledger_entries (wallet_id, type, created_at DESC);

-- Link usage billed_ledger_id to ledger_entries (nullable)
ALTER TABLE usage
  ADD CONSTRAINT fk_usage_billed_ledger
  FOREIGN KEY (billed_ledger_id)
  REFERENCES ledger_entries(id)
  ON DELETE SET NULL;

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

COMMENT ON TABLE users IS 'User accounts with authentication';
COMMENT ON TABLE oauth_accounts IS 'OAuth account links - supports multiple providers per user';
COMMENT ON TABLE starships IS 'Starships owned by users with configuration';
COMMENT ON TABLE agent_templates IS 'Reusable agent templates from the marketplace';
COMMENT ON TABLE agents IS 'Deployed agent instances associated with starships';
COMMENT ON TABLE ledger_entries IS 'Immutable ledger of wallet mutations for auditing and balance tracking';
COMMENT ON TABLE tool_templates IS 'Reusable tool templates from the marketplace';
COMMENT ON TABLE tools IS 'Deployed tool instances associated with starships';
COMMENT ON TABLE conversations IS 'Chat conversations within starships';
COMMENT ON TABLE messages IS 'Individual messages within conversations';
COMMENT ON TABLE environments IS 'Environment variables scoped to starships with encryption';
COMMENT ON TABLE usage IS 'LLM usage tracking for billing and analytics';
COMMENT ON TABLE wallets IS 'Wallets for starships with currency and balance';
COMMENT ON TABLE topups IS 'Payment topup records for wallet funding via Stripe';
COMMENT ON TABLE waitlist IS 'User waitlist for controlled access';
COMMENT ON TABLE agent_tools IS 'Many-to-many relationship between agents and tools';
COMMENT ON TABLE agent_template_tool_templates IS 'Many-to-many relationship between agent templates and tool templates';
COMMENT ON TABLE conversation_agents IS 'Many-to-many relationship between conversations and agents';