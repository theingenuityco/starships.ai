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
        description: 'Academic search query (research topic, author name, paper title, etc.)'
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
        description: 'Number of results to return (1-200, default: 25)'
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
            const urlParams = [];
            
            // Main search query
            urlParams.push('search=' + encodeURIComponent(query));
            
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
              urlParams.push('filter=' + encodeURIComponent(filters.join(',')));
            }
            
            // Sorting with validation
            const validSorts = {
              'relevance': 'relevance_score:desc',
              'publication_date': 'publication_date:desc',
              'cited_by_count': 'cited_by_count:desc'
            };
            const sortValue = validSorts[sortBy] || validSorts.relevance;
            urlParams.push('sort=' + encodeURIComponent(sortValue));
            
            // Pagination
            urlParams.push('per-page=' + numPerPage);
            urlParams.push('page=1');
            
            // Format
            urlParams.push('format=json');
            
            // Construct final URL
            const url = baseUrl + endpoint + '?' + urlParams.join('&');
            
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