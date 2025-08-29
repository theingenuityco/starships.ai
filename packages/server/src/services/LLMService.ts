import OpenAI from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import type { LLMChatPrompt, LLMProvider, LLMResult, LLMToolDefinition } from '@starships/protocol';
import type { LLM } from '@starships/models';
import { convertNeo4jInt, convertNeo4jIntsInObject } from '@starships/models';

/**
 * LLM Service for direct LLM API integration
 * Follows the same pattern as SibilService but for agent LLM calls
 */
export class LLMService implements LLMProvider {
  private static openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  private static anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  private modelConfig: LLM;

  constructor(model: LLM) {
    this.modelConfig = convertNeo4jIntsInObject(model);
  }

  async complete(
    prompt: LLMChatPrompt, 
    opts?: { 
      stream?: boolean; 
      temperature?: number; 
      maxTokens?: number; 
      tools?: LLMToolDefinition[] 
    }
  ): Promise<LLMResult> {
    if (opts?.stream) {
      throw new Error('Use completeStream for streaming responses');
    }

    const maxTokens = opts?.maxTokens ?? convertNeo4jInt(this.modelConfig.maxTokens) ?? 4000;
    const temperature = opts?.temperature ?? 
      (typeof this.modelConfig.temperature === 'number' ? this.modelConfig.temperature : 0.7);

    console.log(`[LLM-SERVICE] Creating completion:`, {
      provider: this.modelConfig.provider,
      model: this.modelConfig.name,
      maxTokens,
      temperature,
      hasTools: !!opts?.tools?.length
    });

    try {
      if (this.modelConfig.provider === 'openai') {
        return await this.completeOpenAI(prompt, maxTokens, temperature, opts?.tools);
      } else if (this.modelConfig.provider === 'anthropic') {
        return await this.completeAnthropic(prompt, maxTokens, temperature, opts?.tools);
      } else {
        throw new Error(`Unsupported provider: ${this.modelConfig.provider}`);
      }
    } catch (error) {
      throw new Error(`LLM completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *completeStream(
    prompt: LLMChatPrompt, 
    opts?: { 
      temperature?: number; 
      maxTokens?: number; 
      tools?: LLMToolDefinition[] 
    }
  ): AsyncGenerator<string, void, unknown> {
    const maxTokens = opts?.maxTokens ?? convertNeo4jInt(this.modelConfig.maxTokens) ?? 4000;
    const temperature = opts?.temperature ?? 
      (typeof this.modelConfig.temperature === 'number' ? this.modelConfig.temperature : 0.7);

    try {
      if (this.modelConfig.provider === 'openai') {
        yield* this.streamOpenAI(prompt, maxTokens, temperature, opts?.tools);
      } else if (this.modelConfig.provider === 'anthropic') {
        yield* this.streamAnthropic(prompt, maxTokens, temperature, opts?.tools);
      } else {
        throw new Error(`Unsupported provider: ${this.modelConfig.provider}`);
      }
    } catch (error) {
      throw new Error(`LLM streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async completeOpenAI(
    prompt: LLMChatPrompt, 
    maxTokens: number, 
    temperature: number,
    tools?: LLMToolDefinition[]
  ): Promise<LLMResult> {
    const messages = prompt.messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.modelConfig.name,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    if (tools && tools.length > 0) {
      params.tools = tools.map(tool => ({
        type: 'function',
        function: tool.function,
      }));
      params.tool_choice = 'auto';
    }

    const response = await LLMService.openai.chat.completions.create(params);
    
    const choice = response.choices[0];
    const usage = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
    } : undefined;

    const toolCalls = choice.message.tool_calls ? 
      choice.message.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })) : undefined;

    return {
      reply: choice.message.content || '',
      usage,
      toolCalls,
    };
  }

  private async completeAnthropic(
    prompt: LLMChatPrompt, 
    maxTokens: number, 
    temperature: number,
    tools?: LLMToolDefinition[]
  ): Promise<LLMResult> {
    const systemMessage = prompt.messages.find(m => m.role === 'system');
    const otherMessages = prompt.messages.filter(m => m.role !== 'system');

    const messages = otherMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    const params: Anthropic.Messages.MessageCreateParams = {
      model: this.modelConfig.name,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (systemMessage) {
      params.system = systemMessage.content;
    }

    if (tools && tools.length > 0) {
      params.tools = tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));
    }

    const response = await LLMService.anthropic.messages.create(params);
    
    const usage = response.usage ? {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
    } : undefined;

    let reply = '';
    let toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> | undefined;

    if (Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block.type === 'text') {
          reply += block.text;
        } else if (block.type === 'tool_use') {
          if (!toolCalls) toolCalls = [];
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }
    }

    return {
      reply,
      usage,
      toolCalls,
    };
  }

  private async *streamOpenAI(
    prompt: LLMChatPrompt, 
    maxTokens: number, 
    temperature: number,
    tools?: LLMToolDefinition[]
  ): AsyncGenerator<string, void, unknown> {
    const messages = prompt.messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.modelConfig.name,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    };

    if (tools && tools.length > 0) {
      params.tools = tools.map(tool => ({
        type: 'function',
        function: tool.function,
      }));
      params.tool_choice = 'auto';
    }

    const stream = await LLMService.openai.chat.completions.create(params);
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        yield content;
      }
    }
  }

  private async *streamAnthropic(
    prompt: LLMChatPrompt, 
    maxTokens: number, 
    temperature: number,
    tools?: LLMToolDefinition[]
  ): AsyncGenerator<string, void, unknown> {
    const systemMessage = prompt.messages.find(m => m.role === 'system');
    const otherMessages = prompt.messages.filter(m => m.role !== 'system');

    const messages = otherMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    const params: Anthropic.Messages.MessageCreateParams = {
      model: this.modelConfig.name,
      max_tokens: maxTokens,
      temperature,
      messages,
      stream: true,
    };

    if (systemMessage) {
      params.system = systemMessage.content;
    }

    if (tools && tools.length > 0) {
      params.tools = tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));
    }

    const stream = await LLMService.anthropic.messages.create(params);
    
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }
}