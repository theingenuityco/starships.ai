import { DynamicTool } from '@langchain/core/tools';
import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

export class FirecrawlTool {
  private apiKey: string;
  private baseUrl = 'https://api.firecrawl.dev/v1';
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    
    // Create axios instance with retry logic
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Configure retry logic
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.response?.status === 429; // Rate limit
      }
    });
  }

  async scrape(url: string, options?: {
    formats?: string[];
    onlyMainContent?: boolean;
    waitFor?: number;
  }) {
    try {
      const response = await this.client.post('/scrape', {
        url,
        formats: options?.formats || ['markdown'],
        onlyMainContent: options?.onlyMainContent ?? true,
        waitFor: options?.waitFor || 0
      });
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 402) {
        throw new Error('Firecrawl API quota exceeded. Please check your plan.');
      }
      if (error.response?.status === 401) {
        throw new Error('Invalid Firecrawl API key.');
      }
      throw new Error(`Firecrawl scraping failed: ${error.message}`);
    }
  }

  async crawl(url: string, options?: {
    maxPages?: number;
    includes?: string[];
    excludes?: string[];
  }) {
    try {
      const response = await this.client.post('/crawl', {
        url,
        maxPages: options?.maxPages || 10,
        includes: options?.includes,
        excludes: options?.excludes
      });
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 402) {
        throw new Error('Firecrawl API quota exceeded. Please check your plan.');
      }
      if (error.response?.status === 401) {
        throw new Error('Invalid Firecrawl API key.');
      }
      throw new Error(`Firecrawl crawling failed: ${error.message}`);
    }
  }

  toDynamicTool(): DynamicTool {
    return new DynamicTool({
      name: 'firecrawl_scraper',
      description: 'Extract clean, structured data from any website. Supports single page scraping and multi-page crawling with JavaScript rendering.',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          
          if (params.mode === 'crawl') {
            return JSON.stringify(await this.crawl(params.url, params.options));
          } else {
            return JSON.stringify(await this.scrape(params.url, params.options));
          }
        } catch {
          // Fallback to simple URL scraping if JSON parsing fails
          const result = await this.scrape(input);
          return JSON.stringify(result);
        }
      }
    });
  }
}