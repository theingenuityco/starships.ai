import { LLMProvider, LLMChatPrompt, LLMResult } from "./provider";

export class MockLLMProvider implements LLMProvider {
  private cannedReply: string;

  constructor(reply = "Hello from mock model!") {
    this.cannedReply = reply;
  }

  async complete(_prompt: LLMChatPrompt): Promise<LLMResult> {
    return { reply: this.cannedReply };
  }
} 