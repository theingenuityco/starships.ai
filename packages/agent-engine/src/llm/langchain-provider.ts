import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { LLMProvider, LLMChatPrompt, LLMResult } from "@starships/protocol";
import { Model } from "@starships/neo4j-models";

export class LangChainProvider implements LLMProvider {
  private model: ChatOpenAI | ChatAnthropic;

  constructor(modelConfig: Model) {
    this.model = this.createModel(modelConfig);
  }

  private createModel(config: Model): ChatOpenAI | ChatAnthropic {
    switch (config.provider) {
      case 'openai':
        return new ChatOpenAI({
          model: config.name,
          apiKey: process.env.OPENAI_API_KEY,
          temperature: config.temperature || 0.7,
          maxTokens: config.maxTokens || 4096,
        });
      
      case 'anthropic':
        return new ChatAnthropic({
          model: config.name,
          apiKey: process.env.ANTHROPIC_API_KEY,
          temperature: config.temperature || 0.7,
          maxTokens: config.maxTokens || 4096,
        });
      
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  async complete(
    prompt: LLMChatPrompt, 
    opts?: { stream?: boolean; temperature?: number; maxTokens?: number }
  ): Promise<LLMResult> {
    try {
      // Create a new model instance with runtime options if provided
      let modelToUse = this.model;
      if (opts?.temperature !== undefined || opts?.maxTokens !== undefined) {
        const runtimeOptions: any = {};
        if (opts.temperature !== undefined) runtimeOptions.temperature = opts.temperature;
        if (opts.maxTokens !== undefined) runtimeOptions.maxTokens = opts.maxTokens;
        
        if (this.model instanceof ChatOpenAI) {
          modelToUse = new ChatOpenAI({
            ...this.model.toJSON(),
            ...runtimeOptions,
          });
        } else if (this.model instanceof ChatAnthropic) {
          modelToUse = new ChatAnthropic({
            ...this.model.toJSON(),
            ...runtimeOptions,
          });
        }
      }

      // Map message format to LangChain message types
      const messages = prompt.messages.map(msg => {
        switch (msg.role) {
          case 'system':
            return new SystemMessage(msg.content);
          case 'user':
            return new HumanMessage(msg.content);
          case 'assistant':
            return new AIMessage(msg.content);
          default:
            throw new Error(`Unknown message role: ${msg.role}`);
        }
      });
      
      // Invoke model
      const result = await modelToUse.invoke(messages);
      
      // Extract usage information if available
      const usage = result.response_metadata?.usage ? {
        prompt_tokens: result.response_metadata.usage.prompt_tokens || 0,
        completion_tokens: result.response_metadata.usage.completion_tokens || 0,
      } : undefined;

      return {
        reply: result.content as string,
        usage
      };
    } catch (error) {
      throw new Error(`LangChain provider error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 