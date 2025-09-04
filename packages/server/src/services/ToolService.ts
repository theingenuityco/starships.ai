import { NativeToolApiKeyRepository } from '@starships/models';
// Note: LLMToolDefinition type needs to be defined based on the actual interface needed
// For now, creating a local interface until the proper type is available
interface LLMToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * Simple tool interface that replaces LangChain's DynamicTool
 */
interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
  execute(input: string): Promise<string>;
}

/**
 * Tool Service for managing agent tools
 * Follows the same pattern as other services, replaces NativeToolWrapper
 */
export class ToolService {
  private starshipId: string;
  private agentId: string;
  private enableLogging: boolean;
  private toolUsageStats: Map<string, number> = new Map();

  constructor(config: { starshipId: string; agentId: string; enableLogging?: boolean }) {
    this.starshipId = config.starshipId;
    this.agentId = config.agentId;
    this.enableLogging = config.enableLogging || false;
  }

  /**
   * Get all available tools for the starship
   */
  async getAllTools(): Promise<AgentTool[]> {
    try {
      const apiKeyRepo = new NativeToolApiKeyRepository();
      const apiKeys = await apiKeyRepo.getAllApiKeys(this.starshipId);

      const tools: AgentTool[] = [];

      // Add Brave Search if API key exists
      if (apiKeys.brave) {
        tools.push(await this.createBraveSearchTool(apiKeys.brave));
      }

      // Add Firecrawl if API key exists
      if (apiKeys.firecrawl) {
        tools.push(await this.createFirecrawlTool(apiKeys.firecrawl));
      }

      // Add Notion if API key exists
      if (apiKeys.notion) {
        tools.push(await this.createNotionTool(apiKeys.notion));
      }

      // Add Tavily if API key exists
      if (apiKeys.tavily) {
        tools.push(await this.createTavilySearchTool(apiKeys.tavily));
      }

      if (this.enableLogging) {
        const toolNames = tools.map((t) => t.name).join(', ');
        console.log(
          `[TOOL-SERVICE] Created ${tools.length} tools for starship ${this.starshipId}: ${toolNames}`
        );
      }

      return tools;
    } catch (error) {
      console.error('[TOOL-SERVICE] Error loading tools:', error);
      return [];
    }
  }

  /**
   * Convert tools to LLM tool definitions
   */
  getToolDefinitions(tools: AgentTool[]): LLMToolDefinition[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    tools: AgentTool[],
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Convert args to input string (most tools expect string input)
    const input = JSON.stringify(args);

    if (this.enableLogging) {
      console.log(`[TOOL-SERVICE] Executing ${toolName} for starship ${this.starshipId}: ${input}`);
    }

    this.trackUsage(toolName);
    return await tool.execute(input);
  }

  /**
   * Create Brave Search Tool
   */
  private async createBraveSearchTool(apiKey: string): Promise<AgentTool> {
    return {
      name: 'brave_web_search',
      description:
        'Search the web using Brave Search API. Useful for finding current information, news, facts, and general web content.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute',
          },
        },
        required: ['query'],
      },
      execute: async (input: string) => {
        try {
          const args = JSON.parse(input);
          const axios = (await import('axios')).default;

          const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
            headers: {
              Accept: 'application/json',
              'Accept-Encoding': 'gzip',
              'X-Subscription-Token': apiKey,
            },
            params: {
              q: args.query,
              count: 5,
            },
          });

          if (response.data.web?.results) {
            const results = response.data.web.results
              .slice(0, 5)
              .map((result: any) => `**${result.title}**\n${result.description}\n${result.url}`)
              .join('\n\n');
            return `Search results for "${args.query}":\n\n${results}`;
          } else {
            return `No search results found for "${args.query}"`;
          }
        } catch (error) {
          return `Error searching: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    };
  }

  /**
   * Create Firecrawl Tool
   */
  private async createFirecrawlTool(apiKey: string): Promise<AgentTool> {
    return {
      name: 'firecrawl_scrape',
      description: 'Scrape and extract content from web pages using Firecrawl API.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to scrape',
          },
        },
        required: ['url'],
      },
      execute: async (input: string) => {
        try {
          const args = JSON.parse(input);
          const axios = (await import('axios')).default;

          const response = await axios.post(
            'https://api.firecrawl.dev/v0/scrape',
            {
              url: args.url,
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.data.success) {
            return response.data.data.content || 'No content extracted';
          } else {
            return `Error scraping: ${response.data.error}`;
          }
        } catch (error) {
          return `Error scraping: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    };
  }

  /**
   * Create Notion Tool
   */
  private async createNotionTool(apiKey: string): Promise<AgentTool> {
    return {
      name: 'notion_search',
      description: 'Search and retrieve content from Notion workspace.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query for Notion content',
          },
        },
        required: ['query'],
      },
      execute: async (input: string) => {
        try {
          const args = JSON.parse(input);
          const { Client } = await import('@notionhq/client');
          const notion = new Client({ auth: apiKey });

          const response = await notion.search({
            query: args.query,
            filter: {
              property: 'object',
              value: 'page',
            },
          });

          if (response.results.length === 0) {
            return 'No results found in Notion workspace';
          }

          const results = response.results
            .slice(0, 5)
            .map((page: any) => {
              const title = page.properties?.title?.title?.[0]?.plain_text || 'Untitled';
              return `- ${title} (${page.url})`;
            })
            .join('\n');

          return `Found ${response.results.length} results:\n${results}`;
        } catch (error) {
          return `Error searching Notion: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    };
  }

  /**
   * Create Tavily Search Tool
   */
  private async createTavilySearchTool(apiKey: string): Promise<AgentTool> {
    return {
      name: 'tavily_search',
      description:
        'Advanced AI-powered search using Tavily API. Better for research and finding comprehensive information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute',
          },
        },
        required: ['query'],
      },
      execute: async (input: string) => {
        try {
          const args = JSON.parse(input);
          const axios = (await import('axios')).default;

          const response = await axios.post(
            'https://api.tavily.com/search',
            {
              api_key: apiKey,
              query: args.query,
              max_results: 5,
            },
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.data.results && response.data.results.length > 0) {
            const results = response.data.results
              .map(
                (result: any) =>
                  `**${result.title}**\n${result.content || result.raw_content}\n${result.url}`
              )
              .join('\n\n');
            return `Search results for "${args.query}":\n\n${results}`;
          } else {
            return `No search results found for "${args.query}"`;
          }
        } catch (error) {
          return `Error searching: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    };
  }

  /**
   * Track tool usage for analytics
   */
  private trackUsage(toolName: string): void {
    const currentCount = this.toolUsageStats.get(toolName) || 0;
    this.toolUsageStats.set(toolName, currentCount + 1);
  }

  /**
   * Get tool usage statistics
   */
  getUsageStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [tool, count] of this.toolUsageStats.entries()) {
      stats[tool] = count;
    }
    return stats;
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(): void {
    this.toolUsageStats.clear();
  }
}
