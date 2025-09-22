# Research Agent with Wikipedia Tool - 6-Layer Architecture Implementation

## Overview
Implementation of a Research Agent with Wikipedia tool following the strict 6-layer architecture pattern established in the Starships.ai monorepo.

## Architecture Layers Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER (Layer 6)                         │
│  No changes needed - uses existing agent/conversation interfaces    │
└─────────────────────────────────────────────────────────────────────┘
                                    ↕ HTTP API calls
┌─────────────────────────────────────────────────────────────────────┐
│                   API ROUTES LAYER (Layer 5)                       │
│  No changes needed - existing routes handle agents/tools           │
└─────────────────────────────────────────────────────────────────────┘
                                    ↕ Service calls
┌─────────────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER (Layer 4)                          │
│  No changes needed - existing services handle templates            │
└─────────────────────────────────────────────────────────────────────┘
                                    ↕ Repository calls
┌─────────────────────────────────────────────────────────────────────┐
│                  REPOSITORY LAYER (Layer 3)                        │
│  No changes needed - existing repositories handle templates        │
└─────────────────────────────────────────────────────────────────────┘
                                    ↕ Entity transformation
┌─────────────────────────────────────────────────────────────────────┐
│                    ENTITY LAYER (Layer 2)                          │
│  No changes needed - ToolTemplateEntity already exists             │
└─────────────────────────────────────────────────────────────────────┘
                                    ↕ Type contracts
┌─────────────────────────────────────────────────────────────────────┐
│                   DOMAIN LAYER (Layer 1)                           │
│  No changes needed - ToolTemplateModel already defined             │
└─────────────────────────────────────────────────────────────────────┘

SEEDERS & TOOLS (Outside layers - Data initialization)
┌─────────────────────────────────────────────────────────────────────┐
│  packages/models/src/seeders/tools/wikipedia.ts  (NEW)             │
│  packages/models/src/seeders/agents/research.ts  (NEW)            │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Architecture Insights

Based on the 6-layer architecture:

1. **Tool Templates are already fully supported** - The architecture already has complete support for tool templates through all 6 layers
2. **Agent Templates are already fully supported** - The architecture already has complete support for agent templates through all 6 layers
3. **We only need to create seeders** - The Wikipedia tool and Research agent are just new data entries (seeders) that will be inserted into the existing architecture

## Implementation Plan (Following 6-Layer Architecture)

### Phase 1: Add Wikipedia NPM Package

#### 1.1 Add Dependency to Autopilot
**File**: `packages/autopilot/package.json`

```bash
cd packages/autopilot
pnpm add wikipedia
```

This is required because the `code` node type in blueprints will execute JavaScript that uses this package.

### Phase 2: Create Tool Template Seeder (Data Layer)

#### 2.1 Create Wikipedia Tool Template
**File**: `packages/models/src/seeders/tools/wikipedia.ts`

```typescript
import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Wikipedia Tool Definition
 * Comprehensive Wikipedia search and content retrieval tool
 * 
 * This follows the same pattern as calculator.ts, time.ts, echo.ts
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
            // Wikipedia tool implementation using the npm package
            const wiki = require('wikipedia');
            
            // Input validation
            if (!input || typeof input !== 'object') {
              throw new Error('Invalid input: expected object with query and action');
            }
            
            const { query, action, limit = 5, language = 'en' } = input;
            
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
                  const searchResults = await wiki.search(query, { 
                    suggestion: true, 
                    limit: Math.min(Math.max(1, limit), 10) 
                  });
                  
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
                      snippet: r.snippet ? r.snippet.replace(/<[^>]*>/g, '') : null
                    })) : []
                  };
                  break;
                  
                case 'summary':
                  try {
                    const page = await wiki.page(query);
                    const summary = await page.summary();
                    
                    result = {
                      action: 'summary',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: true,
                      title: summary.title,
                      extract: summary.extract,
                      description: summary.description || null,
                      url: summary.content_urls?.desktop?.page || null
                    };
                  } catch (pageError) {
                    result = {
                      action: 'summary',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: false,
                      error: 'Page not found or is a disambiguation page'
                    };
                  }
                  break;
                  
                case 'content':
                  try {
                    const page = await wiki.page(query);
                    const content = await page.content();
                    
                    result = {
                      action: 'content',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: true,
                      title: page.title,
                      content: content ? (content.length > 50000 
                        ? content.substring(0, 50000) + '... [truncated]'
                        : content) : 'Content not available',
                      contentLength: content ? content.length : 0
                    };
                  } catch (pageError) {
                    result = {
                      action: 'content',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: false,
                      error: 'Failed to retrieve content'
                    };
                  }
                  break;
                  
                case 'sections':
                  try {
                    const page = await wiki.page(query);
                    const content = await page.content();
                    const sections = [];
                    
                    // Simple section extraction
                    const lines = content.split('\\n');
                    lines.forEach(line => {
                      if (line.startsWith('==')) {
                        const level = line.match(/^=+/)[0].length;
                        const title = line.replace(/^=+|=+$/g, '').trim();
                        sections.push({ title, level });
                      }
                    });
                    
                    result = {
                      action: 'sections',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: true,
                      sections: sections.slice(0, 30)
                    };
                  } catch (pageError) {
                    result = {
                      action: 'sections',
                      query: query,
                      language: language,
                      timestamp: timestamp,
                      found: false,
                      error: 'Failed to retrieve sections'
                    };
                  }
                  break;
              }
              
              return result;
              
            } catch (error) {
              return {
                action: action,
                query: query,
                language: language,
                error: error.message || 'Unknown error',
                timestamp: new Date().toISOString()
              };
            }
          `,
          timeout: 30000
        }
      },
      { 
        ref: 'end_1', 
        type: 'end', 
        name: 'End', 
        description: 'Return Wikipedia query results', 
        parameters: { 
          output: '{{ $input() }}'
        } 
      }
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'wiki_query' },
      { ref: 'e2', from: 'wiki_query', to: 'end_1' }
    ],
    metadata: {}
  }
};

/**
 * Wikipedia Tool Template Configuration
 * This follows the ToolTemplateModel interface from protocol layer
 */
export const wikipediaToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: wikipediaTool.name,
  description: wikipediaTool.description,
  parameters: wikipediaTool.parameters,
  blueprint: wikipediaTool.blueprint,

  // Template metadata (required by ToolTemplateModel)
  slug: 'wikipedia-search',
  category: 'research' as const,
  exampleUsage: JSON.stringify({
    search: { name: 'wikipedia_search', arguments: { query: 'artificial intelligence', action: 'search' } },
    summary: { name: 'wikipedia_search', arguments: { query: 'Machine learning', action: 'summary' } }
  }, null, 2),
  requiresApiKey: false,
  configurationFields: []
};
```

#### 2.2 Update Tool Index
**File**: `packages/models/src/seeders/tools/index.ts`

```typescript
// Add imports
export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';
export { wikipediaToolTemplate, wikipediaTool } from './wikipedia'; // NEW

// Update array
import { calculatorToolTemplate } from './calculator';
import { timeToolTemplate } from './time';
import { echoToolTemplate } from './echo';
import { wikipediaToolTemplate } from './wikipedia'; // NEW

export const ALL_TOOL_TEMPLATES = [
  calculatorToolTemplate, 
  timeToolTemplate, 
  echoToolTemplate,
  wikipediaToolTemplate // NEW
];
```

### Phase 3: Create Agent Template Seeder (Data Layer)

#### 3.1 Create Research Agent Template
**File**: `packages/models/src/seeders/agents/research.ts`

```typescript
import { Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';
import { wikipediaTool } from '../tools/wikipedia';

/**
 * Create Research Agent blueprint using Agent class
 * This follows the same pattern as gaia.ts and sybil.ts
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
- **Content**: Retrieve comprehensive article text
- **Sections**: Navigate article structure for specific information

## Research Process:
1. When a user asks about a topic, start with a search to find relevant articles
2. Use summary for quick overviews
3. Use content for detailed information when needed
4. Use sections to navigate long articles

## Guidelines:
- Always start with a search if the query is broad
- Use exact page titles when possible for better results
- Provide Wikipedia URLs for all information
- Synthesize information from multiple searches when needed
- Be clear about what you found vs. what you're inferring

## Response Format:
- Start with a brief answer
- Provide detailed information organized by subtopics
- Include Wikipedia sources and URLs
- Use markdown formatting for readability`,
    state: {
      messages: [],
      tools: [wikipediaTool]
    }
  };
}

/**
 * Research Agent Template
 * This follows the AgentTemplateModel interface from protocol layer
 */
export const researchTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Research Assistant',
  slug: 'research-assistant',
  description: 'Expert research agent that searches Wikipedia for comprehensive information on any topic.',
  category: 'analysis' as const,
  
  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.3,
  maxTokens: 4000,
  
  icon: '🔬',
  previewPrompts: [
    'Tell me about the history of quantum computing',
    'What are the main causes of climate change?',
    'Explain how CRISPR gene editing works',
    'Research the economic impact of artificial intelligence'
  ],
  blueprint: createResearchBlueprint(),
  ...createResearchConfig(),
  timeout: 90000
};
```

#### 3.2 Update Agent Index
**File**: `packages/models/src/seeders/agents/index.ts`

```typescript
// Add imports
export { sybilTemplate } from './sybil';
export { gaiaTemplate } from './gaia';
export { researchTemplate } from './research'; // NEW

// Update array
import { sybilTemplate } from './sybil';
import { gaiaTemplate } from './gaia';
import { researchTemplate } from './research'; // NEW

export const ALL_AGENT_TEMPLATES = [
  sybilTemplate, 
  gaiaTemplate,
  researchTemplate // NEW
];
```

### Phase 4: Database Seeding Scripts

#### 4.1 Create Seeding Script
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
 * This follows the architecture - using repositories through their proper layer
 */
async function seedResearchAgent() {
  console.log('🔬 Seeding Research Agent and Wikipedia Tool...\n');
  
  const conn = await getConnection();
  const agentRepo = new AgentTemplateRepository(conn);
  const toolRepo = new ToolTemplateRepository(conn);
  
  try {
    // Seed Wikipedia Tool Template
    console.log('📚 Creating Wikipedia tool template...');
    const existingTool = await toolRepo.findBySlug('wikipedia-search');
    
    if (existingTool) {
      console.log('  ✓ Wikipedia tool already exists');
    } else {
      const tool = await toolRepo.create(wikipediaToolTemplate);
      console.log('  ✓ Wikipedia tool created:', tool.id);
    }
    
    // Seed Research Agent Template
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

#### 4.2 Update Package Scripts
**File**: `packages/models/package.json`

Add to scripts section:
```json
{
  "scripts": {
    "seed:research": "tsx src/scripts/seed-research-agent.ts"
  }
}
```

### Phase 5: Testing

#### 5.1 Integration Test
**File**: `packages/autopilot/src/__tests__/WikipediaTool.test.ts`

```typescript
import { Tool } from '../nodes/Tool';
import { wikipediaTool } from '@starships/models/seeders/tools/wikipedia';
import { ExecutionItemUtils } from '../utils/ExecutionItemUtils';

describe('Wikipedia Tool', () => {
  let toolNode: Tool;
  
  beforeEach(() => {
    toolNode = new Tool(wikipediaTool);
  });

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
  }, 30000);

  test('should validate tool configuration', () => {
    const validation = toolNode.validate();
    expect(validation.valid).toBe(true);
  });
});
```

## Architecture Compliance Checklist

### ✅ Layer 1: Domain (Protocol)
- [x] Using existing `ToolTemplateModel` interface
- [x] Using existing `AgentTemplateModel` interface
- [x] No new types needed

### ✅ Layer 2: Entity
- [x] Using existing `ToolTemplateEntity` class
- [x] Using existing `AgentTemplateEntity` class
- [x] No new entities needed

### ✅ Layer 3: Repository
- [x] Using existing `ToolTemplateRepository`
- [x] Using existing `AgentTemplateRepository`
- [x] No new repositories needed

### ✅ Layer 4: Service
- [x] Using existing `ToolTemplateService`
- [x] Using existing `AgentTemplateService`
- [x] No new services needed

### ✅ Layer 5: API Routes
- [x] Using existing `/api/v1/tool-templates` routes
- [x] Using existing `/api/v1/agent-templates` routes
- [x] No new routes needed

### ✅ Layer 6: Client
- [x] Using existing agent selector UI
- [x] Using existing conversation interface
- [x] No new UI components needed

### ✅ Data Layer (Seeders)
- [ ] Create `wikipedia.ts` tool template
- [ ] Create `research.ts` agent template
- [ ] Update index files
- [ ] Create seeding script

## Key Architecture Insights

1. **The 6-layer architecture is already complete** - All layers from domain to client already support tool and agent templates

2. **We're only adding data** - The Wikipedia tool and Research agent are just new template definitions (seeders) that plug into the existing system

3. **No layer violations** - We're not modifying any layers, just adding data that flows through them

4. **Proper separation** - Tool logic stays in the blueprint (code node), not scattered across layers

5. **Reusability** - Once seeded, these templates can be:
   - Browsed in the marketplace (through existing UI)
   - Deployed to starships (through existing flows)
   - Used in conversations (through existing agent selector)

## Implementation Commands

```bash
# 1. Install Wikipedia package
cd packages/autopilot
pnpm add wikipedia

# 2. Run the seeding script
cd packages/models
pnpm seed:research

# 3. Run tests
cd packages/autopilot
pnpm test WikipediaTool

# 4. Start the application
pnpm dev
```

## How It Works in Production

1. **User visits agent marketplace** - Sees Research Assistant in the list (via existing UI)
2. **User adds to starship** - Creates an agent instance from the template (via existing flow)
3. **User starts conversation** - Selects Research Assistant (via existing agent selector)
4. **Agent uses Wikipedia tool** - LLM invokes the tool via the blueprint (via autopilot engine)
5. **Tool executes code node** - Runs Wikipedia npm package queries (via code node execution)
6. **Results flow back** - Through the conversation interface (via existing streaming)

## Summary

This implementation strictly follows the 6-layer architecture by:
- **NOT modifying any existing layers** - All 6 layers remain unchanged
- **Adding only seeders** - New data that plugs into existing architecture
- **Using existing contracts** - ToolTemplateModel and AgentTemplateModel from protocol
- **Following existing patterns** - Same structure as calculator, echo, time tools
- **Maintaining separation** - Each piece stays in its proper location

The beauty of the 6-layer architecture is that it's already complete and extensible - we can add new agents and tools without touching any of the core layers!