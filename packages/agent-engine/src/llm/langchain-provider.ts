import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LLMChatPrompt, LLMProvider, LLMResult } from "@starships/protocol";
import type { LLM } from "@starships/models";

/**
 * LangChain-based LLM provider supporting OpenAI and Anthropic
 */
export class LangChainProvider implements LLMProvider {
  private modelConfig: LLM;

  constructor(model: LLM) {
    this.modelConfig = model;
  }

  async complete(prompt: LLMChatPrompt, opts?: { stream?: boolean; temperature?: number; maxTokens?: number; tools?: any[] }): Promise<LLMResult> {
    const baseModel = this.createModel(opts);
    const messages = this.convertToLangChainMessages(prompt.messages);

    try {
      if (opts?.stream) {
        // For streaming, we need to return a different interface
        // This will be handled by the streaming version below
        throw new Error('Use completeStream for streaming responses');
      }

      // Bind tools if provided
      let model: any = baseModel;
      if (opts?.tools && opts.tools.length > 0 && 'bindTools' in baseModel) {
        // Tools are already LangChain DynamicTool instances from MCPToolWrapper
        model = (baseModel as any).bindTools(opts.tools);
      }

      const response = await model.invoke(messages);
      
      const usage = (response.response_metadata?.tokenUsage || response.usage_metadata) ? {
        prompt_tokens: response.response_metadata?.tokenUsage?.promptTokens || response.usage_metadata?.input_tokens || 0,
        completion_tokens: response.response_metadata?.tokenUsage?.completionTokens || response.usage_metadata?.output_tokens || 0,
      } : undefined;

      // Extract tool calls if present
      const toolCalls = (response as any).tool_calls ? (response as any).tool_calls.map((tc: any) => ({
        id: tc.id || '',
        name: tc.name,
        arguments: tc.args || {},
      })) : undefined;

      return {
        reply: response.content as string,
        usage,
        toolCalls,
      };
    } catch (error) {
      throw new Error(`LLM completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *completeStream(prompt: LLMChatPrompt, opts?: { temperature?: number; maxTokens?: number; tools?: any[] }): AsyncGenerator<string, void, unknown> {
    const baseModel = this.createModel(opts);
    const messages = this.convertToLangChainMessages(prompt.messages);

    try {
      // Bind tools if provided
      let model: any = baseModel;
      if (opts?.tools && opts.tools.length > 0 && 'bindTools' in baseModel) {
        // Tools are already LangChain DynamicTool instances from MCPToolWrapper
        model = (baseModel as any).bindTools(opts.tools);
      }

      const stream = await model.stream(messages);
      
      for await (const chunk of stream) {
        if (chunk.content) {
          yield chunk.content as string;
        }
      }
    } catch (error) {
      throw new Error(`LLM streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private createModel(opts?: { stream?: boolean; temperature?: number; maxTokens?: number }): BaseChatModel {
    // Debug logging to track input values
    console.log(`[LANGCHAIN-PROVIDER] Creating model with config:`, {
      modelConfig: this.modelConfig,
      opts,
      maxTokensFromModel: this.modelConfig.maxTokens,
      maxTokensFromOpts: opts?.maxTokens,
      temperatureFromModel: this.modelConfig.temperature,
      temperatureFromOpts: opts?.temperature
    });

    const config = {
      ...this.modelConfig,
      ...(opts?.temperature !== undefined && { temperature: opts.temperature }),
      ...(opts?.maxTokens !== undefined && { maxTokens: opts.maxTokens }),
    };

    // Ensure numeric values are properly converted
    const maxTokens = typeof config.maxTokens === 'number' ? config.maxTokens : 
                     typeof config.maxTokens === 'string' ? parseInt(config.maxTokens, 10) : 
                     4000; // Default fallback
    
    const temperature = typeof config.temperature === 'number' ? config.temperature : 
                       typeof config.temperature === 'string' ? parseFloat(config.temperature) : 
                       0.7; // Default fallback

    // Debug logging to identify the issue
    if (typeof config.maxTokens !== 'number' && config.maxTokens !== undefined) {
      console.warn(`[LANGCHAIN-PROVIDER] Invalid maxTokens type: ${typeof config.maxTokens}, value:`, config.maxTokens);
    }
    if (typeof config.temperature !== 'number' && config.temperature !== undefined) {
      console.warn(`[LANGCHAIN-PROVIDER] Invalid temperature type: ${typeof config.temperature}, value:`, config.temperature);
    }

    console.log(`[LANGCHAIN-PROVIDER] Final values: maxTokens=${maxTokens} (${typeof maxTokens}), temperature=${temperature} (${typeof temperature})`);

    switch (this.modelConfig.provider) {
      case 'openai':
        return new ChatOpenAI({
          model: config.name,
          temperature: temperature,
          maxTokens: maxTokens,
          apiKey: process.env.OPENAI_API_KEY,
        });
      case 'anthropic':
        return new ChatAnthropic({
          model: config.name,
          temperature: temperature,
          maxTokens: maxTokens,
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
      default:
        throw new Error(`Unsupported provider: ${this.modelConfig.provider}`);
    }
  }

  private convertToLangChainMessages(messages: LLMChatPrompt['messages']) {
    return messages.map(msg => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          throw new Error(`Unsupported message role: ${msg.role}`);
      }
    });
  }

} 