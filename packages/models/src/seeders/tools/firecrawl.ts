import type { ToolParams } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Firecrawl Web Scraping Tool Definition
 * Requires API key - AI-powered web scraping with content extraction
 * Converts web pages to clean markdown
 */
export const firecrawlTool: ToolParams = {
  name: 'firecrawl_scrape',
  description: 'Extract and convert web page content to clean markdown using AI-powered scraping. Handles dynamic content, removes clutter, and provides structured text output.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL of the web page to scrape and convert to markdown'
      },
      formats: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['markdown', 'html', 'rawHtml', 'screenshot', 'links', 'extract'],
          description: 'Output format type'
        },
        description: 'Output formats (default: ["markdown"])'
      },
      includeTags: {
        type: 'array',
        items: { 
          type: 'string',
          description: 'HTML tag selector'
        },
        description: 'HTML tags to specifically include (e.g., ["article", "main", "div.content"])'
      },
      excludeTags: {
        type: 'array', 
        items: { 
          type: 'string',
          description: 'HTML tag selector to exclude'
        },
        description: 'HTML tags to exclude (e.g., ["nav", "footer", "aside", ".ad"])'
      },
      onlyMainContent: {
        type: 'boolean',
        description: 'Extract only the main content, removing navigation, ads, etc. (default: true)'
      },
      waitFor: {
        type: 'number',
        description: 'Time to wait for page to load in milliseconds (default: 0)'
      },
      timeout: {
        type: 'number',
        description: 'Maximum time to wait for page load in milliseconds (default: 30000)'
      },
      headers: {
        type: 'object',
        description: 'Custom HTTP headers to send with the request'
      },
      extract: {
        type: 'object',
        description: 'Schema for structured data extraction (when using extract format)',
        properties: {
          schema: {
            type: 'object',
            description: 'JSON schema defining what data to extract'
          },
          prompt: {
            type: 'string', 
            description: 'Natural language prompt describing what to extract'
          }
        }
      }
    },
    required: ['url']
  },
  blueprint: {
    nodes: [
      {
        ref: 'start_1',
        type: 'start',
        name: 'Start',
        description: 'Receive Firecrawl scraping parameters',
        parameters: {
          output: '{{ $input() }}'
        }
      },
      {
        ref: 'prepare_request',
        type: 'code',
        name: 'Prepare Request',
        description: 'Build Firecrawl API request with validation',
        parameters: {
          code: `
            // Extract and validate input parameters
            const params = input || {};
            const { 
              url,
              formats = ['markdown'],
              includeTags,
              excludeTags,
              onlyMainContent = true,
              waitFor = 0,
              timeout = 30000,
              headers,
              extract
            } = params;
            
            // Input validation
            if (!url || typeof url !== 'string') {
              throw new Error('URL is required and must be a string. Received: ' + JSON.stringify(params));
            }
            
            // Validate URL format
            try {
              new URL(url);
            } catch (e) {
              throw new Error('Invalid URL format: ' + url);
            }
            
            // Validate formats
            const validFormats = ['markdown', 'html', 'rawHtml', 'screenshot', 'links', 'extract'];
            if (!Array.isArray(formats) || formats.some(f => !validFormats.includes(f))) {
              throw new Error('formats must be an array of valid format types: ' + validFormats.join(', '));
            }
            
            // Validate timeout
            const numTimeout = parseInt(timeout);
            if (isNaN(numTimeout) || numTimeout < 1000 || numTimeout > 120000) {
              throw new Error('timeout must be a number between 1000 and 120000 milliseconds');
            }
            
            // Get API key from environment
            const apiKey = env('FIRECRAWL_API_KEY');
            if (!apiKey) {
              throw new Error('FIRECRAWL_API_KEY environment variable is required');
            }
            
            // Build request body
            const requestBody = {
              url: url,
              formats: formats,
              onlyMainContent: onlyMainContent,
              waitFor: waitFor,
              timeout: numTimeout
            };
            
            // Add optional parameters
            if (includeTags && Array.isArray(includeTags)) {
              requestBody.includeTags = includeTags;
            }
            
            if (excludeTags && Array.isArray(excludeTags)) {
              requestBody.excludeTags = excludeTags;
            }
            
            if (headers && typeof headers === 'object') {
              requestBody.headers = headers;
            }
            
            if (extract && formats.includes('extract')) {
              requestBody.extract = extract;
            }
            
            return {
              request: {
                url: 'https://api.firecrawl.dev/v1/scrape',
                method: 'POST',
                headers: {
                  'Authorization': 'Bearer ' + apiKey,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
              },
              metadata: {
                targetUrl: url,
                formats: formats,
                timestamp: new Date().toISOString()
              }
            };
          `,
          timeout: 5000,
          mutations: [
            {
              operation: 'add',
              path: '/state/firecrawl_metadata',
              value: '{{ $lastOutputOf("prepare_request")[0].json.metadata }}'
            }
          ]
        }
      },
      {
        ref: 'fetch_firecrawl',
        type: 'http_request',
        name: 'Fetch from Firecrawl',
        description: 'Execute HTTP request to Firecrawl API',
        parameters: {
          url: '{{ $lastOutputOf("prepare_request")[0].json.request.url }}',
          method: '{{ $lastOutputOf("prepare_request")[0].json.request.method }}',
          headers: '{{ $lastOutputOf("prepare_request")[0].json.request.headers }}',
          body: '{{ $lastOutputOf("prepare_request")[0].json.request.body }}',
          timeout: 60000,
          retries: 2,
          retryDelay: 2000,
          retryOn: [500, 502, 503, 504, 408]
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
            const metadata = state.firecrawl_metadata || {};
            
            // Parse the response body if it's a string
            let parsedBody = httpResponse.body;
            if (typeof httpResponse.body === 'string') {
              try {
                parsedBody = JSON.parse(httpResponse.body);
              } catch (e) {
                console.error('Failed to parse Firecrawl response as JSON');
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
        description: 'Parse and format Firecrawl API response',
        parameters: {
          code: `
            // Input contains both httpResponse and metadata
            const { httpResponse, metadata } = input || {};
            const data = httpResponse?.body || {};
            const { targetUrl, formats, timestamp } = metadata || {};
            
            try {
              // Initialize result structure (consistent with existing tools)
              const result = {
                url: targetUrl || '',
                timestamp: timestamp || new Date().toISOString(),
                responseType: 'web_scrape',
                success: false,
                content: {},
                metadata: {}
              };
              
              // Check for successful response
              if (data.success && data.data) {
                result.success = true;
                const scrapedData = data.data;
                
                // Extract content based on requested formats
                if (scrapedData.markdown) {
                  result.content.markdown = scrapedData.markdown;
                }
                
                if (scrapedData.html) {
                  result.content.html = scrapedData.html;
                }
                
                if (scrapedData.rawHtml) {
                  result.content.rawHtml = scrapedData.rawHtml;
                }
                
                if (scrapedData.screenshot) {
                  result.content.screenshot = scrapedData.screenshot;
                }
                
                if (scrapedData.links) {
                  result.content.links = scrapedData.links;
                }
                
                if (scrapedData.extract) {
                  result.content.extractedData = scrapedData.extract;
                }
                
                // Add page metadata
                result.metadata = {
                  title: scrapedData.metadata?.title || null,
                  description: scrapedData.metadata?.description || null,
                  keywords: scrapedData.metadata?.keywords || null,
                  author: scrapedData.metadata?.author || null,
                  publishedTime: scrapedData.metadata?.publishedTime || null,
                  modifiedTime: scrapedData.metadata?.modifiedTime || null,
                  contentLength: scrapedData.markdown?.length || 0,
                  processingTime: Date.now() - new Date(timestamp).getTime(),
                  apiProvider: 'Firecrawl',
                  responseType: 'scraped_content',
                  formats: formats,
                  sourceUrl: scrapedData.metadata?.sourceURL || targetUrl,
                  statusCode: scrapedData.metadata?.statusCode || null,
                  contentType: scrapedData.metadata?.contentType || null
                };
              }
              
              // Handle failure
              if (!result.success) {
                result.metadata = {
                  processingTime: Date.now() - new Date(timestamp).getTime(),
                  apiProvider: 'Firecrawl',
                  error: data.error || 'Failed to scrape content',
                  suggestion: 'Check if URL is accessible and try again',
                  sourceUrl: targetUrl,
                  statusCode: data.statusCode || null
                };
              }
              
              return result;
              
            } catch (error) {
              return {
                url: targetUrl || '',
                timestamp: timestamp || new Date().toISOString(),
                success: false,
                error: error.message || 'Error processing Firecrawl response',
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
        description: 'Return Firecrawl scraping results',
        parameters: {
          output: '{{ $input() }}'
        }
      }
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'prepare_request' },
      { ref: 'e2', from: 'prepare_request', to: 'fetch_firecrawl' },
      { ref: 'e3', from: 'fetch_firecrawl', to: 'combine_data' },
      { ref: 'e4', from: 'combine_data', to: 'process_response' },
      { ref: 'e5', from: 'process_response', to: 'end_1' }
    ],
    metadata: {
      version: '1.0.0',
      author: 'Starships.ai',
      requiresApiKey: true,
      rateLimit: '500 pages/month (free), scaling plans available',
      coverage: 'AI-powered web scraping with content extraction'
    }
  }
};

/**
 * Firecrawl Tool Template Configuration
 */
export const firecrawlToolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
  // Core ToolParams
  name: firecrawlTool.name,
  description: firecrawlTool.description,
  parameters: firecrawlTool.parameters,
  blueprint: firecrawlTool.blueprint,

  // Template metadata
  slug: 'firecrawl-scrape',
  category: 'data',
  exampleUsage: JSON.stringify({
    articleExtraction: { 
      name: 'firecrawl_scrape', 
      arguments: { 
        url: 'https://example.com/article',
        formats: ['markdown'],
        onlyMainContent: true
      } 
    },
    fullPageScrape: { 
      name: 'firecrawl_scrape', 
      arguments: { 
        url: 'https://example.com',
        formats: ['markdown', 'html', 'links'],
        onlyMainContent: false
      } 
    },
    structuredExtraction: { 
      name: 'firecrawl_scrape', 
      arguments: { 
        url: 'https://news.example.com/article',
        formats: ['markdown', 'extract'],
        extract: {
          schema: {
            headline: 'string',
            author: 'string', 
            publishDate: 'string',
            summary: 'string'
          }
        }
      } 
    }
  }, null, 2),
  requiresApiKey: true,
  configurationFields: [
    {
      name: 'FIRECRAWL_API_KEY',
      type: 'string',
      description: 'API key from https://firecrawl.dev',
      required: true
    }
  ]
};