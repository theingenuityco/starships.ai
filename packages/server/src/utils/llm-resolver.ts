import { RepositoryFactory } from "@starships/models";

/**
 * Centralized LLM model resolution logic
 * Moved from agents/llm-resolver.ts to utils for cleaner architecture
 */
export async function resolveLLMModel(modelIdOrName: string): Promise<any> {
  const llmRepo = RepositoryFactory.getLLMRepository();
  
  // Try to find by ID first
  let llmModel = await llmRepo.findById(modelIdOrName);
  
  // If not found and doesn't look like a UUID, try finding by name
  if (!llmModel && !modelIdOrName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    console.log(`🔍 [LLM-RESOLVER] Model ID "${modelIdOrName}" not found, searching by name...`);
    const allModels = await llmRepo.findAll();
    llmModel = allModels.find((m: any) => m.name === modelIdOrName || m.id === modelIdOrName) || null;
  }
  
  if (!llmModel) {
    throw new Error(`LLM model ${modelIdOrName} not found`);
  }
  
  console.log(`✅ [LLM-RESOLVER] Model resolved successfully:`, {
    id: llmModel.id,
    name: llmModel.name,
    provider: llmModel.provider,
    temperature: llmModel.temperature
  });
  
  return llmModel;
}