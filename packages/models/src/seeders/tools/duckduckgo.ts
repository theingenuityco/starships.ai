import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * DuckDuckGo Instant Answer Tool Definition
 * No API key required - uses public Instant Answer API
 */
export const duckduckgoTool: ToolParams = {
  name: 'duckduckgo_instant',
  description: 'Get instant answers, definitions, calculations, and quick facts from DuckDuckGo',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for instant answers, facts, or calculations'
      },
      skipDisambiguation: {
        type: 'boolean',
        description: 'Skip disambiguation pages for more direct results (defaults to true)'
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
        description: 'Receive DuckDuckGo query parameters', 
        parameters: {} 
      },
      {
        ref: 'prepare_request',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build DuckDuckGo API URL with query parameters',
        parameters: {
          code: `
            // Extract and validate input parameters
            const { query, skipDisambiguation = true } = input || {};
            
            // Input validation
            if (!query || typeof query !== 'string') {
              throw new Error('Query is required and must be a string');
            }
            
            // Security: Length check
            if (query.length > 200) {
              throw new Error('Query too long - maximum 200 characters');
            }
            
            // Security: Dangerous content check
            const dangerous = ['<script', 'javascript:', 'onclick', 'onerror', '<iframe', 'document.', 'window.'];
            const lowerQuery = query.toLowerCase();
            for (let i = 0; i < dangerous.length; i++) {
              if (lowerQuery.indexOf(dangerous[i]) !== -1) {
                throw new Error('Query contains potentially dangerous content');
              }
            }
            
            // Manual URL parameter building (URLSearchParams not available in code node)
            const params = [];
            params.push('q=' + encodeURIComponent(query));
            params.push('format=json');
            params.push('no_html=1');
            params.push('skip_disambig=' + (skipDisambiguation ? '1' : '0'));
            params.push('no_redirect=1');
            
            const url = 'https://api.duckduckgo.com/?' + params.join('&');
            
            return {
              request: {
                url: url,
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'StarshipsAI-ResearchAgent/1.0'
                }
              },
              metadata: {
                query: query,
                timestamp: new Date().toISOString()
              }
            };
          `,
          timeout: 5000,
          mutations: [
            {
              operation: 'add',
              path: '/state/duckduckgo_metadata',
              value: '{{ $lastOutputOf("prepare_request")[0].json.metadata }}'
            }
          ]
        }
      },
      {
        ref: 'fetch_duckduckgo',
        type: 'http_request',
        name: 'Fetch from DuckDuckGo',
        description: 'Execute HTTP request to DuckDuckGo Instant Answer API',
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
            // Get the HTTP response from the previous node - it's the direct input
            const httpResponse = input || {};
            
            // Get metadata from state (stored by prepare_request)
            const metadata = state.duckduckgo_metadata || {};
            
            // Parse the response body if it's a string
            let parsedBody = httpResponse.body;
            if (typeof httpResponse.body === 'string') {
              try {
                parsedBody = JSON.parse(httpResponse.body);
              } catch (e) {
                console.error('Failed to parse DuckDuckGo response as JSON');
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
        description: 'Parse and structure DuckDuckGo API response',
        parameters: {
          code: `
            // Input now contains both httpResponse and metadata
            const { httpResponse, metadata } = input || {};
            const data = httpResponse?.body || {};
            const { query, timestamp } = metadata || {};
            
            try {
              // Initialize result structure
              const result = {
                query: query || '',
                timestamp: timestamp || new Date().toISOString(),
                responseType: 'none',
                found: false,
                data: {}
              };
              
              // Check for Abstract (topic summary)
            if (data.Abstract && data.Abstract.length > 0) {
              result.responseType = 'abstract';
              result.found = true;
              result.data = {
                abstract: {
                  text: data.AbstractText || data.Abstract,
                  source: data.AbstractSource || null,
                  url: data.AbstractURL || null,
                  heading: data.Heading || null,
                  image: data.Image || null
                }
              };
            }
            
            // Check for Definition
            if (data.Definition && data.Definition.length > 0) {
              result.responseType = result.responseType === 'none' ? 'definition' : 'mixed';
              result.found = true;
              result.data.definition = {
                text: data.Definition,
                source: data.DefinitionSource || null,
                url: data.DefinitionURL || null
              };
            }
            
            // Check for Answer (instant answer - calculations, conversions, etc.)
            if (data.Answer && data.Answer.length > 0) {
              result.responseType = result.responseType === 'none' ? 'answer' : 'mixed';
              result.found = true;
              result.data.answer = {
                text: data.Answer,
                type: data.AnswerType || 'instant',
                // Extract numeric value if present (for calculations)
                value: data.Answer.match(/[0-9,.-]+/) ? 
                  parseFloat(data.Answer.match(/[0-9,.-]+/)[0].replace(/,/g, '')) : null
              };
            }
            
            // Check for Infobox (structured data)
            if (data.Infobox && data.Infobox.content && data.Infobox.content.length > 0) {
              result.responseType = result.responseType === 'none' ? 'infobox' : 'mixed';
              result.found = true;
              
              // Process infobox content into key-value pairs
              const infoboxData = {};
              data.Infobox.content.forEach(item => {
                if (item.label && item.value) {
                  // Clean up the label to be a valid key
                  const key = item.label
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                  infoboxData[key] = item.value;
                }
              });
              
              result.data.infobox = {
                data: infoboxData,
                meta: data.Infobox.meta || []
              };
            }
            
            // Check for Related Topics
            if (data.RelatedTopics && data.RelatedTopics.length > 0) {
              const topics = [];
              
              data.RelatedTopics.forEach(topic => {
                if (topic.Text) {
                  // Direct topic
                  topics.push({
                    text: topic.Text,
                    url: topic.FirstURL || null,
                    icon: topic.Icon ? topic.Icon.URL : null
                  });
                } else if (topic.Topics && Array.isArray(topic.Topics)) {
                  // Grouped topics
                  topic.Topics.forEach(subtopic => {
                    if (subtopic.Text) {
                      topics.push({
                        text: subtopic.Text,
                        url: subtopic.FirstURL || null,
                        icon: subtopic.Icon ? subtopic.Icon.URL : null,
                        category: topic.Name || null
                      });
                    }
                  });
                }
              });
              
              if (topics.length > 0) {
                result.data.relatedTopics = topics.slice(0, 5); // Limit to 5 topics
              }
            }
            
            // Check for Results (general web results - rarely populated in instant API)
            if (data.Results && data.Results.length > 0) {
              result.data.webResults = data.Results.map(r => ({
                text: r.Text || '',
                url: r.FirstURL || null,
                icon: r.Icon ? r.Icon.URL : null
              })).slice(0, 3); // Limit to 3 results
            }
            
            // Handle disambiguation
            if (data.Type === 'D') {
              result.responseType = 'disambiguation';
              result.data.disambiguation = {
                options: result.data.relatedTopics || [],
                message: 'Multiple meanings found. Please be more specific.'
              };
            }
            
            // Handle no results
            if (!result.found) {
              result.responseType = 'no_results';
              result.data = {
                message: 'No instant answers found for this query',
                suggestion: 'Try rephrasing your question or search for more specific terms'
              };
            }
            
            // Add metadata
            result.metadata = {
              api: 'DuckDuckGo Instant Answer API',
              responseTime: new Date().toISOString(),
              redirect: data.Redirect || null,
              type: data.Type || null
            };
            
            return result;
            
          } catch (error) {
            // Return error response
            return {
              query: query || '',
              timestamp: timestamp || new Date().toISOString(),
              responseType: 'error',
              found: false,
              error: error.message || 'Error processing DuckDuckGo response',
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
        description: 'Return DuckDuckGo instant answer results', 
        parameters: { 
          output: '{{ $input() }}'
        } 
      }
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare_request' },
      { ref: 'e2', from: 'prepare_request', to: 'fetch_duckduckgo' },
      { ref: 'e3', from: 'fetch_duckduckgo', to: 'combine_data' },
      { ref: 'e4', from: 'combine_data', to: 'process_response' },
      { ref: 'e5', from: 'process_response', to: 'end_1' }
    ],
    metadata: {
      version: '1.0.0',
      author: 'Starships.ai',
      requiresApiKey: false,
      rateLimit: 'No official rate limit, but be respectful'
    }
  }
};

/**
 * DuckDuckGo Tool Template Configuration
 */
export const duckduckgoToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: duckduckgoTool.name,
  description: duckduckgoTool.description,
  parameters: duckduckgoTool.parameters,
  blueprint: duckduckgoTool.blueprint,

  // Template metadata
  slug: 'duckduckgo-instant',
  category: 'data',
  exampleUsage: JSON.stringify({
    calculation: { name: 'duckduckgo_instant', arguments: { query: '15% of 250' } },
    definition: { name: 'duckduckgo_instant', arguments: { query: 'define quantum computing' } },
    fact: { name: 'duckduckgo_instant', arguments: { query: 'population of Tokyo' } },
    conversion: { name: 'duckduckgo_instant', arguments: { query: '100 USD to EUR' } }
  }, null, 2),
  requiresApiKey: false,
  configurationFields: []
};