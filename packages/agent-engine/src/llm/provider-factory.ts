import { LangChainProvider } from "./langchain-provider";
import { LLMProvider } from "@starships/protocol";
import { AgentRepository, ModelRepository } from "@starships/neo4j-models";

export class ProviderFactory {
  private static providers = new Map<string, LLMProvider>();
  private static agentRepository: AgentRepository;
  private static modelRepository: ModelRepository;

  static initialize(agentRepo: AgentRepository, modelRepo: ModelRepository) {
    this.agentRepository = agentRepo;
    this.modelRepository = modelRepo;
  }

  static async getProvider(agentId: string): Promise<LLMProvider> {
    // Check cache first
    if (this.providers.has(agentId)) {
      return this.providers.get(agentId)!;
    }

    try {
      // Get agent from repository
      const agent = await this.agentRepository.findById(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Get model config
      const model = await this.modelRepository.findById(agent.model);
      if (!model) {
        // Fallback to default model
        const defaultModel = {
          id: 'default-openai-gpt4',
          name: process.env.DEFAULT_CHAT_MODEL || 'gpt-4',
          provider: 'openai' as const,
          temperature: 0.7,
          maxTokens: 4096,
        };
        
        const provider = new LangChainProvider(defaultModel);
        this.providers.set(agentId, provider);
        return provider;
      }

      // Create LangChain provider instance
      const provider = new LangChainProvider(model);
      
      // Cache and return
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