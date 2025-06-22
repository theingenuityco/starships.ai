import axios from "axios";
import { AgentConfig, MemoryEntry, OpenWebUIChatResponse } from "../types";

const OPEN_WEBUI_BASE_URL = process.env.OPEN_WEBUI_BASE_URL || "http://localhost:3000";
const OPEN_WEBUI_API_KEY = process.env.OPEN_WEBUI_API_KEY; // optional auth header

export interface ChatCompletionOptions {
  userMessage: string;
  memory: MemoryEntry[];
}

/**
 * Thin wrapper around Open WebUI's `/api/chat/completions` endpoint.
 */
export class AgentClient {
  constructor(private readonly agent: AgentConfig) {}

  async chat({ userMessage, memory }: ChatCompletionOptions): Promise<string> {
    const messages = [
      ...(this.agent.systemPrompt
        ? [{ role: "system", content: this.agent.systemPrompt }]
        : []),
      ...memory.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];

    const payload = {
      model: this.agent.model,
      messages,
      stream: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (OPEN_WEBUI_API_KEY) {
      headers["Authorization"] = `Bearer ${OPEN_WEBUI_API_KEY}`;
    }

    const { data } = await axios.post<OpenWebUIChatResponse>(
      `${OPEN_WEBUI_BASE_URL}/api/chat/completions`,
      payload,
      { headers }
    );

    const reply = data.choices?.[0]?.message?.content ?? "(no response)";
    return reply.trim();
  }
} 