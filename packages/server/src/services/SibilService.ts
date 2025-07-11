import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { SibilRequest, SibilResponse, SibilStreamChunk, ContentBlock, UsageStats } from '@starships/protocol';
import { env } from '../config/environment';

export class SibilService {
  private static openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  private static anthropic = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  static async chat(request: SibilRequest): Promise<SibilResponse> {
    const { provider, model, message } = request;

    let content: string;
    let usage: UsageStats | undefined;
    
    if (provider === 'openai') {
      const result = await this.chatWithOpenAI(model || 'gpt-4', message);
      content = result.content;
      usage = result.usage;
    } else {
      const result = await this.chatWithAnthropic(model || 'claude-3-sonnet-20240229', message);
      content = result.content;
      usage = result.usage;
    }

    // Parse content for structured elements
    const structured_content = this.parseStructuredContent(content);

    return {
      content,
      structured_content,
      provider,
      model: model || (provider === 'openai' ? 'gpt-4' : 'claude-3-sonnet-20240229'),
      usage,
    };
  }

  // NEW: Streaming method
  static async *chatStream(request: SibilRequest): AsyncGenerator<SibilStreamChunk> {
    const { provider, model, message } = request;

    try {
      if (provider === 'openai') {
        yield* this.streamWithOpenAI(model || 'gpt-4', message);
      } else {
        yield* this.streamWithAnthropic(model || 'claude-3-sonnet-20240229', message);
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown streaming error',
        is_final: true
      };
    }
  }

  private static async *streamWithOpenAI(model: string, message: string): AsyncGenerator<SibilStreamChunk> {
    const stream = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: this.getSibilSystemPrompt(),
        },
        {
          role: 'user',
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    });

    let fullContent = '';
    let chunkId = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        chunkId++;

        // Parse structured content progressively
        const structuredContent = this.parseStructuredContentProgressive(fullContent);

        yield {
          type: 'content',
          content,
          structured_content: structuredContent,
          provider: 'openai',
          model,
          chunk_id: chunkId.toString(),
          is_final: false
        };
      }
    }

    // Final chunk with complete content
    yield {
      type: 'complete',
      content: fullContent,
      structured_content: this.parseStructuredContent(fullContent),
      provider: 'openai',
      model,
      is_final: true
    };
  }

  private static async *streamWithAnthropic(model: string, message: string): AsyncGenerator<SibilStreamChunk> {
    const stream = await this.anthropic.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0.7,
      system: this.getSibilSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      stream: true,
    });

    let fullContent = '';
    let chunkId = 0;

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const content = chunk.delta.text;
        fullContent += content;
        chunkId++;

        const structuredContent = this.parseStructuredContentProgressive(fullContent);

        yield {
          type: 'content',
          content,
          structured_content: structuredContent,
          provider: 'anthropic',
          model,
          chunk_id: chunkId.toString(),
          is_final: false
        };
      }
    }

    // Final chunk
    yield {
      type: 'complete',
      content: fullContent,
      structured_content: this.parseStructuredContent(fullContent),
      provider: 'anthropic',
      model,
      is_final: true
    };
  }

  // NEW: Progressive content parsing for streaming
  private static parseStructuredContentProgressive(content: string): ContentBlock[] {
    // Simplified progressive parsing - detect complete blocks only
    const blocks: ContentBlock[] = [];
    
    // Only parse complete code blocks
    const completeCodeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = completeCodeRegex.exec(content)) !== null) {
      blocks.push({
        type: 'code',
        content: match[2].trim(),
        metadata: {
          language: match[1] || 'text',
        },
      });
    }
    
    // If no complete structured content, treat as markdown
    if (blocks.length === 0) {
      blocks.push({
        type: 'markdown',
        content,
      });
    }
    
    return blocks;
  }

  private static async chatWithOpenAI(model: string, message: string): Promise<{ content: string; usage?: UsageStats }> {
    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: this.getSibilSystemPrompt(),
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
      } : undefined;

      return { content, usage };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async chatWithAnthropic(model: string, message: string): Promise<{ content: string; usage?: UsageStats }> {
    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 4096,
        temperature: 0.7,
        system: this.getSibilSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const usage = response.usage ? {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
      } : undefined;

      return { content, usage };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static getSibilSystemPrompt(): string {
    return `You are Sibil, an AI assistant that provides well-structured, helpful responses.

FORMATTING GUIDELINES:
- Use proper markdown formatting for structure and readability
- Use \`\`\`language for code blocks with appropriate language specification
- Use markdown tables for tabular data
- Organize complex responses with clear headers and sections
- Always specify programming language in code blocks for syntax highlighting
- Use bullet points and numbered lists for clarity

Respond naturally while following these formatting conventions to ensure your responses render beautifully.`;
  }

  private static parseStructuredContent(content: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    
    // Extract code blocks
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeRegex.exec(content)) !== null) {
      blocks.push({
        type: 'code',
        content: match[2].trim(),
        metadata: {
          language: match[1] || 'text',
        },
      });
    }
    
    // Extract tables
    const tableRegex = /\|(.+)\|\n\|[-\s|]+\|\n((?:\|.+\|\n?)+)/g;
    while ((match = tableRegex.exec(content)) !== null) {
      const headers = match[1].split('|').map(h => h.trim()).filter(Boolean);
      blocks.push({
        type: 'table',
        content: match[0],
        metadata: {
          headers,
        },
      });
    }
    
    // If no structured content found, treat as markdown
    if (blocks.length === 0) {
      blocks.push({
        type: 'markdown',
        content,
      });
    }
    
    return blocks;
  }
}