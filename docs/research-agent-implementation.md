# Research Agent with Wikipedia Tool - Robust Implementation Plan

## Overview
Implementation of a Research Agent that leverages Wikipedia for comprehensive information retrieval. The agent will be extensible to support additional research tools in the future.

## Architecture Overview

### System Components
1. **Wikipedia Tool** - A tool blueprint that executes Wikipedia API queries
2. **Research Agent** - An agent template with conversation state and tool access
3. **Tool Execution** - Uses the `code` node type to run JavaScript with the wikipedia npm package
4. **Error Handling** - Comprehensive error handling for API failures and edge cases

## Detailed Implementation

### Phase 1: Core Implementation

#### 1.1 Add Wikipedia Package Dependency
**File**: `packages/autopilot/package.json`

```bash
# Run in packages/autopilot directory
pnpm add wikipedia
```

This will add:
```json
{
  "dependencies": {
    "wikipedia": "^2.1.2"
  }
}
```

#### 1.2 Create Wikipedia Tool Definition
**File**: `packages/models/src/seeders/tools/wikipedia.ts`

```typescript
import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Wikipedia Tool Definition
 * Comprehensive Wikipedia search and content retrieval tool
 */
export const wikipediaTool: ToolParams = {
  name: 'wikipedia_search',
  description: 'Search and retrieve comprehensive information from Wikipedia',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query or exact page title for Wikipedia'
      },
      action: {
        type: 'string',
        enum: ['search', 'summary', 'content', 'sections'],
        description: 'Type of operation: search (find articles), summary (quick overview), content (full article), sections (article structure)'
      },
      limit: {
        type: 'number',
        description: 'Number of search results to return (1-10, default 5)',
        minimum: 1,
        maximum: 10,
        default: 5
      },
      language: {
        type: 'string',
        description: 'Wikipedia language code (e.g., "en", "es", "fr", default "en")',
        default: 'en'
      }
    },
    required: ['query', 'action']
  },
  blueprint: {
    nodes: [
      { 
        ref: 'start_1', 
        type: 'start', 
        name: 'Start', 
        description: 'Receive Wikipedia query parameters', 
        parameters: {} 
      },
      {
        ref: 'wiki_query',
        type: 'code',
        name: 'Wikipedia Query Execution',
        description: 'Execute Wikipedia API query based on action type',
        parameters: {
          code: `
            // Wikipedia tool implementation with comprehensive error handling
            const wiki = require('wikipedia');
            
            // Validate and extract input parameters
            if (!input || typeof input !== 'object') {
              throw new Error('Invalid input: expected object with query and action');
            }
            
            const { 
              query, 
              action, 
              limit = 5, 
              language = 'en' 
            } = input;
            
            // Input validation
            if (!query || typeof query !== 'string') {
              throw new Error('Query is required and must be a string');
            }
            
            if (!action || !['search', 'summary', 'content', 'sections'].includes(action)) {
              throw new Error('Action must be one of: search, summary, content, sections');
            }
            
            // Set language for Wikipedia API
            wiki.setLang(language);
            
            try {
              let result;
              const timestamp = new Date().toISOString();
              
              switch(action) {
                case 'search':
                  // Search for articles matching the query
                  const searchOptions = {
                    suggestion: true,
                    limit: Math.min(Math.max(1, limit), 10)
                  };
                  
                  const searchResults = await wiki.search(query, searchOptions);
                  
                  result = {
                    action: 'search',
                    query: query,
                    language: language,
                    timestamp: timestamp,
                    totalResults: searchResults.results ? searchResults.results.length : 0,
                    suggestion: searchResults.suggestion || null,
                    results: searchResults.results ? searchResults.results.map(r => ({
                      title: r.title,
                      pageid: r.pageid,
                      size: r.size || null,
                      wordcount: r.wordcount || null,
                      snippet: r.snippet ? r.snippet.replace(/<[^>]*>/g, '') : null, // Strip HTML
                      timestamp: r.timestamp || null
                    })) : []
                  };
                  break;
                  
                case 'summary':
                  // Get article summary with metadata
                  try {
                    const page = await wiki.page(query);
                    const summary = await page.summary();
                    
                    // Get additional useful data
                    let relatedPages = [];
                    try {
                      const related = await page.related();
                      relatedPages = related.slice(0, 5).map(r => r.title);
                    } catch (e) {
                      // Related pages might not be available
                    }
                    
                    result = {
                      action: 'summary',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: true,
                      title: summary.title,
                      displayTitle: summary.displaytitle || summary.title,
                      pageId: summary.pageid,
                      extract: summary.extract,
                      description: summary.description || null,
                      url: summary.content_urls?.desktop?.page || null,
                      mobileUrl: summary.content_urls?.mobile?.page || null,
                      thumbnail: summary.thumbnail ? {
                        source: summary.thumbnail.source,
                        width: summary.thumbnail.width,
                        height: summary.thumbnail.height
                      } : null,
                      coordinates: summary.coordinates || null,
                      lastRevisionId: summary.revision || null,
                      relatedPages: relatedPages
                    };
                  } catch (pageError) {
                    // Page not found or disambiguation page
                    result = {
                      action: 'summary',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: false,
                      error: 'Page not found or is a disambiguation page',
                      suggestion: 'Try using the search action first to find exact page titles'
                    };
                  }
                  break;
                  
                case 'content':
                  // Get full article content with sections
                  try {
                    const page = await wiki.page(query);
                    const [contentText, categories, references, images] = await Promise.all([
                      page.content().catch(() => null),
                      page.categories().catch(() => []),
                      page.references().catch(() => []),
                      page.images().catch(() => [])
                    ]);
                    
                    // Get page info
                    const info = await page.info().catch(() => ({}));
                    
                    result = {
                      action: 'content',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: true,
                      title: page.title,
                      fullUrl: page.fullurl,
                      content: contentText ? (contentText.length > 50000 
                        ? contentText.substring(0, 50000) + '... [content truncated]'
                        : contentText) : 'Content not available',
                      contentLength: contentText ? contentText.length : 0,
                      categories: categories.slice(0, 20), // Limit categories
                      references: references.slice(0, 15).map(ref => ({
                        title: ref.title || 'Unknown',
                        url: ref.url || null
                      })),
                      images: images.slice(0, 10), // Limit images
                      lastModified: info.touched || null,
                      watchers: info.watchers || null
                    };
                  } catch (pageError) {
                    result = {
                      action: 'content',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: false,
                      error: 'Failed to retrieve content: ' + pageError.message
                    };
                  }
                  break;
                  
                case 'sections':
                  // Get article sections for navigation
                  try {
                    const page = await wiki.page(query);
                    const summary = await page.summary();
                    
                    // Wikipedia.js doesn't have direct section support
                    // Parse content to extract sections
                    const content = await page.content();
                    const sections = [];
                    
                    // Extract section headers from content
                    const sectionRegex = /^(=+)\\s*(.+?)\\s*\\1$/gm;
                    let match;
                    let lastIndex = 0;
                    
                    while ((match = sectionRegex.exec(content)) !== null) {
                      const level = match[1].length;
                      const title = match[2];
                      const startIndex = match.index;
                      
                      // Add previous section content
                      if (sections.length > 0) {
                        const prevSection = sections[sections.length - 1];
                        prevSection.content = content.substring(lastIndex, startIndex).trim();
                        if (prevSection.content.length > 500) {
                          prevSection.content = prevSection.content.substring(0, 500) + '...';
                        }
                      }
                      
                      sections.push({
                        title: title,
                        level: level,
                        index: sections.length,
                        content: '' // Will be filled with next iteration or at end
                      });
                      
                      lastIndex = startIndex + match[0].length;
                    }
                    
                    // Add content for last section
                    if (sections.length > 0 && lastIndex < content.length) {
                      const lastSection = sections[sections.length - 1];
                      lastSection.content = content.substring(lastIndex).trim();
                      if (lastSection.content.length > 500) {
                        lastSection.content = lastSection.content.substring(0, 500) + '...';
                      }
                    }
                    
                    // Add introduction if exists
                    if (sections.length === 0 || sectionRegex.exec(content) === null) {
                      sections.unshift({
                        title: 'Introduction',
                        level: 1,
                        index: 0,
                        content: content.substring(0, Math.min(500, content.length)) + 
                          (content.length > 500 ? '...' : '')
                      });
                    }
                    
                    result = {
                      action: 'sections',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: true,
                      title: summary.title,
                      url: summary.content_urls?.desktop?.page || null,
                      totalSections: sections.length,
                      sections: sections.slice(0, 30) // Limit sections returned
                    };
                  } catch (pageError) {
                    result = {
                      action: 'sections',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: false,
                      error: 'Failed to retrieve sections: ' + pageError.message
                    };
                  }
                  break;
                  
                default:
                  throw new Error('Unknown action: ' + action);
              }
              
              return result;
              
            } catch (error) {
              // Comprehensive error handling
              const errorMessage = error.message || 'Unknown error occurred';
              const errorDetails = {
                action: action,
                query: query,
                language: language,
                error: errorMessage,
                timestamp: new Date().toISOString(),
                type: 'wikipedia_tool_error'
              };
              
              // Check for specific error types
              if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('network')) {
                errorDetails.error = 'Network error: Unable to connect to Wikipedia';
                errorDetails.suggestion = 'Check internet connection';
              } else if (errorMessage.includes('404') || errorMessage.includes('Not found')) {
                errorDetails.error = 'Page not found';
                errorDetails.suggestion = 'Try searching for the topic first';
              } else if (errorMessage.includes('timeout')) {
                errorDetails.error = 'Request timed out';
                errorDetails.suggestion = 'Try again or use a more specific query';
              }
              
              return errorDetails;
            }
          `,
          timeout: 30000, // 30 second timeout for Wikipedia requests
        },
      },
      { 
        ref: 'end_1', 
        type: 'end', 
        name: 'End', 
        description: 'Return Wikipedia query results', 
        parameters: { 
          output: '{{ $input() }}' // Pass through the result from code node
        } 
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'wiki_query' },
      { ref: 'e2', from: 'wiki_query', to: 'end_1' },
    ],
    metadata: {
      version: '1.0.0',
      author: 'Starships.ai',
      requiresApiKey: false,
      rateLimit: '200 requests per hour per IP (Wikipedia API limit)'
    },
  },
};

/**
 * Wikipedia Tool Template Configuration
 * Template metadata for the tool registry
 */
export const wikipediaToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: wikipediaTool.name,
  description: wikipediaTool.description,
  parameters: wikipediaTool.parameters,
  blueprint: wikipediaTool.blueprint,

  // Template metadata
  slug: 'wikipedia-search',
  category: 'research',
  exampleUsage: JSON.stringify({
    search: { name: 'wikipedia_search', arguments: { query: 'artificial intelligence', action: 'search' } },
    summary: { name: 'wikipedia_search', arguments: { query: 'Machine learning', action: 'summary' } },
    content: { name: 'wikipedia_search', arguments: { query: 'Deep learning', action: 'content' } },
    sections: { name: 'wikipedia_search', arguments: { query: 'Neural network', action: 'sections' } }
  }, null, 2),
  requiresApiKey: false,
  configurationFields: [
    {
      name: 'defaultLanguage',
      label: 'Default Language',
      type: 'select',
      defaultValue: 'en',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Spanish', value: 'es' },
        { label: 'French', value: 'fr' },
        { label: 'German', value: 'de' },
        { label: 'Italian', value: 'it' },
        { label: 'Portuguese', value: 'pt' },
        { label: 'Russian', value: 'ru' },
        { label: 'Chinese', value: 'zh' },
        { label: 'Japanese', value: 'ja' },
        { label: 'Arabic', value: 'ar' }
      ],
      required: false
    },
    {
      name: 'maxResultsLimit',
      label: 'Max Search Results',
      type: 'number',
      defaultValue: 5,
      min: 1,
      max: 10,
      required: false
    }
  ],
};
```

#### 1.3 Update Tool Index
**File**: `packages/models/src/seeders/tools/index.ts`

```typescript
/**
 * Tool Templates Index
 * Exports all tool templates from individual files
 */

export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';
export { wikipediaToolTemplate, wikipediaTool } from './wikipedia'; // Add both exports

// Re-export all tool templates as a single array for convenience
import { calculatorToolTemplate } from './calculator';
import { timeToolTemplate } from './time';
import { echoToolTemplate } from './echo';
import { wikipediaToolTemplate } from './wikipedia';

export const ALL_TOOL_TEMPLATES = [
  calculatorToolTemplate, 
  timeToolTemplate, 
  echoToolTemplate,
  wikipediaToolTemplate // Add here
];
```

#### 1.4 Create Research Agent Template
**File**: `packages/models/src/seeders/agents/research.ts`

```typescript
import { Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';
import { wikipediaTool } from '../tools/wikipedia';

/**
 * Create Research Agent blueprint using Agent class
 */
function createResearchBlueprint() {
  const agent = new Agent({
    name: 'Research Assistant',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.3,
    maxTokens: 4000,
    state: {
      messages: [],
      tools: [wikipediaTool]
    }
  });

  return agent.getCurrentBlueprint();
}

/**
 * Create Research-specific configuration
 */
function createResearchConfig() {
  return {
    systemPrompt: `You are an expert research assistant specializing in finding and synthesizing information from Wikipedia.

## Your Capabilities:
- **Search**: Find relevant Wikipedia articles on any topic
- **Summary**: Get quick overviews with key information
- **Content**: Retrieve comprehensive article text with references
- **Sections**: Navigate article structure for specific information

## Research Process:
1. **Initial Search**: When a user asks about a topic, start with a search to find relevant articles
2. **Summary Review**: Get summaries of promising articles to assess relevance
3. **Deep Dive**: Retrieve full content for detailed information when needed
4. **Section Navigation**: Use sections to find specific information in long articles

## Guidelines:
- Always start with a search if the user's query is broad or ambiguous
- Use exact page titles when possible for better results
- Provide Wikipedia URLs for all information so users can verify
- Mention if information might be outdated (check last modified dates)
- For controversial topics, note if Wikipedia indicates disputed neutrality
- Synthesize information from multiple articles for comprehensive answers
- Be clear about what you found vs. what you're inferring
- If no relevant information is found, suggest alternative search terms

## Response Format:
- Start with a brief answer to the user's question
- Provide detailed information organized by subtopics
- Include relevant quotes with proper context
- End with Wikipedia sources and related topics to explore
- Use markdown formatting for better readability

## Language Support:
- Default to English Wikipedia
- Switch languages if the user asks about non-English topics
- Note when better information might be available in other languages

## Error Handling:
- If a page isn't found, search for related terms
- If content is too long, focus on most relevant sections
- If network errors occur, explain and suggest retry

Remember: You're a research assistant, not just a Wikipedia reader. Synthesize, analyze, and present information in the most helpful way for the user's specific needs.`,
    state: {
      messages: [],
      tools: [wikipediaTool]
    }
  };
}

/**
 * Research Agent Template
 */
export const researchTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Research Assistant',
  slug: 'research-assistant',
  description: 'Expert research agent that searches Wikipedia for comprehensive, accurate information on any topic with citations and sources.',
  category: 'analysis',
  
  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.3, // Lower temperature for factual accuracy
  maxTokens: 4000, // Higher token limit for detailed research
  
  icon: '🔬',
  previewPrompts: [
    'Tell me about the history of quantum computing',
    'What are the main causes of climate change?',
    'Explain how CRISPR gene editing works',
    'Research the economic impact of artificial intelligence',
    'What were the key events of the French Revolution?',
    'How do vaccines work and why are they important?'
  ],
  blueprint: createResearchBlueprint(),
  ...createResearchConfig(),
  timeout: 90000, // 90 seconds for complex research tasks
};
```

#### 1.5 Register Agent in Seeders
**File**: `packages/models/src/seeders/agents/index.ts`

```typescript
/**
 * Agent Templates Index
 * Exports all agent templates from individual files
 */

export { sybilTemplate } from './sybil';
export { gaiaTemplate } from './gaia';
export { researchTemplate } from './research'; // Add export

// Re-export all agent templates as a single array for convenience
import { sybilTemplate } from './sybil';
import { gaiaTemplate } from './gaia';
import { researchTemplate } from './research'; // Add import

export const ALL_AGENT_TEMPLATES = [
  sybilTemplate, 
  gaiaTemplate,
  researchTemplate // Add to array
];
```

### Phase 2: Testing Implementation

#### 2.1 Create Integration Test
**File**: `packages/autopilot/src/__tests__/WikipediaTool.test.ts`

```typescript
import { Tool } from '../nodes/Tool';
import { wikipediaTool } from '@starships/models/seeders/tools/wikipedia';
import { ExecutionItemUtils } from '../utils/ExecutionItemUtils';
import { NodeHandlerOptions } from '../types/node-handler';

describe('Wikipedia Tool', () => {
  let toolNode: Tool;
  
  beforeEach(() => {
    const options: NodeHandlerOptions = {
      eventCallback: async (event) => {
        console.log('Event:', event.type);
      }
    };
    
    toolNode = new Tool(wikipediaTool, options);
  });

  describe('Search Action', () => {
    test('should search for articles successfully', async () => {
      const input = ExecutionItemUtils.wrapSingle({
        query: 'artificial intelligence',
        action: 'search',
        limit: 3
      });
      
      const result = await toolNode.execute(input);
      const data = ExecutionItemUtils.unwrapSingle(result);
      
      expect(data).toBeDefined();
      expect(data.action).toBe('search');
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBeLessThanOrEqual(3);
    }, 30000);
    
    test('should handle search with no results', async () => {
      const input = ExecutionItemUtils.wrapSingle({
        query: 'xyzabc123nonexistent',
        action: 'search'
      });
      
      const result = await toolNode.execute(input);
      const data = ExecutionItemUtils.unwrapSingle(result);
      
      expect(data).toBeDefined();
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(0);
    }, 30000);
  });

  describe('Summary Action', () => {
    test('should get article summary successfully', async () => {
      const input = ExecutionItemUtils.wrapSingle({
        query: 'Machine learning',
        action: 'summary'
      });
      
      const result = await toolNode.execute(input);
      const data = ExecutionItemUtils.unwrapSingle(result);
      
      expect(data).toBeDefined();
      expect(data.action).toBe('summary');
      expect(data.title).toBeDefined();
      expect(data.extract).toBeDefined();
      expect(data.url).toContain('wikipedia.org');
    }, 30000);
    
    test('should handle non-existent page', async () => {
      const input = ExecutionItemUtils.wrapSingle({
        query: 'Nonexistent12345Page',
        action: 'summary'
      });
      
      const result = await toolNode.execute(input);
      const data = ExecutionItemUtils.unwrapSingle(result);
      
      expect(data).toBeDefined();
      expect(data.found).toBe(false);
      expect(data.error).toBeDefined();
    }, 30000);
  });

  describe('Validation', () => {
    test('should validate tool configuration', () => {
      const validation = toolNode.validate();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });
  });
});
```

#### 2.2 Create Example Usage Script
**File**: `packages/autopilot/src/examples/research-agent-example.ts`

```typescript
import { Agent, autopilot, ExecutionItemUtils } from '../index';
import { wikipediaTool } from '@starships/models/seeders/tools/wikipedia';

// Configure credentials
autopilot.setCredentials({
  openrouterApiKey: process.env.OPENROUTER_API_KEY || 'your-key-here'
});

/**
 * Example: Research Agent with Wikipedia
 */
async function demonstrateResearchAgent() {
  console.log('=== Research Agent Demo ===\n');

  // Create research agent
  const agent = new Agent({
    name: 'Research Assistant',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.3,
    systemPrompt: `You are a knowledgeable research assistant with access to Wikipedia.
    When users ask questions, use the wikipedia_search tool to find accurate information.
    Always cite your sources with Wikipedia URLs.`,
    state: {
      messages: [],
      tools: [wikipediaTool]
    }
  });

  // Test queries
  const queries = [
    'What is quantum computing and how does it work?',
    'Tell me about the history of the Internet',
    'Explain the process of photosynthesis',
    'What are the main theories about dark matter?'
  ];

  for (const query of queries) {
    console.log(`\n📝 Query: "${query}"\n`);
    console.log('Researching...\n');
    
    try {
      const result = await agent.execute(
        ExecutionItemUtils.wrapSingle(query)
      );
      
      const response = ExecutionItemUtils.unwrapSingle(result);
      console.log('📊 Response:', response);
      console.log('\n' + '='.repeat(80));
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

/**
 * Example: Direct Wikipedia Tool Usage
 */
async function demonstrateDirectToolUsage() {
  console.log('\n=== Direct Wikipedia Tool Usage ===\n');
  
  const { Tool } = await import('../nodes/Tool');
  const tool = new Tool(wikipediaTool);
  
  // Example 1: Search
  console.log('1. Searching for "artificial intelligence"...');
  let result = await tool.execute(
    ExecutionItemUtils.wrapSingle({
      query: 'artificial intelligence',
      action: 'search',
      limit: 3
    })
  );
  console.log('Search Results:', JSON.stringify(ExecutionItemUtils.unwrapSingle(result), null, 2));
  
  // Example 2: Get Summary
  console.log('\n2. Getting summary for "Machine learning"...');
  result = await tool.execute(
    ExecutionItemUtils.wrapSingle({
      query: 'Machine learning',
      action: 'summary'
    })
  );
  const summary = ExecutionItemUtils.unwrapSingle(result);
  console.log('Summary:', summary.extract ? summary.extract.substring(0, 200) + '...' : 'Not found');
  console.log('URL:', summary.url);
  
  // Example 3: Get Sections
  console.log('\n3. Getting sections for "Deep learning"...');
  result = await tool.execute(
    ExecutionItemUtils.wrapSingle({
      query: 'Deep learning',
      action: 'sections'
    })
  );
  const sections = ExecutionItemUtils.unwrapSingle(result);
  console.log('Sections found:', sections.totalSections);
  if (sections.sections) {
    sections.sections.slice(0, 5).forEach(s => {
      console.log(`  - ${s.title} (Level ${s.level})`);
    });
  }
}

/**
 * Example: Multi-turn Conversation
 */
async function demonstrateConversation() {
  console.log('\n=== Multi-turn Research Conversation ===\n');
  
  const agent = new Agent({
    name: 'Research Assistant',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.3,
    state: {
      messages: [],
      tools: [wikipediaTool]
    }
  });

  const conversation = [
    'What is CRISPR?',
    'How is it used in medicine?',
    'What are the ethical concerns?',
    'Can you give me more details about gene drives?'
  ];

  for (const message of conversation) {
    console.log(`\n👤 User: ${message}`);
    const result = await agent.execute(ExecutionItemUtils.wrapSingle(message));
    const response = ExecutionItemUtils.unwrapSingle(result);
    console.log(`🤖 Assistant: ${response}`);
  }
}

// Run demonstrations
async function runAllDemos() {
  try {
    await demonstrateDirectToolUsage();
    await demonstrateResearchAgent();
    await demonstrateConversation();
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Export for testing
export {
  demonstrateResearchAgent,
  demonstrateDirectToolUsage,
  demonstrateConversation,
  runAllDemos
};

// Run if executed directly
if (require.main === module) {
  runAllDemos().catch(console.error);
}
```

### Phase 3: Database Setup

#### 3.1 Create Database Migration Script
**File**: `packages/models/src/scripts/seed-research-agent.ts`

```typescript
#!/usr/bin/env node
import { getConnection } from '../helpers/database';
import { AgentTemplateRepository } from '../repositories/AgentTemplateRepository';
import { ToolTemplateRepository } from '../repositories/ToolTemplateRepository';
import { researchTemplate } from '../seeders/agents/research';
import { wikipediaToolTemplate } from '../seeders/tools/wikipedia';

/**
 * Seed Research Agent and Wikipedia Tool to database
 */
async function seedResearchAgent() {
  console.log('🔬 Seeding Research Agent and Wikipedia Tool...\n');
  
  const conn = await getConnection();
  const agentRepo = new AgentTemplateRepository(conn);
  const toolRepo = new ToolTemplateRepository(conn);
  
  try {
    // Seed Wikipedia Tool
    console.log('📚 Creating Wikipedia tool template...');
    const existingTool = await toolRepo.findBySlug('wikipedia-search');
    
    if (existingTool) {
      console.log('  ✓ Wikipedia tool already exists');
    } else {
      const tool = await toolRepo.create(wikipediaToolTemplate);
      console.log('  ✓ Wikipedia tool created:', tool.id);
    }
    
    // Seed Research Agent
    console.log('\n🔬 Creating Research agent template...');
    const existingAgent = await agentRepo.findBySlug('research-assistant');
    
    if (existingAgent) {
      console.log('  ✓ Research agent already exists');
    } else {
      const agent = await agentRepo.create(researchTemplate);
      console.log('  ✓ Research agent created:', agent.id);
    }
    
    console.log('\n✅ Seeding completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  } finally {
    await conn.close();
  }
}

// Run if executed directly
if (require.main === module) {
  seedResearchAgent()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedResearchAgent };
```

#### 3.2 Update Package Scripts
**File**: `packages/models/package.json`

Add to scripts section:
```json
{
  "scripts": {
    "seed:research": "tsx src/scripts/seed-research-agent.ts"
  }
}
```

### Phase 4: Commands to Execute

```bash
# 1. Install Wikipedia package
cd packages/autopilot
pnpm add wikipedia

# 2. Run tests
cd packages/autopilot
pnpm test WikipediaTool

# 3. Seed database
cd packages/models
pnpm seed:research

# 4. Test the example
cd packages/autopilot
OPENROUTER_API_KEY=your-key node -r tsx src/examples/research-agent-example.ts
```

## Error Handling Matrix

| Error Type | Handling Strategy | User Message |
|------------|------------------|--------------|
| Network Error | Retry with exponential backoff | "Unable to connect to Wikipedia. Please try again." |
| Page Not Found | Suggest search action | "Article not found. Try searching for related topics." |
| Disambiguation | List options | "Multiple articles found. Please be more specific." |
| Rate Limit | Queue and delay | "Too many requests. Please wait a moment." |
| Parse Error | Fallback to summary | "Unable to parse full content, showing summary instead." |
| Language Not Supported | Default to English | "Language not available, using English Wikipedia." |

## Performance Considerations

1. **Caching**: Consider implementing Redis cache for frequently accessed pages
2. **Rate Limiting**: Wikipedia allows ~200 requests/hour per IP
3. **Content Size**: Truncate content at 50KB to prevent memory issues
4. **Timeout**: 30-second timeout for all Wikipedia requests
5. **Parallel Requests**: Limit concurrent requests to avoid rate limits

## Security Considerations

1. **Input Sanitization**: All user queries are sanitized before API calls
2. **Code Execution**: Runs in sandboxed `code` node environment
3. **No Credentials**: Wikipedia API doesn't require authentication
4. **Content Filtering**: HTML tags stripped from responses
5. **Error Messages**: Sanitized to prevent information leakage

## Future Enhancements

1. **Additional Sources**:
   - arXiv for academic papers
   - PubMed for medical research
   - News APIs for current events
   - GitHub for code documentation

2. **Advanced Features**:
   - Multi-language search across Wikipedias
   - Citation formatting (APA, MLA, Chicago)
   - Fact verification across sources
   - PDF generation of research reports

3. **Optimizations**:
   - Implement caching layer
   - Batch API requests
   - Progressive loading for large articles
   - Search result ranking

## Success Metrics

- [ ] Tool executes all 4 actions successfully
- [ ] Agent appears in UI selector
- [ ] Conversations maintain context
- [ ] Error handling works properly
- [ ] Response time < 5 seconds
- [ ] Accurate information with citations
- [ ] Tests pass with >90% coverage

## Deployment Checklist

- [ ] Install wikipedia npm package
- [ ] Create tool and agent files
- [ ] Update index files
- [ ] Run tests
- [ ] Seed database
- [ ] Test in UI
- [ ] Document API usage
- [ ] Monitor performance
- [ ] Set up error tracking