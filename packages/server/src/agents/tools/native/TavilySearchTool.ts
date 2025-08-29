import { DynamicTool } from '@langchain/core/tools';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';

export class TavilySearchTool {
  private apiKey: string;
  private tavilySearch: TavilySearchResults;
  private maxResults: number;

  constructor(apiKey: string, maxResults: number = 5) {
    this.apiKey = apiKey;
    this.maxResults = maxResults;
    this.tavilySearch = new TavilySearchResults({
      apiKey: this.apiKey,
      maxResults: this.maxResults
    });
  }

  /**
   * Execute an advanced web search using Tavily API
   */
  async search(query: string): Promise<string> {
    try {
      const result = await this.tavilySearch.invoke(query);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (error: any) {
      if (error.response?.status === 402) {
        throw new Error('Tavily Search API quota exceeded. Please check your plan.');
      }
      if (error.response?.status === 401) {
        throw new Error('Invalid Tavily Search API key.');
      }
      throw new Error(`Tavily Search failed: ${error.message}`);
    }
  }

  /**
   * Convert to LangChain DynamicTool
   */
  toDynamicTool(): DynamicTool {
    return new DynamicTool({
      name: 'tavily_search',
      description: 'Advanced web search using Tavily API for comprehensive search results. Provide search query as input.',
      func: async (input: string) => {
        try {
          return await this.search(input);
        } catch (error) {
          return JSON.stringify({
            error: `Tavily Search operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
    });
  }
}