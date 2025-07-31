// Seed default MCP Server Options
// This migration creates commonly used MCP server configurations

// GitHub MCP Server
MERGE (m:MCPServerOption {name: 'GitHub'})
SET m.id = 'github-' + randomUUID(),
    m.command = 'docker',
    m.args = ['run', '-i', '--rm', 'mcp/github'],
    m.env = '{"GITHUB_PERSONAL_ACCESS_TOKEN":"Your GitHub Personal Access Token"}';

// Puppeteer MCP Server
MERGE (m:MCPServerOption {name: 'Puppeteer'})
SET m.id = 'puppeteer-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-puppeteer'],
    m.env = '{}';

// SQLite MCP Server
MERGE (m:MCPServerOption {name: 'SQLite'})
SET m.id = 'sqlite-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
    m.env = '{}';

// PostgreSQL MCP Server
MERGE (m:MCPServerOption {name: 'PostgreSQL'})
SET m.id = 'postgresql-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-postgres'],
    m.env = '{"POSTGRES_CONNECTION_STRING":"postgresql://user:password@localhost:5432/database"}';

// Brave Search MCP Server
MERGE (m:MCPServerOption {name: 'Brave Search'})
SET m.id = 'brave-search-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-brave-search'],
    m.env = '{"BRAVE_API_KEY":"Your Brave Search API Key"}';

// Google Drive MCP Server
MERGE (m:MCPServerOption {name: 'Google Drive'})
SET m.id = 'gdrive-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-gdrive'],
    m.env = '{"GOOGLE_CLIENT_ID":"Your Google Client ID","GOOGLE_CLIENT_SECRET":"Your Google Client Secret"}';

// Slack MCP Server
MERGE (m:MCPServerOption {name: 'Slack'})
SET m.id = 'slack-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-slack'],
    m.env = '{"SLACK_BOT_TOKEN":"Your Slack Bot Token"}';

// Everything MCP Server
MERGE (m:MCPServerOption {name: 'Everything'})
SET m.id = 'everything-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-everything'],
    m.env = '{}';

// Fetch MCP Server
MERGE (m:MCPServerOption {name: 'Fetch'})
SET m.id = 'fetch-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-fetch'],
    m.env = '{}';

// Time MCP Server
MERGE (m:MCPServerOption {name: 'Time'})
SET m.id = 'time-' + randomUUID(),
    m.command = 'npx',
    m.args = ['-y', '@modelcontextprotocol/server-time'],
    m.env = '{}';

// Create index for better performance
CREATE INDEX mcp_server_name_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.name);
CREATE INDEX mcp_server_command_index IF NOT EXISTS FOR (m:MCPServerOption) ON (m.command);