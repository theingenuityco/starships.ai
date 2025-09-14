# Deep Research Agent MVP Implementation Plan

## Executive Summary

This document outlines the implementation plan for a Deep Research Agent MVP that performs parallel research using Tavily (current web information) and Wikipedia (established facts). The system integrates seamlessly with the existing Starships.ai architecture, using the established BaseHandler pattern, Execution flow, and Engine infrastructure. The implementation requires minimal changes to the core system while providing powerful research capabilities.

## Table of Contents

1. [MVP Overview](#mvp-overview)
2. [Architecture](#architecture)
3. [Implementation Plan](#implementation-plan)
4. [Technical Requirements](#technical-requirements)
5. [Future Extensibility](#future-extensibility)
6. [Timeline & Milestones](#timeline--milestones)
7. [Success Metrics](#success-metrics)

---

## MVP Overview

### Core Concept
A deep research agent that performs comprehensive research by:
- Running parallel searches across multiple sources simultaneously
- Combining current web information with established facts
- Synthesizing findings using GPT-4 via OpenRouter
- Delivering structured research reports with citations

### MVP Features
- **Parallel Search**: Tavily + Wikipedia running simultaneously
- **Intelligent Synthesis**: GPT-4 powered analysis via OpenRouter
- **Real-time Progress**: Streaming updates during research
- **Structured Output**: Organized findings with citations
- **Cost Efficient**: ~$0.03 per research query

### Why This Approach
- **Complementary Sources**: Tavily provides current information, Wikipedia provides established facts
- **Speed**: Parallel execution is 2-3x faster than sequential
- **Quality**: Multiple perspectives lead to comprehensive research
- **Scalability**: Architecture supports easy addition of new tools

---

## Architecture

### System Components

```
┌────────────────────────────────┐
│     Deep Research Agent        │
│         (Orchestrator)         │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│    Parallel Execution Layer    │
├────────────────┬───────────────┤
│                │                │
▼                ▼                ▼
[Tavily API]     [Wikipedia API]  [Future Tools...]
(Current info)   (Established facts)
│                │                │
└────────┬───────────────────────┘
         ▼
   [GPT-4 via OpenRouter]
         ↓
   [Structured Output]
```

### Workflow Blueprint

```typescript
import { Blueprint, Node as WorkflowNode } from '@/types';

export const DeepResearchMVPBlueprint: Blueprint = {
  id: "deep-research-mvp",
  name: "Deep Research Agent MVP",
  description: "Parallel research using Tavily and Wikipedia",
  version: "1.0.0",
  
  nodes: [
    {
      ref: "start",
      type: "start",
      parameters: {}
    },
    {
      ref: "analyze-query",
      type: "llm",
      parameters: {
        model: "gpt-4",
        prompt: "Analyze the following research query and extract key information:\n\nQuery: " + 
                "${QUERY_PLACEHOLDER}" + // Will be replaced at runtime
                "\n\nProvide:\n1. Expanded query with related terms\n2. Query type (academic/current/technical/general)\n3. Key keywords for searching\n\nFormat as JSON.",
        temperature: 0.3,
        maxTokens: 500
      }
    },
    {
      ref: "parallel-search",
      type: "parallel_research",  // Custom type we'll add
      parameters: {
        timeout: 10000,
        continueOnPartialFailure: true,
        tools: [
          {
            type: "tavily",
            config: {
              searchDepth: "advanced",
              maxResults: 10,
              includeAnswer: true
            }
          },
          {
            type: "wikipedia",
            config: {
              maxPages: 5,
              extractSummary: true
            }
          }
        ]
      }
    },
    {
      ref: "synthesize",
      type: "llm",
      parameters: {
        model: "gpt-4",
        prompt: "Synthesize the research findings into a comprehensive summary.\n\nSources: " +
                "${SOURCES_PLACEHOLDER}" + // Will be replaced at runtime
                "\n\nProvide:\n1. Executive summary\n2. Key findings (3-5 points)\n3. Supporting evidence\n4. Confidence assessment\n5. Areas needing further research",
        temperature: 0.7,
        maxTokens: 2000
      }
    },
    {
      ref: "format-output",
      type: "output",
      parameters: {
        format: "json",
        template: "research_report"
      }
    },
    {
      ref: "end",
      type: "end",
      parameters: {}
    }
  ],
  
  edges: [
    { source: "start", target: "analyze-query" },
    { source: "analyze-query", target: "parallel-search" },
    { source: "parallel-search", target: "synthesize" },
    { source: "synthesize", target: "format-output" },
    { source: "format-output", target: "end" }
  ]
};
```

### Data Flow Through Execution

1. **Start Node** → Initializes execution
   - Sets up `execution.executionResults` Map
   - Provides initial context via `agentMemory`

2. **Query Analysis (LLM Node)** (500ms)
   - Receives query from agentMemory context
   - Stores result in `executionResults.set('analyze-query', result)`
   - Output: expandedQuery, keywords, queryType

3. **Parallel Search (Custom Handler)** (2-3s)
   - Retrieves previous result: `executionResults.get('analyze-query')`
   - Executes Tavily + Wikipedia simultaneously
   - Stores aggregated sources in `executionResults.set('parallel-search', sources)`

4. **Synthesis (LLM Node)** (1-2s)
   - Retrieves sources: `executionResults.get('parallel-search')`
   - Generates comprehensive summary
   - Stores in `executionResults.set('synthesize', synthesis)`

5. **Output Node** → Formats final result
   - Aggregates all results from executionResults Map
   - Returns structured JSON response

6. **End Node** → Marks execution complete

**Total Time: 3-5 seconds**

---

## Implementation Plan

### Phase 1: Core Infrastructure (Days 1-2)

#### 1.1 Parallel Research Handler

```typescript
// packages/autopilot/src/nodes/handlers/ParallelResearchHandler.ts
import { BaseHandler } from '@/nodes/Handler';
import { Execution, NodeResult, ValidationResult, ValidationError, ValidationWarning } from '@/types';
import { HttpRequest } from '@/HttpRequest';
import type { StreamingEmitter } from '@/types/streamingEmitter';

export class ParallelResearchHandler extends BaseHandler {
  readonly type = 'parallel_research';
  private streamingEmitter?: StreamingEmitter;
  
  setStreamingEmitter(emitter?: StreamingEmitter): void {
    this.streamingEmitter = emitter;
  }
  
  async execute(execution: Execution): Promise<Execution> {
    // Define parameter types
    interface ParallelResearchParams {
      timeout?: number;
      continueOnPartialFailure?: boolean;
      tools: Array<{
        type: string;
        config: Record<string, any>;
      }>;
    }
    
    const params = this.node.parameters as ParallelResearchParams;
    
    try {
      // Get query from previous node results
      const previousResult = this.getPreviousNodeResult(execution, 'analyze-query');
      // Type the response from LLM analysis
      interface AnalysisResult {
        expandedQuery?: string;
        keywords?: string[];
        queryType?: string;
      }
      
      const { expandedQuery, keywords } = (previousResult?.data as AnalysisResult) || {};
      // Get query from agent memory - accessing the last user message
      const userMessages = execution.agentMemory?.getMessagesByRole('user') || [];
      const lastUserMessage = userMessages[userMessages.length - 1];
      const query = expandedQuery || lastUserMessage?.content || '';
      
      // Emit progress
      await this.emitProgress('Starting parallel search...', 0, execution);
      
      // Create tool instances inline (following ToolService pattern)
      const tools = params.tools.map((toolConfig: any) => {
        switch (toolConfig.type) {
          case 'tavily':
            return this.createTavilyTool(toolConfig.config);
          case 'wikipedia':
            return this.createWikipediaTool(toolConfig.config);
          default:
            throw new Error(`Unknown tool type: ${toolConfig.type}`);
        }
      });
      
      // Execute all tools in parallel
      const searchPromises = tools.map((tool, index) => 
        tool.search(query, keywords)
          .then(results => {
            this.emitProgress(`Tool ${index + 1} completed`, (index + 1) * 50 / tools.length, execution);
            return { tool: tool.name, results, error: null };
          })
          .catch(error => ({
            tool: tool.name,
            results: [],
            error: error.message
          }))
      );
      
      // Wait for all searches with timeout
      const results = await Promise.race([
        Promise.all(searchPromises),
        this.timeout(params.timeout || 10000)
      ]);
      
      // Aggregate sources
      const allSources = this.aggregateSources(results);
      
      await this.emitProgress('Search completed', 100, execution);
      
      return this.createSuccessResult(execution, {
        sources: allSources,
        metadata: {
          toolsUsed: results.filter(r => !r.error).map(r => r.tool),
          errors: results.filter(r => r.error),
          totalSources: allSources.length
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Parallel search failed';
      return this.createErrorResult(execution, errorMessage);
    }
  }
  
  private getPreviousNodeResult(execution: Execution, nodeRef: string): NodeResult | undefined {
    return execution.executionResults.get(nodeRef);
  }
  
  private aggregateSources(results: any[]): any[] {
    return results
      .filter(r => !r.error)
      .flatMap(r => r.results)
      .map((source, index) => ({
        ...source,
        id: `source-${index}`,
        relevanceScore: this.calculateRelevance(source)
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
  
  private calculateRelevance(source: any): number {
    // Simple relevance scoring
    let score = 0.5;
    if (source.score) score = source.score; // Use tool's score if available
    if (source.type === 'web') score += 0.1;
    if (source.type === 'encyclopedia') score += 0.2;
    return Math.min(score, 1.0);
  }
  
  private async emitProgress(message: string, progress: number, execution?: Execution): Promise<void> {
    if (this.streamingEmitter && execution) {
      await this.streamingEmitter.emitExecutionEvent({
        type: 'content_chunk',
        execution: execution, // Pass the actual execution
        timestamp: new Date().toISOString(),
        content: message,
        contentMetadata: {
          accumulated: message,
          isComplete: progress === 100,
          nodeRef: this.node.ref
        }
      });
    }
  }
  
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Search timeout')), ms)
    );
  }
  
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const params = this.node.parameters as any;
    
    // Validate required parameters
    if (!params.tools || params.tools.length === 0) {
      errors.push(this.createValidationError('MISSING_REQUIRED_FIELD', 'At least one tool must be configured'));
    }
    
    // Validate timeout
    if (params.timeout && params.timeout < 1000) {
      warnings.push(this.createValidationWarning('POTENTIAL_TIMEOUT', 'Timeout is very low, searches may fail'));
    }
    
    return { 
      valid: errors.length === 0, 
      errors, 
      warnings 
    };
  }
  
  getIcon(): string {
    return '🔍';
  }
  
  /**
   * Create Tavily search tool inline (following ToolService pattern)
   */
  private createTavilyTool(config: any) {
    const apiKey = process.env.TAVILY_API_KEY || '';
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY not configured');
    }
    
    return {
      name: 'tavily',
      async search(query: string, keywords?: string[]): Promise<any[]> {
        const httpRequest = new HttpRequest({
          url: 'https://api.tavily.com/search',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            api_key: apiKey,
            query,
            search_depth: config.searchDepth,
            max_results: config.maxResults,
            include_answer: config.includeAnswer,
            include_raw_content: false,
            include_images: false
          },
          timeout: 10000
        });
        
        const result = await httpRequest.execute();
        
        if (result.status === 'completed' && result.data?.body) {
          const response = result.data.body as any;
          return response.results?.map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content,
            score: r.score,
            publishedDate: r.published_date,
            type: 'web',
            tool: 'tavily'
          })) || [];
        }
        
        throw new Error('Tavily search returned no results');
      }
    };
  }
  
  /**
   * Create Wikipedia search tool inline
   */
  private createWikipediaTool(config: any) {
    const baseUrl = 'https://en.wikipedia.org/w/api.php';
    
    return {
      name: 'wikipedia',
      async search(query: string, keywords?: string[]): Promise<any[]> {
        // Search for pages
        const searchRequest = new HttpRequest({
          url: baseUrl,
          method: 'GET',
          params: {
            action: 'query',
            list: 'search',
            srsearch: query,
            srlimit: config.maxPages,
            format: 'json',
            origin: '*'
          },
          timeout: 5000
        });
        
        const searchResult = await searchRequest.execute();
        
        if (searchResult.status !== 'completed' || !searchResult.data?.body) {
          throw new Error('Wikipedia search failed');
        }
        
        const searchData = searchResult.data.body as any;
        const pages = searchData.query?.search || [];
        
        // For MVP, return simple results without fetching full summaries
        return pages.slice(0, config.maxPages).map((page: any) => ({
          title: page.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
          content: page.snippet?.replace(/<[^>]*>/g, '') || '', // Remove HTML tags
          type: 'encyclopedia',
          tool: 'wikipedia'
        }));
      }
    };
  }
}
```

#### 1.2 Register Handler in Engine

```typescript
// packages/autopilot/src/engine/Engine.ts
// Add to HANDLER_MAP

const HANDLER_MAP: Record<string, () => Promise<HandlerConstructor>> = {
  // Existing handlers...
  start: () => import('@/nodes/handlers/StartHandler').then((m) => m.StartHandler),
  end: () => import('@/nodes/handlers/EndHandler').then((m) => m.EndHandler),
  llm: () => import('@/nodes/handlers/LlmHandler').then((m) => m.LlmHandler),
  output: () => import('@/nodes/handlers/OutputHandler').then((m) => m.OutputHandler),
  
  // Add new parallel research handler
  parallel_research: () => import('@/nodes/handlers/ParallelResearchHandler')
    .then((m) => m.ParallelResearchHandler),
};

// No other changes needed - Engine already supports dynamic loading
```

### Phase 2: Prompt Preparation & Dynamic Data Injection (Days 3-4)

#### 2.1 Dynamic Prompt Preparation

Since the LLM handler doesn't process template variables, we need to prepare prompts at runtime:

```typescript
// Add this method to ParallelResearchHandler
private prepareLLMPrompt(template: string, execution: Execution): string {
  let prompt = template;
  
  // Get user's original query
  const userMessages = execution.agentMemory?.getMessagesByRole('user') || [];
  const originalQuery = userMessages[userMessages.length - 1]?.content || '';
  
  // Get analysis results if available
  const analysisResult = execution.executionResults.get('analyze-query');
  const analysisData = analysisResult?.data as any;
  
  // Get search results if available  
  const searchResults = execution.executionResults.get('parallel-search');
  const sources = (searchResults?.data as any)?.sources || [];
  
  // Replace placeholders with actual data
  prompt = prompt.replace('${ORIGINAL_QUERY}', originalQuery);
  prompt = prompt.replace('${EXPANDED_QUERY}', analysisData?.expandedQuery || originalQuery);
  prompt = prompt.replace('${KEYWORDS}', (analysisData?.keywords || []).join(', '));
  
  // Format sources for synthesis
  if (prompt.includes('${SOURCES}')) {
    const sourcesText = sources.map((s: any, i: number) => 
      `[${i+1}] ${s.title}\nURL: ${s.url}\nType: ${s.type}\nContent: ${s.content?.slice(0, 500)}...`
    ).join('\n\n');
    prompt = prompt.replace('${SOURCES}', sourcesText || 'No sources found');
  }
  
  return prompt;
}

// Updated workflow blueprint with proper prompt handling
export const DeepResearchMVPBlueprint: Blueprint = {
  id: "deep-research-mvp",
  name: "Deep Research Agent MVP",
  description: "Parallel research using Tavily and Wikipedia",
  version: "1.0.0",
  
  nodes: [
    {
      ref: "start",
      type: "start",
      parameters: {}
    },
    {
      ref: "analyze-query",  
      type: "llm",
      parameters: {
        model: "gpt-4",
        // This prompt will be dynamically modified at runtime
        prompt: "Analyze the following research query and extract key information:\n\nQuery: ${ORIGINAL_QUERY}\n\nProvide:\n1. Expanded query with related terms\n2. Query type (academic/current/technical/general)\n3. Key keywords for searching\n\nFormat as JSON.",
        temperature: 0.3,
        maxTokens: 500
      }
    },
    {
      ref: "parallel-search",
      type: "parallel_research",
      parameters: {
        timeout: 10000,
        continueOnPartialFailure: true,
        tools: [
          {
            type: "tavily",
            config: {
              searchDepth: "advanced",
              maxResults: 10,
              includeAnswer: true
            }
          },
          {
            type: "wikipedia",
            config: {
              maxPages: 5,
              extractSummary: false // MVP: Don't fetch full summaries
            }
          }
        ]
      }
    },
    {
      ref: "synthesize",
      type: "llm",
      parameters: {
        model: "gpt-4",
        // This prompt will be dynamically modified at runtime with actual sources
        prompt: "Synthesize the research findings into a comprehensive summary.\n\nOriginal Query: ${ORIGINAL_QUERY}\n\nSources:\n${SOURCES}\n\nProvide:\n1. Executive summary\n2. Key findings (3-5 points)\n3. Supporting evidence\n4. Confidence assessment\n5. Areas needing further research",
        temperature: 0.7,
        maxTokens: 2000
      }
    },
    {
      ref: "format-output",
      type: "output",
      parameters: {
        format: "json",
        template: "research_report"
      }
    },
    {
      ref: "end",
      type: "end",
      parameters: {}
    }
  ],
  
  edges: [
    { source: "start", target: "analyze-query" },
    { source: "analyze-query", target: "parallel-search" },
    { source: "parallel-search", target: "synthesize" },
    { source: "synthesize", target: "format-output" },
    { source: "format-output", target: "end" }
  ]
};
  readonly name: string = 'tavily';
  private config: TavilyConfig;
  private apiKey: string;
  
  constructor(config: TavilyConfig) {
    this.config = config;
    this.apiKey = process.env.TAVILY_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('TAVILY_API_KEY not configured');
    }
  }
  
  async search(query: string, keywords?: string[]): Promise<any[]> {
    try {
      // Use HttpRequest for API call (following existing pattern)
      const httpRequest = new HttpRequest({
        url: 'https://api.tavily.com/search',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: {
          query,
          search_depth: this.config.searchDepth,
          max_results: this.config.maxResults,
          include_answer: this.config.includeAnswer,
          include_raw_content: false,
          include_images: false
        },
        timeout: 10000
      });
      
      const result = await httpRequest.execute();
      
      if (result.status === 'completed' && result.data) {
        const response = result.data as any;
        return response.results?.map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
          publishedDate: r.published_date,
          type: 'web',
          tool: 'tavily'
        })) || [];
      }
      
      throw new Error('Tavily search returned no results');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tavily search failed';
      throw new Error(`Tavily search failed: ${errorMessage}`);
    }
  }
  
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!this.apiKey) {
      errors.push('Tavily API key is required');
    }
    
    if (this.config.maxResults < 1 || this.config.maxResults > 100) {
      errors.push('Max results must be between 1 and 100');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

#### 2.2 Custom LLM Wrapper for Dynamic Prompts

Since we need to modify prompts at runtime, we'll create a wrapper:

```typescript
// packages/autopilot/src/nodes/handlers/DynamicLLMHandler.ts
import { LlmHandler } from './LlmHandler';
import { Execution } from '@/types';

export class DynamicLLMHandler extends LlmHandler {
  async execute(execution: Execution) {
    const params = this.node.parameters as any;
    
    // Check if prompt has placeholders
    if (params.prompt && params.prompt.includes('${')) {
      // Prepare the prompt with actual data
      params.prompt = this.prepareDynamicPrompt(params.prompt, execution);
    }
    
    // Call parent execute with modified parameters
    return super.execute(execution);
  }
  
  private prepareDynamicPrompt(template: string, execution: Execution): string {
    let prompt = template;
    
    // Get user's original query
    const userMessages = execution.agentMemory?.getMessagesByRole('user') || [];
    const originalQuery = userMessages[userMessages.length - 1]?.content || '';
    
    // Get previous node results
    const analysisResult = execution.executionResults.get('analyze-query');
    const searchResults = execution.executionResults.get('parallel-search');
    
    // Extract data from results
    const analysisData = analysisResult?.data as any;
    const sources = (searchResults?.data as any)?.sources || [];
    
    // Replace common placeholders
    prompt = prompt.replace(/\$\{ORIGINAL_QUERY\}/g, originalQuery);
    prompt = prompt.replace(/\$\{QUERY\}/g, originalQuery);
    
    // Replace analysis data
    if (analysisData) {
      prompt = prompt.replace(/\$\{EXPANDED_QUERY\}/g, analysisData.expandedQuery || originalQuery);
      prompt = prompt.replace(/\$\{KEYWORDS\}/g, (analysisData.keywords || []).join(', '));
      prompt = prompt.replace(/\$\{QUERY_TYPE\}/g, analysisData.queryType || 'general');
    }
    
    // Replace sources
    if (prompt.includes('${SOURCES}')) {
      const sourcesText = sources.map((s: any, i: number) => 
        `[${i+1}] ${s.title}\nURL: ${s.url}\nType: ${s.type}\nContent: ${s.content?.slice(0, 500)}...`
      ).join('\n\n');
      prompt = prompt.replace(/\$\{SOURCES\}/g, sourcesText || 'No sources found');
    }
    
    return prompt;
  }
}
  
```

### Phase 3: Prompt Processing & Synthesis (Day 4-5)

#### 3.0 Dynamic Prompt Processing

Since your LLM handler doesn't process template variables, we need to handle this at runtime:

```typescript
// Helper function to prepare prompts with actual data
function prepareLLMPrompt(template: string, data: Record<string, any>): string {
  let prompt = template;
  
  // Replace placeholders with actual data
  if (prompt.includes('${QUERY_PLACEHOLDER}')) {
    prompt = prompt.replace('${QUERY_PLACEHOLDER}', data.query || '');
  }
  
  if (prompt.includes('${SOURCES_PLACEHOLDER}')) {
    const sourcesText = data.sources?.map((s: any, i: number) => 
      `[${i+1}] ${s.title}\nURL: ${s.url}\nContent: ${s.content?.slice(0, 500)}...`
    ).join('\n\n') || 'No sources found';
    prompt = prompt.replace('${SOURCES_PLACEHOLDER}', sourcesText);
  }
  
  return prompt;
}

// In your handler, before creating LLM node:
const processedPrompt = prepareLLMPrompt(originalPrompt, {
  query: execution.agentMemory?.getLastUserMessage(),
  sources: execution.executionResults.get('parallel-search')?.data?.sources
});
```

### Phase 3: Engine Registration & Workflow Configuration (Day 5)

#### 3.1 Register Handlers in Engine

```typescript
// packages/autopilot/src/engine/Engine.ts
// Add to HANDLER_MAP

const HANDLER_MAP: Record<string, () => Promise<HandlerConstructor>> = {
  // Existing handlers...
  start: () => import('@/nodes/handlers/StartHandler').then((m) => m.StartHandler),
  end: () => import('@/nodes/handlers/EndHandler').then((m) => m.EndHandler),
  llm: () => import('@/nodes/handlers/LlmHandler').then((m) => m.LlmHandler),
  output: () => import('@/nodes/handlers/OutputHandler').then((m) => m.OutputHandler),
  
  // Add new research handlers
  parallel_research: () => import('@/nodes/handlers/ParallelResearchHandler')
    .then((m) => m.ParallelResearchHandler),
  dynamic_llm: () => import('@/nodes/handlers/DynamicLLMHandler')
    .then((m) => m.DynamicLLMHandler),
};
```

#### 3.2 Update Blueprint to Use Dynamic LLM Handler

```typescript
// Update the blueprint nodes to use dynamic_llm type

export const DeepResearchMVPBlueprint: Blueprint = {
  // ... existing config ...
  nodes: [
    // ... other nodes ...
    {
      ref: "analyze-query",  
      type: "dynamic_llm", // Changed from "llm" to "dynamic_llm"
      parameters: {
        model: "gpt-4",
        prompt: "Analyze the following research query and extract key information:\n\nQuery: ${ORIGINAL_QUERY}\n\nProvide:\n1. Expanded query with related terms\n2. Query type (academic/current/technical/general)\n3. Key keywords for searching\n\nFormat as JSON.",
        temperature: 0.3,
        maxTokens: 500
      }
    },
    // ... parallel-search node stays the same ...
    {
      ref: "synthesize",
      type: "dynamic_llm", // Changed from "llm" to "dynamic_llm"
      parameters: {
        model: "gpt-4",
        prompt: "Synthesize the research findings into a comprehensive summary.\n\nOriginal Query: ${ORIGINAL_QUERY}\n\nSources:\n${SOURCES}\n\nProvide:\n1. Executive Summary (2-3 sentences)\n2. Key Findings (3-5 bullet points)\n3. Supporting Evidence (with source citations using [number] format)\n4. Confidence Assessment (High/Medium/Low with reasoning)\n5. Areas Needing Further Research\n\nUse clear, professional language and ensure all claims are supported by the sources.",
        temperature: 0.7,
        maxTokens: 2000,
        stream: true  // Enable streaming for synthesis
      }
    },
    // ... other nodes ...
  ]
};
```

---

## Technical Requirements

### Integration with Existing System

1. **New Handler Registration**
   - Add `ParallelResearchHandler` to the Engine's HANDLER_MAP
   - Handler follows existing BaseHandler pattern
   - Uses Execution object for data passing

2. **Data Flow**
   - Each handler stores results in `execution.executionResults` Map
   - Next nodes access previous results via the Map
   - AgentMemory provides context if needed

3. **Streaming Support**
   - Handler implements `setStreamingEmitter()` method
   - Emits progress events during search
   - Works with existing StreamingService

4. **Tool Pattern**
   - Tools are instantiated inside the handler (like HttpRequest, LLM)
   - No dependency injection needed
   - Tools use HttpRequest for API calls

### Dependencies

```json
{
  "dependencies": {
    // No new dependencies needed!
    // We use HttpRequest class for all API calls
    // Wikipedia API is REST-based, no SDK needed
    // Tavily API is REST-based, no SDK needed
  }
}
```

### Environment Variables

```env
# Add to your .env file

# Required API Keys
OPENROUTER_API_KEY=your_openrouter_key  # Already configured in your system
TAVILY_API_KEY=your_tavily_key         # Required - get from tavily.com

# Optional Configuration (with defaults)
RESEARCH_TIMEOUT_MS=10000        # Default: 10 seconds
MAX_SOURCES_PER_SEARCH=10        # Default: 10 sources
SYNTHESIS_MAX_TOKENS=2000        # Default: 2000 tokens
```

---

## Future Extensibility

### Designed for Growth

The MVP architecture is specifically designed to accommodate future enhancements without major refactoring:

#### 1. Adding New Tools (Week 2+)

```typescript
// Add new tool classes following the same pattern
// packages/autopilot/src/tools/ArxivSearchTool.ts
export class ArxivSearchTool {
  readonly name = 'arxiv';
  
  async search(query: string, keywords?: string[]): Promise<any[]> {
    const httpRequest = new HttpRequest({
      url: 'http://export.arxiv.org/api/query',
      method: 'GET',
      params: { search_query: query, max_results: 20 }
    });
    // Process and return results
  }
}

// Then add to ParallelResearchHandler's tool initialization:
case 'arxiv':
  return new ArxivSearchTool(toolConfig.config);
case 'reddit':
  return new RedditSearchTool(toolConfig.config);
// etc...
```

#### 2. Smart Tool Selection (Month 2)

```typescript
class SmartToolSelector {
  selectTools(query: AnalyzedQuery): Tool[] {
    // Academic → ArXiv + PubMed + Scholar
    // Current Events → Tavily + Reddit + News
    // Technical → StackOverflow + GitHub + Docs
    // Historical → Wikipedia + Archive.org
    
    return this.matchTools(query.type, query.keywords);
  }
}
```

#### 3. Multi-Stage Research (Month 3)

```typescript
// Progressive research depth
{
  stages: [
    {
      name: "broad_search",
      tools: ["tavily", "wikipedia"],
      depth: "surface"
    },
    {
      name: "deep_dive",
      tools: (stage1) => this.selectDeepTools(stage1),
      depth: "comprehensive"
    }
  ]
}
```

#### 4. Knowledge Graph Integration (Month 4)

```typescript
// Leverage existing Neo4j infrastructure
class ResearchKnowledgeGraph {
  async buildGraph(research: ResearchResult) {
    // Extract entities from findings
    const entities = await this.extractEntities(research);
    
    // Create nodes in Neo4j
    await this.neo4j.createNodes(entities);
    
    // Create relationships
    await this.neo4j.createRelationships(entities);
    
    // Enable graph traversal for insights
    return this.neo4j.query(`
      MATCH (n:Entity)-[r:RELATED_TO]-(m:Entity)
      WHERE n.research_id = $id
      RETURN n, r, m
    `);
  }
}
```

#### 5. Specialized Research Agents (Month 5-6)

```typescript
// Domain-specific agents extending base
class MedicalResearchAgent extends DeepResearchAgent {
  tools = ['pubmed', 'clinicaltrials', 'mayo_clinic'];
  synthesisStrategy = 'evidence_based';
}

class LegalResearchAgent extends DeepResearchAgent {
  tools = ['westlaw', 'justia', 'case_law'];
  synthesisStrategy = 'precedent_analysis';
}

class MarketResearchAgent extends DeepResearchAgent {
  tools = ['statista', 'bloomberg', 'sec_edgar'];
  synthesisStrategy = 'trend_analysis';
}
```

### Tool Addition Roadmap

| Phase | Tools | Implementation Pattern | Timeline |
|-------|-------|------------------------|----------|
| MVP | Tavily + Wikipedia | HttpRequest-based tools | Week 1 |
| Phase 2 | + DuckDuckGo, Reddit | Add tool classes, update handler | Week 2 |
| Phase 3 | + ArXiv, PubMed | Same pattern, academic APIs | Week 3 |
| Phase 4 | + News APIs | Add authentication handling | Month 2 |
| Phase 5 | + GitHub, StackOverflow | OAuth integration needed | Month 3 |
| Phase 6 | + Financial APIs | Premium API keys required | Month 4 |

---

## Timeline & Milestones (UPDATED)

### Week 1: MVP Development

| Day | Tasks | Deliverable |
|-----|-------|-------------|
| **Day 1** | Create ParallelResearchHandler with inline tools | Handler with Tavily/Wikipedia tools ready |
| **Day 2** | Create DynamicLLMHandler for prompt templating | Dynamic prompt processing working |
| **Day 3** | Register handlers in Engine, configure blueprint | Workflow configuration complete |
| **Day 4** | Test end-to-end workflow execution | Full research pipeline working |
| **Day 5** | Add streaming, error handling, edge cases | Production-ready MVP |

### Success Criteria

- [ ] Parallel execution working (both tools run simultaneously)
- [ ] Tavily returns 10+ sources
- [ ] Wikipedia returns 3-5 relevant pages
- [ ] Synthesis generates coherent summary
- [ ] Total execution time < 5 seconds
- [ ] Cost per research < $0.05

### Week 2+: Enhancement Phase

- Add 2-3 more free tools (DuckDuckGo, Reddit, ArXiv)
- Implement caching layer
- Add export capabilities (PDF, Markdown)
- Create research history tracking
- Build analytics dashboard

---

## Success Metrics

### Performance Metrics

| Metric | MVP Target | Future Target | Measurement |
|--------|------------|---------------|-------------|
| **Search Time** | < 5 seconds | < 3 seconds | End-to-end timing |
| **Parallel Success** | > 90% | > 95% | Both tools complete |
| **Sources Found** | 15-25 | 50-100 | Total unique sources |
| **Synthesis Quality** | 7/10 | 9/10 | User feedback |
| **Cost per Research** | < $0.05 | < $0.10 | API + LLM costs |

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Relevance** | > 80% | Sources match query intent |
| **Comprehensiveness** | > 75% | Coverage of topic aspects |
| **Accuracy** | > 95% | Factual correctness |
| **Citations** | 100% | All claims cited |

### Business Metrics

| Metric | 1 Month | 3 Months | 6 Months |
|--------|---------|----------|----------|
| **Researches/Day** | 100 | 500 | 2000 |
| **User Satisfaction** | 7/10 | 8/10 | 9/10 |
| **Tool Coverage** | 2 | 5 | 10+ |
| **Revenue** | $500 | $2,500 | $10,000 |

---

## Important Implementation Notes (UPDATED)

### Key Findings from Codebase Analysis

#### 1. Tool Location Strategy
- Tools should be implemented **inline within the handler** (following ToolService pattern)
- No separate tool files needed for MVP
- Tools are simple objects with `search` methods that use HttpRequest

#### 2. Prompt Template Handling (Resolved)
- **Solution: Use DynamicLLMHandler** (extends LlmHandler)
- Prepares prompts at runtime by replacing placeholders with actual data
- Accesses data from `execution.executionResults` Map
- No modifications needed to core LLM class

#### 3. AgentMemory Access (Clarified)
- Use `agentMemory.getMessagesByRole('user')` to get user messages
- Use `agentMemory.getMessages()` to get all messages  
- Last user message: `agentMemory.getMessagesByRole('user').pop()`
- No `getLastUserMessage()` method - must access via role filtering

### Data Access Pattern (UPDATED)

To access data from previous nodes:
```typescript
// Get data from previous node
const previousResult = execution.executionResults.get('node-ref');
const data = previousResult?.data;

// Get messages from agent memory (CORRECTED)
const userMessages = execution.agentMemory?.getMessagesByRole('user') || [];
const lastUserMessage = userMessages[userMessages.length - 1];

// Alternative: Get all messages
const allMessages = execution.agentMemory?.getMessages() || [];
```

### HttpRequest Response Structure

When using HttpRequest, the response structure is:
```typescript
{
  status: 'completed' | 'failed',
  data?: {
    body: any,  // The actual API response is here
    headers: Record<string, string>,
    status: number
  },
  error?: Error
}

// Access API response:
const result = await httpRequest.execute();
const apiResponse = result.data?.body; // NOT result.data directly
```

## Risk Mitigation

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Parallel execution bugs | High | Medium | Extensive testing, fallback to sequential |
| API rate limits | Medium | High | Caching, request queuing |
| Synthesis quality | High | Low | Prompt engineering, validation |
| Tool failures | Medium | Medium | Partial failure handling |

### Mitigation Strategies

1. **Graceful Degradation**: Continue with available results if one tool fails
2. **Caching Strategy**: Cache everything with appropriate TTLs
3. **Rate Limiting**: Implement per-user and per-tool limits
4. **Quality Checks**: Validate synthesis output before returning
5. **Monitoring**: Track all metrics from day one

---

## Implementation Checklist

### MVP Must-Haves
- [ ] Create ParallelResearchHandler extending BaseHandler
- [ ] Register handler in Engine's HANDLER_MAP
- [ ] Implement TavilySearchTool using HttpRequest
- [ ] Implement WikipediaSearchTool using HttpRequest
- [ ] Configure blueprint with proper node references and edges
- [ ] Add streaming support via setStreamingEmitter
- [ ] Test end-to-end workflow execution

### Nice-to-Haves for MVP
- [ ] Redis caching for search results
- [ ] Detailed progress updates via StreamingEmitter
- [ ] Confidence scoring algorithm
- [ ] Export to different formats via OutputHandler

### Future Features
- [ ] Additional search tools (ArXiv, Reddit, DuckDuckGo)
- [ ] Dynamic tool selection based on query type
- [ ] Multi-stage research workflows
- [ ] Neo4j knowledge graph integration
- [ ] Domain-specific research agents
- [ ] Real-time monitoring dashboard
- [ ] Advanced analytics with usage tracking

---

## Conclusion

This Deep Research Agent MVP leverages your existing Starships.ai architecture effectively:

- **Uses BaseHandler pattern** - No new abstractions needed
- **Works with Execution flow** - Data passes through executionResults Map
- **Integrates with Engine** - Simple handler registration in HANDLER_MAP
- **Follows existing patterns** - Tools instantiated like HttpRequest and LLM
- **Supports streaming** - Via existing StreamingEmitter interface

The parallel execution of Tavily (current information) and Wikipedia (established facts) creates a powerful research combination that can be built in 5 days and scaled indefinitely. By following your established patterns, we ensure consistency and maintainability while adding powerful new capabilities.

## Key Architecture Alignment

### Handler Pattern
```typescript
// Your existing pattern
class YourHandler extends BaseHandler {
  constructor(protected node: WorkflowNode) { super(node); }
  async execute(execution: Execution): Promise<Execution> { }
}

// Research Agent follows the same
class ParallelResearchHandler extends BaseHandler {
  constructor(protected node: WorkflowNode) { super(node); }
  async execute(execution: Execution): Promise<Execution> { }
}
```

### Tool Instantiation
```typescript
// Your existing pattern (HttpRequest, LLM)
const httpRequest = new HttpRequest(params);
const result = await httpRequest.execute();

// Research Agent follows the same
const tavilyTool = new TavilySearchTool(config);
const results = await tavilyTool.search(query);
```

### Data Flow
```typescript
// Your existing pattern
execution.executionResults.set(this.node.ref, result);
const previousResult = execution.executionResults.get(previousNodeRef);

// Research Agent follows the same
return this.createSuccessResult(execution, data);
const previousData = execution.executionResults.get('analyze-query');
```

---

*Document Version: 2.0*  
*Created: 2025-01-14*  
*Updated: 2025-01-14*  
*Status: Aligned with Starships.ai Architecture*  
*Changes: Updated to match existing BaseHandler pattern, Execution flow, and Engine infrastructure*