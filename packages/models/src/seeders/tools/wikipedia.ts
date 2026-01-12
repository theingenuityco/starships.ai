import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Wikipedia Tool Definition using HTTP REST API
 * No NPM packages required - uses native http_request node
 */
export const wikipediaTool: ToolParams = {
  name: 'wikipedia_search',
  slug: 'wikipedia-search',
  description: 'Search Wikipedia and return results via the Wikipedia REST API.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query or exact page title for Wikipedia',
      },
      action: {
        type: 'string',
        enum: ['search', 'summary', 'content', 'sections'],
        description:
          'Type of operation: search (find articles), summary (quick overview), content (full article), sections (article structure)',
      },
      limit: {
        type: 'number',
        description: 'Number of search results to return (1-10, default 5)',
      },
      language: {
        type: 'string',
        description: 'Wikipedia language code (e.g., "en", "es", "fr", default "en")',
      },
    },
    required: ['query', 'action'],
  },
  blueprint: {
    nodes: [
      {
        ref: 'start_1',
        type: 'start',
        name: 'Start',
        description: 'Receive Wikipedia query parameters',
        parameters: {},
      },
      {
        ref: 'prepare_request',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build the appropriate Wikipedia API URL based on action',
        parameters: {
          code: `
            // Extract and validate input parameters
            // The input comes as a single object with all parameters
            const params = ctx.input || {};
            const {
              query,
              action,
              limit = 5,
              language = 'en'
            } = params || {};
            
            // console.log('[WIKIPEDIA TOOL] Extracted params:', { query, action, limit, language });
            
            // Input validation
            if (!query || typeof query !== 'string') {
              throw new Error('Query is required and must be a string.');
            }
            
            if (!action || !['search', 'summary', 'content', 'sections'].includes(action)) {
              throw new Error('Action must be one of: search, summary, content, sections');
            }
            
            // Encode query for URL
            const encodedQuery = encodeURIComponent(query);
            const baseUrl = language === 'en' ? 'https://en.wikipedia.org' : \`https://\${language}.wikipedia.org\`;
            
            let url;
            let method = 'GET';
            let headers = {
              'Accept': 'application/json',
              'User-Agent': 'StarshipsAI-ResearchAgent/1.0'
            };
            
            switch(action) {
              case 'search':
                // OpenSearch API for finding articles
                url = \`\${baseUrl}/w/api.php?action=opensearch&search=\${encodedQuery}&limit=\${limit}&format=json\`;
                break;
                
              case 'summary':
                // REST API v1 for page summary
                url = \`\${baseUrl}/api/rest_v1/page/summary/\${encodedQuery}\`;
                break;
                
              case 'content':
                // REST API v1 for mobile-html (lighter than full HTML)
                url = \`\${baseUrl}/api/rest_v1/page/mobile-html/\${encodedQuery}\`;
                headers['Accept'] = 'text/html; charset=utf-8';
                break;
                
              case 'sections':
                // MediaWiki API for page sections
                url = \`\${baseUrl}/w/api.php?action=parse&page=\${encodedQuery}&prop=sections&format=json\`;
                break;
                
              default:
                throw new Error('Unknown action: ' + action);
            }
            
            return {
              request: {
                url: url,
                method: method,
                headers: headers
              },
              metadata: {
                action: action,
                query: query,
                language: language,
                limit: limit
              }
            };
          `,
          timeout: 5000,
          // Store metadata in state for later nodes using reducers
          reducers: [
            "(state, ctx) => { const prepared = ctx.lastOutputOf('prepare_request') || {}; return { ...state, wikipedia_metadata: prepared.metadata }; }",
          ],
        },
      },
      {
        ref: 'fetch_wikipedia',
        type: 'http_request',
        name: 'Fetch from Wikipedia',
        description: 'Execute HTTP request to Wikipedia API',
        parameters: {
          url: '{{ (lastOutputOf("prepare_request") || {}).request?.url }}',
          method: '{{ (lastOutputOf("prepare_request") || {}).request?.method }}',
          headers: '{{ (lastOutputOf("prepare_request") || {}).request?.headers }}',
          timeout: 30000,
        },
      },
      {
        ref: 'combine_data',
        type: 'code',
        name: 'Combine Metadata with Response',
        description: 'Combine request metadata with HTTP response',
        parameters: {
          code: `
            async function main(ctx) {
              const httpResponse = ctx.input || {};
              const metadata = (ctx.state && ctx.state.wikipedia_metadata) || {};
              return {
                httpResponse,
                metadata: {
                  action: metadata.action || 'unknown',
                  query: metadata.query || '',
                  language: metadata.language || 'en'
                }
              };
            }
          `,
          timeout: 5000,
        },
      },
      {
        ref: 'process_response',
        type: 'code',
        name: 'Process Response',
        description: 'Parse and format Wikipedia API response',
        parameters: {
          code: `
            async function main(ctx) {
              const packed = ctx.input || {};
              const httpResponse = packed && packed.httpResponse;
              const metadata = packed?.metadata || {};
              const response = httpResponse?.body;
              const { action, query, language } = metadata || {};
              const timestamp = new Date().toISOString();
              try {
                let result;
                switch (action) {
                  case 'search':
                    if (Array.isArray(response) && response.length >= 4) {
                      const [searchQuery, titles, descriptions, urls] = response;
                      result = {
                        action: 'search',
                        query,
                        language,
                        timestamp,
                        totalResults: Array.isArray(titles) ? titles.length : 0,
                        results: Array.isArray(titles)
                          ? titles.map((title, i) => ({
                              title,
                              description: (Array.isArray(descriptions) ? descriptions[i] : '') || '',
                              url: (Array.isArray(urls) ? urls[i] : null) || ('https://' + String(language) + '.wikipedia.org/wiki/' + encodeURIComponent(String(title))),
                            }))
                          : [],
                      };
                    } else {
                      result = {
                        action: 'search',
                        query,
                        language,
                        timestamp,
                        totalResults: 0,
                        results: [],
                        error: 'Unexpected response format',
                      };
                    }
                    break;
                  case 'summary':
                    if (response && response.title) {
                      result = {
                        action: 'summary',
                        query,
                        language,
                        timestamp,
                        found: true,
                        title: response.title,
                        displayTitle: response.displaytitle || response.title,
                        pageId: response.pageid,
                        extract: response.extract || '',
                        description: response.description || null,
                        url: response.content_urls?.desktop?.page || null,
                        mobileUrl: response.content_urls?.mobile?.page || null,
                        thumbnail: response.thumbnail
                          ? {
                              source: response.thumbnail.source,
                              width: response.thumbnail.width,
                              height: response.thumbnail.height,
                            }
                          : null,
                        coordinates: response.coordinates || null,
                        lastRevisionId: response.revision || null,
                      };
                    } else if (response && response.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
                      result = {
                        action: 'summary',
                        query,
                        language,
                        timestamp,
                        found: false,
                        error: 'Page not found',
                        suggestion: 'Try using the search action first to find exact page titles',
                      };
                    } else {
                      result = {
                        action: 'summary',
                        query,
                        language,
                        timestamp,
                        found: false,
                        error: 'Unable to retrieve summary',
                      };
                    }
                    break;
                  case 'content':
                    if (typeof response === 'string' && response.includes('<')) {
                      let textContent = response
                        .replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '')
                        .replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, '')
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\\s+/g, ' ')
                        .trim();
                      if (textContent.length > 50000) {
                        textContent = textContent.substring(0, 50000) + '... [content truncated]';
                      }
                      result = {
                        action: 'content',
                        query,
                        language,
                        timestamp,
                        found: true,
                        content: textContent,
                        contentLength: textContent.length,
                        format: 'text',
                        note: 'HTML content converted to plain text',
                      };
                    } else {
                      result = {
                        action: 'content',
                        query,
                        language,
                        timestamp,
                        found: false,
                        error: 'Unable to retrieve content',
                      };
                    }
                    break;
                  case 'sections':
                    if (response && response.parse && response.parse.sections) {
                      const sections = response.parse.sections;
                      result = {
                        action: 'sections',
                        query,
                        language,
                        timestamp,
                        found: true,
                        title: response.parse.title || query,
                        totalSections: sections.length,
                        sections: sections.map((section) => ({
                          number: section.number,
                          level: parseInt(section.level) || 1,
                          title: section.line || 'Untitled',
                          index: section.index ? parseInt(section.index) : null,
                          anchor: section.anchor || null,
                          byteOffset: section.byteoffset || null,
                        })),
                      };
                    } else if (response && response.error) {
                      result = {
                        action: 'sections',
                        query,
                        language,
                        timestamp,
                        found: false,
                        error: response.error.info || 'Page not found',
                      };
                    } else {
                      result = {
                        action: 'sections',
                        query,
                        language,
                        timestamp,
                        found: false,
                        error: 'Unable to retrieve sections',
                      };
                    }
                    break;
                  default:
                    result = {
                      action,
                      query,
                      language,
                      timestamp,
                      error: 'Unknown action',
                    };
                }
                return result;
              } catch (error) {
                return {
                  action,
                  query,
                  language,
                  timestamp,
                  error: (error && error.message) || 'Error processing Wikipedia response',
                  type: 'processing_error',
                };
              }
            }
          `,
          timeout: 5000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: 'Return Wikipedia query results',
        parameters: {
          output: '{{ input }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare_request' },
      { ref: 'e2', from: 'prepare_request', to: 'fetch_wikipedia' },
      { ref: 'e3', from: 'fetch_wikipedia', to: 'combine_data' },
      { ref: 'e4', from: 'combine_data', to: 'process_response' },
      { ref: 'e5', from: 'process_response', to: 'end_1' },
    ],
    metadata: {
      author: 'Starships.ai',
      requiresApiKey: false,
      rateLimit: 'Wikipedia API rate limits apply (200 requests per hour per IP)',
    },
  },
};

/**
 * Wikipedia Tool Template Configuration
 */
export const wikipediaToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: wikipediaTool.name,
  description: wikipediaTool.description,
  parameters: wikipediaTool.parameters,
  blueprint: wikipediaTool.blueprint,

  // Template metadata
  slug: 'wikipedia-search',
  version: '1.0.1',
  category: 'data',
  exampleUsage: JSON.stringify(
    {
      search: { name: 'wikipedia_search', arguments: { query: 'artificial intelligence', action: 'search' } },
      summary: { name: 'wikipedia_search', arguments: { query: 'Machine learning', action: 'summary' } },
      content: { name: 'wikipedia_search', arguments: { query: 'Deep learning', action: 'content' } },
      sections: { name: 'wikipedia_search', arguments: { query: 'Neural network', action: 'sections' } },
    },
    null,
    2
  ),
  requiresApiKey: false,
  configurationFields: [],
};
