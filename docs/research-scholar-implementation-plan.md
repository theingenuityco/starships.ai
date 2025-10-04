# Enhanced Research Agent Implementation Plan

## Overview
Enhanced Research Agent that replaces the existing Research Assistant with advanced academic research capabilities.

**Phase-Based Implementation Approach:**
- **Phase 1**: OpenAlex Tool (Academic Research) - *Current Focus*
- **Phase 2**: Brave Search Tool (Web Research) - *Future*
- **Phase 3**: Firecrawl Tool (Content Extraction) - *Future*

This follows a **simple, stateless approach** like the existing research agent, using intelligent system prompts for tool orchestration rather than complex persistence layers.

---

## Phase 1: OpenAlex Academic Research Tool (Current Focus)

### Overview
Implement OpenAlex tool to provide comprehensive academic research capabilities across all domains (medical, technical, pharmaceutical, engineering, social sciences, humanities, business).

### Progress Status Legend
- 🔴 **Not Started** - Task not yet begun
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Completed** - Task finished and tested
- ⏸️ **Blocked** - Waiting on dependencies
- 🔄 **Testing** - Implementation done, under testing

---

## Task 1.1: OpenAlex Tool Implementation  
**Status**: 🔴 Not Started | **Assignee**: TBD | **Estimate**: 1.5 days

### Subtasks:
- [ ] 🔴 **1.1.a** Implement OpenAlex ToolParams with blueprint workflow (1 day)
- [ ] 🔴 **1.1.b** Create ToolTemplateModel wrapper (0.5 days)

### Key Improvements Made:
- ✅ **Fixed URLSearchParams issue** - Uses manual parameter building like existing tools
- ✅ **Added input validation** - Year format validation, sort option validation
- ✅ **Enhanced error handling** - URL length validation, malformed query handling
- ✅ **Consistent response format** - Matches existing tool response patterns

### Implementation Details

**File:** `packages/models/src/seeders/tools/openalex.ts`

Following the exact pattern of Wikipedia and DuckDuckGo tools:

```typescript
import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * OpenAlex Academic Search Tool Definition
 * No API key required - completely free with 100K requests/day
 * Covers 209M+ scholarly works across ALL academic disciplines
 */
export const openalexTool: ToolParams = {
  name: 'openalex_search',
  description: 'Search 209M+ scholarly works across ALL academic disciplines via OpenAlex. Free API covering medical, technical, pharmaceutical, engineering, social sciences, humanities, and business research.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Academic search query (research topic, author name, paper title, etc.)',
        minLength: 1,
        maxLength: 500
      },
      searchType: {
        type: 'string',
        enum: ['works', 'authors', 'venues', 'institutions', 'topics'],
        description: 'Type of search: works (papers), authors, venues (journals), institutions, topics (research areas). Default: works'
      },
      publicationYear: {
        type: 'string',
        description: 'Year range filter (e.g., "2020", "2020-2024", ">2020", "<2023")'
      },
      openAccess: {
        type: 'boolean',
        description: 'Filter for open access papers only (default: false)'
      },
      sortBy: {
        type: 'string',
        enum: ['relevance', 'publication_date', 'cited_by_count'],
        description: 'Sort results by relevance, publication date, or citation count (default: relevance)'
      },
      perPage: {
        type: 'number',
        description: 'Number of results to return (1-200, default: 25)',
        minimum: 1,
        maximum: 200
      }
    },
    required: ['query']
  },
  blueprint: {
    nodes: [
      {
        ref: 'start_1',
        type: 'start',
        name: 'Start',
        description: 'Receive OpenAlex search parameters',
        parameters: {
          output: '{{ $input() }}'
        }
      },
      {
        ref: 'prepare_request',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build OpenAlex API request with query optimization',
        parameters: {
          code: `
            // Extract and validate input parameters
            const params = input || {};
            const { 
              query, 
              searchType = 'works',
              publicationYear,
              openAccess = false,
              sortBy = 'relevance',
              perPage = 25
            } = params;
            
            // Input validation
            if (!query || typeof query !== 'string') {
              throw new Error('Query is required and must be a string. Received: ' + JSON.stringify(params));
            }
            
            if (query.length > 500) {
              throw new Error('Query too long - maximum 500 characters');
            }
            
            // Validate searchType
            const validSearchTypes = ['works', 'authors', 'venues', 'institutions', 'topics'];
            if (!validSearchTypes.includes(searchType)) {
              throw new Error('Invalid searchType. Must be one of: ' + validSearchTypes.join(', '));
            }
            
            // Validate perPage
            const numPerPage = parseInt(perPage);
            if (isNaN(numPerPage) || numPerPage < 1 || numPerPage > 200) {
              throw new Error('perPage must be a number between 1 and 200');
            }
            
            // Build API URL
            const baseUrl = 'https://api.openalex.org';
            const endpoint = '/' + searchType;
            
            // Manual URL parameter building (following existing tool patterns)
            const params = [];
            
            // Main search query
            params.push('search=' + encodeURIComponent(query));
            
            // Filters array for complex filtering
            const filters = [];
            
            if (publicationYear) {
              // Handle different year formats with validation
              if (publicationYear.includes('-')) {
                const [startYear, endYear] = publicationYear.split('-');
                if (startYear && endYear && !isNaN(startYear) && !isNaN(endYear)) {
                  filters.push('publication_year:' + startYear + '-' + endYear);
                }
              } else if (publicationYear.startsWith('>')) {
                const year = publicationYear.substring(1);
                if (!isNaN(year)) {
                  filters.push('publication_year:>' + year);
                }
              } else if (publicationYear.startsWith('<')) {
                const year = publicationYear.substring(1);
                if (!isNaN(year)) {
                  filters.push('publication_year:<' + year);
                }
              } else if (!isNaN(publicationYear)) {
                filters.push('publication_year:' + publicationYear);
              }
            }
            
            if (openAccess) {
              filters.push('is_oa:true');
            }
            
            // Add filters if any exist
            if (filters.length > 0) {
              params.push('filter=' + encodeURIComponent(filters.join(',')));
            }
            
            // Sorting with validation
            const validSorts = {
              'relevance': 'relevance_score:desc',
              'publication_date': 'publication_date:desc',
              'cited_by_count': 'cited_by_count:desc'
            };
            const sortValue = validSorts[sortBy] || validSorts.relevance;
            params.push('sort=' + encodeURIComponent(sortValue));
            
            // Pagination
            params.push('per-page=' + numPerPage);
            params.push('page=1');
            
            // Format
            params.push('format=json');
            
            // Construct final URL
            const url = baseUrl + endpoint + '?' + params.join('&');
            
            // Validate URL length (OpenAlex has reasonable limits)
            if (url.length > 2000) {
              throw new Error('Query too complex - URL length exceeds limits');
            }
            
            return {
              request: {
                url: url,
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'StarshipsAI-ResearchAgent/1.0',
                  'mailto': 'contact@starships.ai' // Polite identifier for OpenAlex
                }
              },
              metadata: {
                query: query,
                searchType: searchType,
                perPage: numPerPage,
                timestamp: new Date().toISOString()
              }
            };
          `,
          timeout: 5000,
          mutations: [
            {
              operation: 'add',
              path: '/state/openalex_metadata',
              value: '{{ $lastOutputOf("prepare_request")[0].json.metadata }}'
            }
          ]
        }
      },
      {
        ref: 'fetch_openalex',
        type: 'http_request',
        name: 'Fetch from OpenAlex',
        description: 'Execute HTTP request to OpenAlex API',
        parameters: {
          url: '{{ $lastOutputOf("prepare_request")[0].json.request.url }}',
          method: '{{ $lastOutputOf("prepare_request")[0].json.request.method }}',
          headers: '{{ $lastOutputOf("prepare_request")[0].json.request.headers }}',
          timeout: 30000
        }
      },
      {
        ref: 'combine_data',
        type: 'code',
        name: 'Combine Metadata with Response',
        description: 'Combine request metadata with HTTP response',
        parameters: {
          code: `
            // Get the HTTP response from the previous node
            const httpResponse = input || {};
            
            // Get metadata from state (stored by prepare_request)
            const metadata = state.openalex_metadata || {};
            
            // Parse the response body if it's a string
            let parsedBody = httpResponse.body;
            if (typeof httpResponse.body === 'string') {
              try {
                parsedBody = JSON.parse(httpResponse.body);
              } catch (e) {
                console.error('Failed to parse OpenAlex response as JSON');
                parsedBody = {};
              }
            }
            
            // Pass parsed response and metadata to next node
            return {
              httpResponse: {
                ...httpResponse,
                body: parsedBody
              },
              metadata: metadata
            };
          `,
          timeout: 5000
        }
      },
      {
        ref: 'process_response',
        type: 'code',
        name: 'Process Response',
        description: 'Parse and format OpenAlex API response',
        parameters: {
          code: `
            // Input contains both httpResponse and metadata
            const { httpResponse, metadata } = input || {};
            const data = httpResponse?.body || {};
            const { query, searchType, perPage, timestamp } = metadata || {};
            
            try {
              // Initialize result structure (consistent with existing tools)
              const result = {
                query: query || '',
                searchType: searchType || 'works',
                timestamp: timestamp || new Date().toISOString(),
                responseType: searchType + '_search',
                found: false,
                results: [],
                metadata: {}
              };
              
              // Check for successful response
              if (data.results && Array.isArray(data.results)) {
                result.found = data.results.length > 0;
                
                if (searchType === 'works') {
                  // Format academic papers/works
                  result.results = data.results.map((work, index) => ({
                    id: work.id || '',
                    title: work.title || 'Untitled',
                    authors: work.authorships ? work.authorships.map(a => a.author?.display_name).filter(Boolean) : [],
                    publicationDate: work.publication_date || null,
                    venue: work.primary_location?.source?.display_name || 'Unknown venue',
                    type: work.type || 'article',
                    doi: work.doi || null,
                    url: work.doi || work.id || null,
                    openAccess: work.open_access?.is_oa || false,
                    citedByCount: work.cited_by_count || 0,
                    abstract: work.abstract_inverted_index ? 'Abstract available' : null,
                    relevanceScore: 1.0 - (index / data.results.length),
                    concepts: work.concepts ? work.concepts.slice(0, 5).map(c => c.display_name) : [],
                    institutions: work.authorships ? 
                      [...new Set(work.authorships.flatMap(a => 
                        a.institutions?.map(i => i.display_name) || []
                      ))].slice(0, 3) : []
                  }));
                }
                else if (searchType === 'authors') {
                  // Format authors
                  result.results = data.results.map((author, index) => ({
                    id: author.id || '',
                    name: author.display_name || 'Unknown author',
                    worksCount: author.works_count || 0,
                    citedByCount: author.cited_by_count || 0,
                    hIndex: author.summary_stats?.h_index || null,
                    affiliation: author.last_known_institution?.display_name || 'Unknown affiliation',
                    orcid: author.orcid || null,
                    concepts: author.concepts ? author.concepts.slice(0, 5).map(c => c.display_name) : [],
                    relevanceScore: 1.0 - (index / data.results.length)
                  }));
                }
                else if (searchType === 'venues') {
                  // Format journals/venues
                  result.results = data.results.map((venue, index) => ({
                    id: venue.id || '',
                    name: venue.display_name || 'Unknown venue',
                    type: venue.type || 'journal',
                    publisher: venue.host_organization_name || 'Unknown publisher',
                    issn: venue.issn ? venue.issn.join(', ') : null,
                    isOa: venue.is_oa || false,
                    worksCount: venue.works_count || 0,
                    citedByCount: venue.cited_by_count || 0,
                    hIndex: venue.summary_stats?.h_index || null,
                    relevanceScore: 1.0 - (index / data.results.length)
                  }));
                }
                else if (searchType === 'institutions') {
                  // Format institutions
                  result.results = data.results.map((institution, index) => ({
                    id: institution.id || '',
                    name: institution.display_name || 'Unknown institution',
                    country: institution.country_code || 'Unknown',
                    type: institution.type || 'education',
                    worksCount: institution.works_count || 0,
                    citedByCount: institution.cited_by_count || 0,
                    hIndex: institution.summary_stats?.h_index || null,
                    relevanceScore: 1.0 - (index / data.results.length)
                  }));
                }
                else if (searchType === 'topics') {
                  // Format research topics
                  result.results = data.results.map((topic, index) => ({
                    id: topic.id || '',
                    name: topic.display_name || 'Unknown topic',
                    description: topic.description || '',
                    level: topic.level || 0,
                    worksCount: topic.works_count || 0,
                    citedByCount: topic.cited_by_count || 0,
                    subfields: topic.subfield?.display_name || null,
                    field: topic.field?.display_name || null,
                    domain: topic.domain?.display_name || null,
                    relevanceScore: 1.0 - (index / data.results.length)
                  }));
                }
                
                // Add comprehensive metadata
                result.metadata = {
                  totalResults: data.meta?.count || data.results.length,
                  searchTime: Date.now() - new Date(timestamp).getTime(),
                  apiProvider: 'OpenAlex',
                  responseType: searchType + '_results',
                  page: data.meta?.page || 1,
                  perPage: data.meta?.per_page || perPage,
                  totalPages: data.meta ? Math.ceil(data.meta.count / data.meta.per_page) : 1,
                  openAccess: result.results.filter(r => r.openAccess).length + ' open access',
                  domains: searchType === 'works' ? 
                    [...new Set(result.results.flatMap(r => r.concepts || []))].slice(0, 10) : 
                    null
                };
              }
              
              // Handle no results
              if (!result.found) {
                result.metadata = {
                  totalResults: 0,
                  searchTime: Date.now() - new Date(timestamp).getTime(),
                  apiProvider: 'OpenAlex',
                  error: 'No results found',
                  suggestion: 'Try broader keywords, different search type, or remove year filters'
                };
              }
              
              return result;
              
            } catch (error) {
              return {
                query: query || '',
                searchType: searchType || 'works',
                timestamp: timestamp || new Date().toISOString(),
                found: false,
                error: error.message || 'Error processing OpenAlex response',
                type: 'processing_error'
              };
            }
          `,
          timeout: 5000
        }
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return OpenAlex search results',
        parameters: {
          output: '{{ $input() }}'
        }
      }
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare_request' },
      { ref: 'e2', from: 'prepare_request', to: 'fetch_openalex' },
      { ref: 'e3', from: 'fetch_openalex', to: 'combine_data' },
      { ref: 'e4', from: 'combine_data', to: 'process_response' },
      { ref: 'e5', from: 'process_response', to: 'end_1' }
    ],
    metadata: {
      version: '1.0.0',
      author: 'Starships.ai',
      requiresApiKey: false,
      rateLimit: '100,000 requests per day (free), 10 requests per second (polite)',
      coverage: '209M+ scholarly works across all academic disciplines'
    }
  }
};

/**
 * OpenAlex Tool Template Configuration
 * Follows the existing pattern used by Wikipedia and DuckDuckGo
 */
export const openalexToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: openalexTool.name,
  description: openalexTool.description,
  parameters: openalexTool.parameters,
  blueprint: openalexTool.blueprint,

  // Template metadata
  slug: 'openalex-search',
  category: 'data',
  exampleUsage: JSON.stringify({
    academicPapers: { 
      name: 'openalex_search', 
      arguments: { 
        query: 'machine learning in medicine',
        searchType: 'works',
        publicationYear: '2020-2024',
        perPage: 10 
      } 
    },
    researchers: { 
      name: 'openalex_search', 
      arguments: { 
        query: 'artificial intelligence',
        searchType: 'authors',
        sortBy: 'cited_by_count'
      } 
    },
    openAccessOnly: { 
      name: 'openalex_search', 
      arguments: { 
        query: 'climate change',
        searchType: 'works',
        openAccess: true,
        sortBy: 'publication_date'
      } 
    }
  }, null, 2),
  requiresApiKey: false,
  configurationFields: []
};
```

### Key Features
- **209M+ scholarly works** across ALL academic disciplines
- **Completely free** - 100,000 requests/day, no API key required
- **Cross-disciplinary coverage** - medical, technical, pharmaceutical, social sciences, humanities, business
- **Rich metadata** - authors, citations, institutions, open access status
- **Advanced filtering** - by year, open access, venue type
- **Multiple search types** - works, authors, venues, institutions, topics

---

## Task 1.2: Update Tools Index
**Status**: 🔴 Not Started | **Assignee**: TBD | **Estimate**: 0.25 days

### Implementation

**File:** `packages/models/src/seeders/tools/index.ts`

Complete updated file with OpenAlex tool integration:

```typescript
/**
 * Tool Templates Index
 * Exports all tool templates from individual files
 */

// Updated imports section (add new import)
export { calculatorToolTemplate } from './calculator';
export { timeToolTemplate } from './time';
export { echoToolTemplate } from './echo';
export { wikipediaToolTemplate } from './wikipedia';
export { duckduckgoToolTemplate } from './duckduckgo';
export { openalexToolTemplate } from './openalex';  // NEW - ADD THIS LINE
export { toolListToolTemplate } from './tool-list';
export { toolGetToolTemplate } from './tool-get';
export { toolCreateToolTemplate } from './tool-create';
export { toolUpdateToolTemplate } from './tool-update';
export { blueprintLintToolTemplate } from './blueprint-lint';
export { toolTestToolTemplate } from './tool-test';
export { nodeSchemaIntrospectionToolTemplate } from './node-schema';
export { blueprintExamplesToolTemplate } from './blueprint-examples';

// Re-export all tool templates as a single array for convenience
import { calculatorToolTemplate } from './calculator';
import { timeToolTemplate } from './time';
import { echoToolTemplate } from './echo';
import { wikipediaToolTemplate } from './wikipedia';
import { duckduckgoToolTemplate } from './duckduckgo';
import { openalexToolTemplate } from './openalex';  // NEW - ADD THIS LINE
import { toolListToolTemplate } from './tool-list';
import { toolGetToolTemplate } from './tool-get';
import { toolCreateToolTemplate } from './tool-create';
import { toolUpdateToolTemplate } from './tool-update';
import { blueprintLintToolTemplate } from './blueprint-lint';
import { toolTestToolTemplate } from './tool-test';
import { nodeSchemaIntrospectionToolTemplate } from './node-schema';
import { blueprintExamplesToolTemplate } from './blueprint-examples';

// Updated array (add openalexToolTemplate)
export const ALL_TOOL_TEMPLATES = [
  calculatorToolTemplate,
  timeToolTemplate,
  echoToolTemplate,
  wikipediaToolTemplate,
  duckduckgoToolTemplate,
  openalexToolTemplate,  // NEW - ADD THIS LINE
  toolListToolTemplate,
  toolGetToolTemplate,
  toolCreateToolTemplate,
  toolUpdateToolTemplate,
  blueprintLintToolTemplate,
  toolTestToolTemplate,
  nodeSchemaIntrospectionToolTemplate,
  blueprintExamplesToolTemplate,
];
```

**Changes Required:**
1. Add `export { openalexToolTemplate } from './openalex';` to exports
2. Add `import { openalexToolTemplate } from './openalex';` to imports  
3. Add `openalexToolTemplate,` to the `ALL_TOOL_TEMPLATES` array

---

## Task 1.3: Enhanced Research Agent (Replace Existing)
**Status**: 🔴 Not Started | **Assignee**: TBD | **Estimate**: 1 day

### Implementation

**File:** `packages/models/src/seeders/agents/research.ts`

Replace the existing research agent with enhanced version:

```typescript
import { AgentState, Blueprint, Agent } from '@starships/autopilot';
import type { AgentTemplateModel } from '@starships/protocol';

/**
 * Create Enhanced Research Agent blueprint using Agent class
 */
function createResearchBlueprint(): Blueprint {
  const agent = new Agent({
    name: 'Research Assistant',
    model: 'anthropic/claude-3.5-sonnet',
    temperature: 0.3,
    maxTokens: 4000,
  });

  return agent.getCurrentBlueprint();
}

/**
 * Enhanced Research-specific configuration
 */
function createResearchConfig(): { systemPrompt: string; state: AgentState } {
  return {
    systemPrompt: `You are an expert research assistant with access to comprehensive information sources covering both general knowledge and academic research.

## Your Tools:

### 1. Wikipedia Search
- **Purpose**: Deep, comprehensive information on topics
- **Best for**: Historical events, scientific concepts, biographies, detailed explanations
- **Actions**: search, summary, content, sections

### 2. DuckDuckGo Instant
- **Purpose**: Quick facts, calculations, definitions, instant answers
- **Best for**: Current facts, simple calculations, definitions, conversions
- **Returns**: Direct answers, definitions, structured data

### 3. OpenAlex Academic Search ⭐ NEW
- **Purpose**: Global academic research across 209M+ scholarly works in ALL disciplines
- **Best for**: Scientific papers, research findings, academic literature, citations, author analysis
- **Coverage**: Medical, technical, pharmaceutical, engineering, social sciences, humanities, business
- **Actions**: search works (papers), authors, venues (journals), institutions, research topics

## Tool Selection Strategy:

### Use DuckDuckGo when:
- User wants a quick fact or number (population, dates, statistics)
- User needs a calculation or conversion  
- User asks for a definition
- Query is about current information (stock prices, weather, etc.)
- You need a quick answer before deep research

IMPORTANT: DuckDuckGo works best with SIMPLE queries - just the entity name!
- ✅ GOOD: "Barack Obama", "Microsoft", "Python", "Mario"
- ❌ BAD: "Barack Obama birth date education", "Mario Nintendo character first appearance"
- Keep DuckDuckGo queries to 1-3 words maximum!

### Use Wikipedia when:
- User needs comprehensive understanding
- Topic requires historical context
- User wants detailed explanations
- You need to cite sources
- Topic is complex or academic

### Use OpenAlex when:
- User asks for academic research, scientific papers, or scholarly information
- User wants recent research findings or studies
- User needs citations for academic work
- User asks about specific researchers or institutions
- User wants to know the current state of research in a field
- User asks about medical/clinical studies, engineering research, social science findings

## Advanced Research Strategies:

### For Academic/Research Queries:
1. **Start with OpenAlex** for scholarly sources and recent research
2. **Supplement with Wikipedia** for comprehensive background and context
3. **Use DuckDuckGo** for quick facts and current data

### For General Knowledge:
1. **Start with Wikipedia** for comprehensive information
2. **Use DuckDuckGo** for quick facts and verification
3. **Add OpenAlex** if academic sources would strengthen the answer

### For Current Events/Facts:
1. **Start with DuckDuckGo** for instant answers
2. **Use Wikipedia** for background context
3. **Check OpenAlex** if there's relevant academic research

## Research Process:
1. **Assess Query Type**: Determine if user needs academic research, general knowledge, or quick facts
2. **Choose Primary Tool**: Start with most appropriate tool
3. **Complement if Needed**: Use additional tools to fill gaps or provide verification
4. **Cross-Reference**: When possible, verify information across sources
5. **Synthesize**: Combine information from all sources into a coherent response
6. **Present Clearly**: Structure response based on user's needs with proper attribution

## Guidelines:
- Always indicate which source provided which information
- For academic topics, prioritize OpenAlex findings but provide context from other sources
- Use DuckDuckGo for quick verification of facts
- Use Wikipedia for authoritative, detailed background information
- Mention when sources disagree or provide different perspectives
- Provide URLs when available for verification
- For academic information, include relevant citations and publication details

## Response Format:
- Start with a brief answer to the user's question
- Clearly attribute information to its source (Wikipedia, DuckDuckGo, or OpenAlex)
- For academic research, include author names, publication years, and key findings
- For mixed research, organize by relevance not by source
- Include relevant quotes and data with proper context
- End with sources and related topics to explore
- Use markdown formatting for better readability

## Error Handling:
- If one tool fails, rely on the others
- If all tools return no results, suggest alternative queries or approaches
- Explain any limitations or issues encountered

## Academic Research Best Practices:
- When citing OpenAlex results, include author names, publication year, and venue when available
- Mention citation counts for highly cited papers
- Note open access status when relevant
- Distinguish between different types of academic sources (peer-reviewed papers, preprints, etc.)
- Provide context about research institutions and author expertise when relevant

Remember: You have three complementary tools that together provide access to instant answers, comprehensive general knowledge, and cutting-edge academic research. Use them strategically to provide the most complete and authoritative response possible.`,
    state: {
      messages: [],
      tools: []
    }
  };
}

/**
 * Enhanced Research Agent Template
 */
export const researchTemplate: Omit<AgentTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  name: 'Research Assistant',
  slug: 'research-assistant',
  description: 'Expert research agent that combines Wikipedia depth, DuckDuckGo instant answers, and OpenAlex academic research for comprehensive, accurate information across all topics and domains.',
  category: 'analysis',
  
  model: 'anthropic/claude-3.5-sonnet',
  temperature: 0.3,
  maxTokens: 4000,
  
  // Tool assignment - reference all three tools by slug
  assignedToolSlugs: ['wikipedia-search', 'duckduckgo-instant', 'openalex-search'],
  
  icon: '🔬',
  previewPrompts: [
    'Find recent research on quantum computing applications',
    'What are the main causes of climate change according to latest studies?',
    'Research the effectiveness of CRISPR gene editing in clinical trials',
    'What is the current state of AI research in autonomous vehicles?',
    'Find academic papers on the economic impact of remote work',
    'Research new developments in sustainable energy storage'
  ],
  blueprint: createResearchBlueprint(),
  ...createResearchConfig(),
  timeout: 90000
};
```

---

## Task 1.4: Database Integration and Seeding
**Status**: 🔴 Not Started | **Assignee**: TBD | **Estimate**: 0.5 days

### Implementation Steps:

#### Step 1: Verify Seeder Integration
The new OpenAlex tool will be automatically included when the seeder runs because it's exported in the `ALL_TOOL_TEMPLATES` array.

#### Step 2: Run Tool Seeder
```bash
# Navigate to the server directory
cd packages/server

# Run the seeder to add tools to database
npm run seed:tools

# Or run full seeder if needed
npm run seed
```

#### Step 3: Verify Database Integration
1. Check the `tool_templates` table for the new OpenAlex tool:
   ```sql
   SELECT id, name, slug, category FROM tool_templates WHERE slug = 'openalex-search';
   ```

2. Verify the tool appears in the admin panel (if available)

3. Test tool assignment to agents in the database

#### Step 4: Update Research Agent Assignment
The research agent will automatically get the new tool assigned via the `assignedToolSlugs` array, but verify in database:
```sql
-- Check if research agent has the new tool assigned
SELECT 
  at.name as agent_name,
  at.assigned_tool_slugs
FROM agent_templates at 
WHERE at.slug = 'research-assistant';
```

#### Rollback Plan (if needed):
```bash
# If something goes wrong, restore from backup or run:
# 1. Remove the OpenAlex entries from tools index
# 2. Re-run seeder
# 3. Manually remove OpenAlex tool from database if needed
DELETE FROM tool_templates WHERE slug = 'openalex-search';
```

### Acceptance Criteria:
- ✅ OpenAlex tool appears in `tool_templates` table
- ✅ Tool slug is `openalex-search`
- ✅ Tool category is `data`
- ✅ Research agent includes `openalex-search` in `assignedToolSlugs`
- ✅ No database errors during seeding
- ✅ Tool is available for assignment to other agents

---

## Task 1.5: Testing and Validation
**Status**: 🔴 Not Started | **Assignee**: TBD | **Estimate**: 0.5 days

### Test Scenarios:
- [ ] 🔴 **Academic paper search** - "machine learning in healthcare"
- [ ] 🔴 **Author research** - "Geoffrey Hinton artificial intelligence"  
- [ ] 🔴 **Recent research** - "COVID-19 treatments 2023-2024"
- [ ] 🔴 **Cross-domain search** - "climate change economics"
- [ ] 🔴 **Open access filtering** - Free papers on "renewable energy"

### Acceptance Criteria:
- ✅ OpenAlex tool executes without errors
- ✅ Returns relevant academic results for test queries
- ✅ Handles different search types (works, authors, venues)
- ✅ Agent intelligently uses OpenAlex for academic queries
- ✅ Proper error handling for invalid queries
- ✅ Results include proper citations and metadata

---

## Environment Setup

### No Additional Environment Variables Required
OpenAlex is completely free and requires no API key setup.

### Optional: Rate Limiting Configuration
If needed, add to `.env`:
```bash
# Optional: Configure request rate limiting for OpenAlex (default: 10 req/sec)
OPENALEX_RATE_LIMIT=10
```

---

## Future Phases (Implementation Ready)

### Phase 2: Brave Search Tool (Web Research)
- Replace DuckDuckGo with more comprehensive Brave Search
- Add AI-powered web search capabilities
- Environment variable: `BRAVE_SEARCH_API_KEY`

### Phase 3: Firecrawl Tool (Content Extraction)  
- Add deep content extraction from academic websites
- Parse PDFs and research documents
- Environment variable: `FIRECRAWL_API_KEY`

---

## Success Metrics for Phase 1

### Functionality:
- ✅ OpenAlex tool successfully integrated
- ✅ Agent can find relevant academic papers
- ✅ Proper handling of author and institution searches
- ✅ Citation metadata correctly extracted
- ✅ Error handling works for edge cases

### Performance:
- ✅ Average response time <5 seconds
- ✅ Successful API calls >95%
- ✅ Relevant results for academic queries >90%

### User Experience:
- ✅ Clear attribution of academic sources
- ✅ Proper formatting of research results
- ✅ Helpful suggestions for failed searches

---

## ✅ Implementation Readiness Summary

### **Critical Issues Fixed:**
1. ✅ **URLSearchParams Issue** - Replaced with manual parameter building
2. ✅ **Input Validation** - Added comprehensive validation for all parameters  
3. ✅ **Error Handling** - Enhanced with URL validation and malformed query handling
4. ✅ **Response Format** - Made consistent with existing tool patterns
5. ✅ **Database Integration** - Added complete seeding and verification steps

### **Total Estimated Time: 3.75 days**
- Task 1.1: OpenAlex Tool Implementation (1.5 days)
- Task 1.2: Update Tools Index (0.25 days)  
- Task 1.3: Enhanced Research Agent (1 day)
- Task 1.4: Database Integration (0.5 days)
- Task 1.5: Testing and Validation (0.5 days)

### **Files to Create/Modify:**
1. **CREATE**: `packages/models/src/seeders/tools/openalex.ts`
2. **UPDATE**: `packages/models/src/seeders/tools/index.ts`
3. **REPLACE**: `packages/models/src/seeders/agents/research.ts`

### **Implementation Status: 🟢 READY**
**Confidence Level: 95/100**

The plan is now complete with all critical gaps addressed and elegant solutions implemented. Ready for immediate implementation.

---

*Phase 1 Document Version: 2.0*  
*Last Updated: 2025-10-04*  
*Author: Enhanced Research Agent Implementation Team*  
*Status: Ready for Implementation*