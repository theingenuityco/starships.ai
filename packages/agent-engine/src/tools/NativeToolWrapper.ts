/**
 * NativeToolWrapper - Direct API integration for agent tools
 *
 * Simplified tool wrapper that uses direct API integration for various services
 */

import { DynamicTool } from '@langchain/core/tools';
import { RepositoryFactory } from '@starships/models';

export interface NativeToolConfig {
  starshipId: string;
  agentId: string;
  enableLogging?: boolean;
}

export class NativeToolWrapper {
  private config: NativeToolConfig;
  private toolUsageStats: Map<string, number> = new Map();

  constructor(config: NativeToolConfig) {
    this.config = config;
  }
  
  /**
   * Create all native tools for a starship
   */
  async createAllTools(): Promise<DynamicTool[]> {
    try {
      // Get user's API keys from database
      const apiKeyRepo = RepositoryFactory.getNativeToolApiKeyRepository();
      const apiKeys = await apiKeyRepo.getAllApiKeys(this.config.starshipId);
      
      const langchainTools: DynamicTool[] = [];
      
      // Add Brave Search if API key exists
      if (apiKeys.brave) {
        try {
          const { BraveSearch } = await import('@langchain/community/tools/brave_search');
          
          const braveTool = new BraveSearch({
            apiKey: apiKeys.brave
          });
          
          const wrappedBrave = new DynamicTool({
            name: 'brave_web_search',
            description: 'Privacy-focused web search using Brave Search API. Provide search terms as input.',
            func: async (input: string) => {
              console.log(`[NativeToolWrapper] Brave search for starship ${this.config.starshipId}: ${input}`);
              this.trackUsage('brave_web_search');
              const result = await braveTool.invoke(input);
              return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            }
          });
          
          langchainTools.push(wrappedBrave);
          console.log(`[NativeToolWrapper] Added Brave search for starship ${this.config.starshipId}`);
        } catch (error) {
          console.error('[NativeToolWrapper] Failed to add Brave tool:', error);
        }
      }
      
      // Add Firecrawl if API key exists
      if (apiKeys.firecrawl) {
        try {
          const { FirecrawlTool } = await import('./native/FirecrawlTool');
          
          const firecrawlTool = new FirecrawlTool(apiKeys.firecrawl);
          langchainTools.push(firecrawlTool.toDynamicTool());
          
          console.log(`[NativeToolWrapper] Added Firecrawl for starship ${this.config.starshipId}`);
        } catch (error) {
          console.error('[NativeToolWrapper] Failed to add Firecrawl tool:', error);
        }
      }
      
      // Add Notion if API key exists
      if (apiKeys.notion) {
        try {
          const { NotionTool } = await import('./native/NotionTool');
          
          const notionTool = new NotionTool(apiKeys.notion);
          const notionDynamicTool = notionTool.toDynamicTool();
          langchainTools.push(notionDynamicTool);
          
          console.log(`[NativeToolWrapper] Added Notion tool for starship ${this.config.starshipId}`);
        } catch (error) {
          console.error('[NativeToolWrapper] Failed to add Notion tool:', error);
        }
      }

      // Add Tavily if API key exists
      if (apiKeys.tavily) {
        try {
          const { TavilySearchResults } = await import('@langchain/community/tools/tavily_search');
          
          const tavilyTool = new TavilySearchResults({
            apiKey: apiKeys.tavily,
            maxResults: 5
          });
          
          const wrappedTavily = new DynamicTool({
            name: 'tavily_search',
            description: 'Advanced web search using Tavily API for comprehensive search results. Provide search query as input.',
            func: async (input: string) => {
              console.log(`[NativeToolWrapper] Tavily search for starship ${this.config.starshipId}: ${input}`);
              this.trackUsage('tavily_search');
              const result = await tavilyTool.invoke(input);
              return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            }
          });
          
          langchainTools.push(wrappedTavily);
          console.log(`[NativeToolWrapper] Added Tavily Search for starship ${this.config.starshipId}`);
        } catch (error) {
          console.error('[NativeToolWrapper] Failed to add Tavily Search tool:', error);
        }
      }
      
      if (this.config.enableLogging) {
        const toolNames = langchainTools.map(t => t.name).join(', ');
        console.log(`[NativeToolWrapper] Created ${langchainTools.length} native tools: ${toolNames}`);
      }
      
      return langchainTools;
      
    } catch (error) {
      console.error('[NativeToolWrapper] Error loading native tools:', error);
      return []; // Return empty array to allow graceful degradation
    }
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

// Keep the old class name for backward compatibility during migration
export class MCPToolWrapper extends NativeToolWrapper {
  // Maintain the old interface temporarily
  constructor(config: { starshipId: string; agentId: string; enableLogging?: boolean; gateway?: any }) {
    super({
      starshipId: config.starshipId,
      agentId: config.agentId,
      enableLogging: config.enableLogging
    });
  }
}