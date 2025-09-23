#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import neo4j from 'neo4j-driver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Import the Wikipedia tool definition
const wikipediaBlueprint = {
  nodes: [
    { 
      ref: 'start_1', 
      type: 'start', 
      name: 'Start', 
      description: 'Receive Wikipedia query parameters', 
      parameters: {
        output: '{{ $input() }}'
      } 
    },
    {
      ref: 'prepare_request',
      type: 'code',
      name: 'Prepare Request',
      description: 'Build the appropriate Wikipedia API URL based on action',
      parameters: {
        code: `
          const params = input;
          const { query, action, limit = 5, language = 'en' } = params || {};
          
          console.log('[WIKIPEDIA TOOL] Extracted params:', { query, action, limit, language });
          
          if (!query || typeof query !== 'string') {
            throw new Error('Query is required and must be a string');
          }
          
          if (!action || !['search', 'summary', 'content', 'sections'].includes(action)) {
            throw new Error('Action must be one of: search, summary, content, sections');
          }
          
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
              url = \`\${baseUrl}/w/api.php?action=opensearch&search=\${encodedQuery}&limit=\${limit}&format=json\`;
              break;
            case 'summary':
              url = \`\${baseUrl}/api/rest_v1/page/summary/\${encodedQuery}\`;
              break;
            case 'content':
              url = \`\${baseUrl}/api/rest_v1/page/mobile-html/\${encodedQuery}\`;
              headers['Accept'] = 'text/html; charset=utf-8';
              break;
            case 'sections':
              url = \`\${baseUrl}/w/api.php?action=parse&page=\${encodedQuery}&prop=sections&format=json\`;
              break;
          }
          
          return {
            request: { url, method, headers },
            metadata: { action, query, language, limit }
          };
        `,
        timeout: 5000,
        mutations: [
          {
            operation: 'add',
            path: '/wikipedia_metadata',
            value: '{{ $lastOutputOf("prepare_request")[0].json.metadata }}'
          }
        ]
      }
    },
    {
      ref: 'fetch_wikipedia',
      type: 'http_request',
      name: 'Fetch from Wikipedia',
      description: 'Execute HTTP request to Wikipedia API',
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
          const httpResponse = input || {};
          const metadata = state.wikipedia_metadata || {};
          
          console.log('[COMBINE DATA] Metadata from state:', metadata);
          
          return {
            httpResponse: httpResponse,
            metadata: {
              action: metadata.action || 'unknown',
              query: metadata.query || '',
              language: metadata.language || 'en'
            }
          };
        `,
        timeout: 5000
      }
    },
    {
      ref: 'process_response',
      type: 'code',
      name: 'Process Response',
      description: 'Parse and format Wikipedia API response',
      parameters: {
        code: `
          const { httpResponse, metadata } = input || {};
          const response = httpResponse?.body;
          const { action, query, language } = metadata || {};
          const timestamp = new Date().toISOString();
          
          let result;
          
          switch(action) {
            case 'search':
              if (Array.isArray(response) && response.length >= 4) {
                const [searchQuery, titles, descriptions, urls] = response;
                result = {
                  action: 'search',
                  query: query,
                  language: language,
                  timestamp: timestamp,
                  totalResults: titles ? titles.length : 0,
                  results: titles ? titles.map((title, i) => ({
                    title: title,
                    description: descriptions[i] || '',
                    url: urls[i] || \`https://\${language}.wikipedia.org/wiki/\${encodeURIComponent(title)}\`
                  })) : []
                };
              } else {
                result = {
                  action: 'search',
                  query: query,
                  language: language,
                  timestamp: timestamp,
                  totalResults: 0,
                  results: [],
                  error: 'Unexpected response format'
                };
              }
              break;
              
            case 'summary':
              if (response && response.title) {
                result = {
                  action: 'summary',
                  query: query,
                  language: language,
                  timestamp: timestamp,
                  found: true,
                  title: response.title,
                  extract: response.extract || '',
                  url: response.content_urls?.desktop?.page || null
                };
              } else {
                result = {
                  action: 'summary',
                  query: query,
                  language: language,
                  timestamp: timestamp,
                  found: false,
                  error: 'Page not found'
                };
              }
              break;
              
            default:
              result = {
                action: action,
                query: query,
                language: language,
                timestamp: timestamp,
                data: response
              };
          }
          
          return result;
        `,
        timeout: 5000
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
    { ref: 'e1', from: 'start_1', to: 'prepare_request' },
    { ref: 'e2', from: 'prepare_request', to: 'fetch_wikipedia' },
    { ref: 'e3', from: 'fetch_wikipedia', to: 'combine_data' },
    { ref: 'e4', from: 'combine_data', to: 'process_response' },
    { ref: 'e5', from: 'process_response', to: 'end_1' }
  ]
};

async function updateWikipediaTool() {
  console.log('🔧 Updating Wikipedia tool in database...\n');
  
  const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
  );
  
  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
  
  try {
    // Update tool template
    const templateResult = await session.run(
      `
      MATCH (tt:ToolTemplate {slug: 'wikipedia-search'})
      SET tt.blueprint = $blueprint
      SET tt.updatedAt = $timestamp
      RETURN COUNT(tt) as updated
      `,
      {
        blueprint: JSON.stringify(wikipediaBlueprint),
        timestamp: new Date().toISOString()
      }
    );
    
    console.log(`✅ Updated ${templateResult.records[0]?.get('updated') || 0} tool template(s)`);
    
    // Update tool instances
    const instanceResult = await session.run(
      `
      MATCH (t:Tool {slug: 'wikipedia-search'})
      SET t.blueprint = $blueprint
      SET t.updatedAt = $timestamp
      RETURN COUNT(t) as updated
      `,
      {
        blueprint: JSON.stringify(wikipediaBlueprint),
        timestamp: new Date().toISOString()
      }
    );
    
    console.log(`✅ Updated ${instanceResult.records[0]?.get('updated') || 0} tool instance(s)`);
    
    console.log('\n🎉 Complete! The Wikipedia tool has been updated.');
    console.log('Please remove and re-add your Research Agent to test.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

updateWikipediaTool().catch(console.error);