import { LangChainProvider } from "./langchain-provider";
import { LLMProvider } from "@starships/protocol";
import { AgentRepository, LLMRepository } from "@starships/models";

/**
 * Factory for creating and caching LLM providers per agent
 */
export class ProviderFactory {
  private static providers = new Map<string, LLMProvider>();
  private static agentRepository: AgentRepository;
  private static llmRepository: LLMRepository;

  static initialize(agentRepo: AgentRepository, llmRepo: LLMRepository) {
    this.agentRepository = agentRepo;
    this.llmRepository = llmRepo;
  }

  static async getProvider(agentId: string): Promise<LLMProvider> {
    if (this.providers.has(agentId)) {
      return this.providers.get(agentId)!;
    }

    try {
      const agent = await this.agentRepository.findById(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      const llm = await this.llmRepository.findById(agent.model);
      if (!llm) {
        const defaultModel = {
          id: process.env.DEFAULT_MODEL_ID || 'default-openai-gpt4',
          name: process.env.DEFAULT_CHAT_MODEL || 'gpt-4',
          provider: (process.env.DEFAULT_PROVIDER as 'openai' | 'anthropic') || 'openai',
          temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
          maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4096', 10),
          createdAt: new Date().toISOString(),
        };
        
        const provider = new LangChainProvider(defaultModel);
        this.providers.set(agentId, provider);
        return provider;
      }

      const provider = new LangChainProvider(llm);
      
      this.providers.set(agentId, provider);
      return provider;
    } catch (error) {
      throw new Error(`Failed to get provider for agent ${agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static clearCache(agentId?: string) {
    if (agentId) {
      this.providers.delete(agentId);
    } else {
      this.providers.clear();
    }
  }
} 