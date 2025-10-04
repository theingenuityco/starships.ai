import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Brave Search Web Search Tool Definition
 * Requires API key - premium web search with independent index
 * Real-time results with privacy focus
 */
export const braveSearchTool: ToolParams = {
  name: 'brave_search',
  description: 'Search the web using Brave Search independent index. Provides real-time, privacy-focused web search results with fresh content and minimal SEO manipulation.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Web search query (keywords, phrases, questions)'
      },
      count: {
        type: 'number',
        description: 'Number of search results to return (1-20, default: 10)'
      },
      offset: {
        type: 'number', 
        description: 'Number of results to skip for pagination (default: 0)'
      },
      country: {
        type: 'string',
        description: 'Country code for localized results (e.g., "US", "GB", "DE")'
      },
      search_lang: {
        type: 'string',
        description: 'Language for search interface (e.g., "en", "es", "fr")'
      },
      ui_lang: {
        type: 'string', 
        description: 'Language for UI elements (e.g., "en-US", "es-ES")'
      },
      safesearch: {
        type: 'string',
        enum: ['strict', 'moderate', 'off'],
        description: 'Safe search level (default: moderate)'
      },
      freshness: {
        type: 'string',
        enum: ['pd', 'pw', 'pm', 'py'],
        description: 'Result freshness: pd=past day, pw=past week, pm=past month, py=past year'
      },
      text_decorations: {
        type: 'boolean',
        description: 'Whether to include text decorations in snippets (default: true)'
      },
      spellcheck: {
        type: 'boolean',
        description: 'Whether to include spell check suggestions (default: true)'
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
        description: 'Receive Brave Search parameters',
        parameters: {
          output: '{{ $input() }}'
        }
      },
      {
        ref: 'prepare_request',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build Brave Search API request with validation',
        parameters: {
          code: `
            // Extract and validate input parameters
            const params = input || {};
            const { 
              query, 
              count = 10,
              offset = 0,
              country,
              search_lang,
              ui_lang,
              safesearch = 'moderate',
              freshness,
              text_decorations = true,
              spellcheck = true
            } = params;
            
            // Input validation
            if (!query || typeof query !== 'string') {
              throw new Error('Query is required and must be a string. Received: ' + JSON.stringify(params));
            }
            
            if (query.length > 400) {
              throw new Error('Query too long - maximum 400 characters');
            }
            
            // Validate count
            const numCount = parseInt(count);
            if (isNaN(numCount) || numCount < 1 || numCount > 20) {
              throw new Error('count must be a number between 1 and 20');
            }
            
            // Validate offset
            const numOffset = parseInt(offset);
            if (isNaN(numOffset) || numOffset < 0) {
              throw new Error('offset must be a non-negative number');
            }
            
            // Get API key from environment
            const apiKey = env('BRAVE_SEARCH_API_KEY');
            if (!apiKey) {
              throw new Error('BRAVE_SEARCH_API_KEY environment variable is required');
            }
            
            // Build API URL
            const baseUrl = 'https://api.search.brave.com/res/v1/web/search';
            
            // Manual URL parameter building
            const urlParams = [];
            
            // Required parameters
            urlParams.push('q=' + encodeURIComponent(query));
            urlParams.push('count=' + numCount);
            
            // Optional parameters
            if (numOffset > 0) {
              urlParams.push('offset=' + numOffset);
            }
            
            if (country) {
              urlParams.push('country=' + encodeURIComponent(country));
            }
            
            if (search_lang) {
              urlParams.push('search_lang=' + encodeURIComponent(search_lang));
            }
            
            if (ui_lang) {
              urlParams.push('ui_lang=' + encodeURIComponent(ui_lang));
            }
            
            urlParams.push('safesearch=' + encodeURIComponent(safesearch));
            
            if (freshness) {
              urlParams.push('freshness=' + encodeURIComponent(freshness));
            }
            
            urlParams.push('text_decorations=' + text_decorations);
            urlParams.push('spellcheck=' + spellcheck);
            
            // Construct final URL
            const url = baseUrl + '?' + urlParams.join('&');
            
            // Validate URL length
            if (url.length > 2000) {
              throw new Error('Query too complex - URL length exceeds limits');
            }
            
            return {
              request: {
                url: url,
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                  'Accept-Encoding': 'gzip',
                  'X-Subscription-Token': apiKey
                }
              },
              metadata: {
                query: query,
                count: numCount,
                offset: numOffset,
                timestamp: new Date().toISOString()
              }
            };
          `,
          timeout: 5000,
          mutations: [
            {
              operation: 'add',
              path: '/state/brave_search_metadata',
              value: '{{ $lastOutputOf("prepare_request")[0].json.metadata }}'
            }
          ]
        }
      },
      {
        ref: 'fetch_brave_search',
        type: 'http_request',
        name: 'Fetch from Brave Search',
        description: 'Execute HTTP request to Brave Search API',
        parameters: {
          url: '{{ $lastOutputOf("prepare_request")[0].json.request.url }}',
          method: '{{ $lastOutputOf("prepare_request")[0].json.request.method }}',
          headers: '{{ $lastOutputOf("prepare_request")[0].json.request.headers }}',
          timeout: 30000,
          retries: 2,
          retryDelay: 1000,
          retryOn: [500, 502, 503, 504]
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
            const metadata = state.brave_search_metadata || {};
            
            // Parse the response body if it's a string
            let parsedBody = httpResponse.body;
            if (typeof httpResponse.body === 'string') {
              try {
                parsedBody = JSON.parse(httpResponse.body);
              } catch (e) {
                console.error('Failed to parse Brave Search response as JSON');
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
        description: 'Parse and format Brave Search API response',
        parameters: {
          code: `
            // Input contains both httpResponse and metadata
            const { httpResponse, metadata } = input || {};
            const data = httpResponse?.body || {};
            const { query, count, offset, timestamp } = metadata || {};
            
            try {
              // Initialize result structure (consistent with existing tools)
              const result = {
                query: query || '',
                timestamp: timestamp || new Date().toISOString(),
                responseType: 'web_search',
                found: false,
                results: [],
                metadata: {}
              };
              
              // Check for successful response with web results
              if (data.web && data.web.results && Array.isArray(data.web.results)) {
                result.found = data.web.results.length > 0;
                
                // Format web search results
                result.results = data.web.results.map((item, index) => ({
                  title: item.title || 'No title',
                  url: item.url || '',
                  description: item.description || '',
                  displayUrl: item.display_url || item.url || '',
                  publishedDate: item.published || null,
                  snippet: item.snippet || item.description || '',
                  language: item.language || null,
                  isFamily: item.family_friendly || null,
                  rank: index + 1 + (offset || 0),
                  relevanceScore: 1.0 - (index / data.web.results.length)
                }));
                
                // Add comprehensive metadata
                result.metadata = {
                  totalResults: data.web.total || data.web.results.length,
                  searchTime: Date.now() - new Date(timestamp).getTime(),
                  apiProvider: 'Brave Search',
                  responseType: 'web_results',
                  count: count,
                  offset: offset || 0,
                  hasMore: data.web.results.length === count,
                  query_altered: data.query?.altered || null,
                  spell_check: data.query?.spellcheck_off ? null : data.query?.corrected_query || null,
                  search_information: {
                    safe_search: data.query?.safesearch || null,
                    is_navigational: data.query?.is_navigational || false,
                    is_informational: data.query?.is_informational || false
                  }
                };
              }
              
              // Handle no results
              if (!result.found) {
                result.metadata = {
                  totalResults: 0,
                  searchTime: Date.now() - new Date(timestamp).getTime(),
                  apiProvider: 'Brave Search',
                  error: 'No web results found',
                  suggestion: 'Try different keywords, broader terms, or check spelling',
                  query_altered: data.query?.altered || null,
                  spell_check: data.query?.spellcheck_off ? null : data.query?.corrected_query || null
                };
              }
              
              return result;
              
            } catch (error) {
              return {
                query: query || '',
                timestamp: timestamp || new Date().toISOString(),
                found: false,
                error: error.message || 'Error processing Brave Search response',
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
        description: 'Return Brave Search results',
        parameters: {
          output: '{{ $input() }}'
        }
      }
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare_request' },
      { ref: 'e2', from: 'prepare_request', to: 'fetch_brave_search' },
      { ref: 'e3', from: 'fetch_brave_search', to: 'combine_data' },
      { ref: 'e4', from: 'combine_data', to: 'process_response' },
      { ref: 'e5', from: 'process_response', to: 'end_1' }
    ],
    metadata: {
      version: '1.0.0',
      author: 'Starships.ai',
      requiresApiKey: true,
      rateLimit: 'Varies by plan (1000-10000+ queries/month)',
      coverage: 'Real-time web search with independent index'
    }
  }
};

/**
 * Brave Search Tool Template Configuration
 */
export const braveSearchToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: braveSearchTool.name,
  description: braveSearchTool.description,
  parameters: braveSearchTool.parameters,
  blueprint: braveSearchTool.blueprint,

  // Template metadata
  slug: 'brave-search',
  category: 'data',
  exampleUsage: JSON.stringify({
    currentEvents: { 
      name: 'brave_search', 
      arguments: { 
        query: 'latest quantum computing breakthrough 2024',
        count: 10,
        freshness: 'pm'
      } 
    },
    research: { 
      name: 'brave_search', 
      arguments: { 
        query: 'artificial intelligence safety research',
        count: 15,
        country: 'US'
      } 
    },
    factCheck: { 
      name: 'brave_search', 
      arguments: { 
        query: 'climate change statistics 2024',
        freshness: 'py',
        safesearch: 'strict'
      } 
    }
  }, null, 2),
  requiresApiKey: true,
  configurationFields: [
    {
      name: 'BRAVE_SEARCH_API_KEY',
      type: 'string',
      description: 'API key from https://brave.com/search/api/',
      required: true
    }
  ]
};