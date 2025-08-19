// Migration: Add support for native LangChain tool API keys
// Description: Allows users to store API keys for native tools like Tavily, Brave Search, etc.
// Created: 2024-12-17

// Create NativeToolApiKey nodes for storing encrypted API keys
CREATE CONSTRAINT native_tool_api_key_unique IF NOT EXISTS
  FOR (k:NativeToolApiKey) 
  REQUIRE (k.starshipId, k.toolName) IS UNIQUE;

// Add index for faster lookups
CREATE INDEX native_tool_api_key_starship IF NOT EXISTS
  FOR (n:NativeToolApiKey) 
  ON (n.starshipId);

// Migration status
MERGE (m:Migration {id: '011_add_native_tool_api_keys'})
SET m.applied = datetime(),
    m.description = 'Add support for native LangChain tool API keys'
RETURN m;