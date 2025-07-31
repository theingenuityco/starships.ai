/**
 * Neo4j Integer Conversion Helpers
 * 
 * Neo4j returns integers as objects with { low, high } properties
 * This utility helps convert them back to JavaScript numbers
 */

/**
 * Convert a Neo4j integer object to a JavaScript number
 * @param value - The value from Neo4j (could be number or Neo4j integer object)
 * @returns The numeric value or undefined
 */
export function neo4jToNumber(value: any): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  
  if (value && typeof value === 'object' && 'low' in value) {
    // Neo4j integer object
    return value.low;
  }
  
  return undefined;
}

/**
 * Fix all numeric fields in an LLM model object
 * @param llmModel - The LLM model from Neo4j
 * @returns The LLM model with fixed numeric fields
 */
export function fixLLMModel(llmModel: any): any {
  if (!llmModel) return llmModel;
  
  return {
    ...llmModel,
    maxTokens: neo4jToNumber(llmModel.maxTokens),
    temperature: neo4jToNumber(llmModel.temperature) ?? llmModel.temperature,
    contextWindow: neo4jToNumber(llmModel.contextWindow) ?? llmModel.contextWindow,
    maxOutputTokens: neo4jToNumber(llmModel.maxOutputTokens) ?? llmModel.maxOutputTokens,
  };
}