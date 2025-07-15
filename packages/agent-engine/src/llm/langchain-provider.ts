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

  async complete(prompt: LLMChatPrompt, opts?: { stream?: boolean; temperature?: number; maxTokens?: number }): Promise<LLMResult> {
    const model = this.createModel(opts);
    const messages = this.convertToLangChainMessages(prompt.messages);

    try {
      if (opts?.stream) {
        // For streaming, we need to return a different interface
        // This will be handled by the streaming version below
        throw new Error('Use completeStream for streaming responses');
      }

      const response = await model.invoke(messages);
      
      const usage = (response.response_metadata?.tokenUsage || response.usage_metadata) ? {
        prompt_tokens: response.response_metadata?.tokenUsage?.promptTokens || response.usage_metadata?.input_tokens || 0,
        completion_tokens: response.response_metadata?.tokenUsage?.completionTokens || response.usage_metadata?.output_tokens || 0,
      } : undefined;

      return {
        reply: response.content as string,
        usage,
      };
    } catch (error) {
      throw new Error(`LLM completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *completeStream(prompt: LLMChatPrompt, opts?: { temperature?: number; maxTokens?: number }): AsyncGenerator<string, void, unknown> {
    const model = this.createModel(opts);
    const messages = this.convertToLangChainMessages(prompt.messages);

    try {
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
    const config = {
      ...this.modelConfig,
      ...(opts?.temperature !== undefined && { temperature: opts.temperature }),
      ...(opts?.maxTokens !== undefined && { maxTokens: opts.maxTokens }),
    };

    switch (this.modelConfig.provider) {
      case 'openai':
        return new ChatOpenAI({
          model: config.name,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          apiKey: process.env.OPENAI_API_KEY,
        });
      case 'anthropic':
        return new ChatAnthropic({
          model: config.name,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
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