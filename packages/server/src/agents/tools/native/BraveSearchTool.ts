import { DynamicTool } from '@langchain/core/tools';
import { BraveSearch } from '@langchain/community/tools/brave_search';

export class BraveSearchTool {
  private apiKey: string;
  private braveSearch: BraveSearch;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.braveSearch = new BraveSearch({
      apiKey: this.apiKey
    });
  }

  /**
   * Execute a web search using Brave Search API
   */
  async search(query: string): Promise<string> {
    try {
      const result = await this.braveSearch.invoke(query);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (error: any) {
      if (error.response?.status === 402) {
        throw new Error('Brave Search API quota exceeded. Please check your plan.');
      }
      if (error.response?.status === 401) {
        throw new Error('Invalid Brave Search API key.');
      }
      throw new Error(`Brave Search failed: ${error.message}`);
    }
  }

  /**
   * Convert to LangChain DynamicTool
   */
  toDynamicTool(): DynamicTool {
    return new DynamicTool({
      name: 'brave_web_search',
      description: 'Privacy-focused web search using Brave Search API. Provide search terms as input.',
      func: async (input: string) => {
        try {
          return await this.search(input);
        } catch (error) {
          return JSON.stringify({
            error: `Brave Search operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
    });
  }
}