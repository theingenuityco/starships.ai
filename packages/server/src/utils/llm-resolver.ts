import { RepositoryFactory } from "@starships/models";

/**
 * Centralized LLM model resolution logic
 * Moved from agents/llm-resolver.ts to utils for cleaner architecture
 */
export async function resolveLLMModel(modelIdOrName: string): Promise<any> {
  // Note: LLMRepository temporarily removed during refactoring
  // const llmRepo = RepositoryFactory.getLLMRepository();
  throw new Error('LLMRepository not available during refactoring');
  
}