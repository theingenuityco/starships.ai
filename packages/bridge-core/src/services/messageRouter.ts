import { Client, Message } from "discord.js";
import { AgentConfig } from "../types";
import { MemoryStore } from "./memoryStore";
import { AgentClient } from "./agentClient";

interface RouterDeps {
  memory: MemoryStore;
}

export class MessageRouter {
  private readonly memory: MemoryStore;

  constructor({ memory }: RouterDeps) {
    this.memory = memory;
  }

  /**
   * Register message listener on a given Discord client.
   */
  bind(client: Client, agent: AgentConfig): void {
    const agentClient = new AgentClient(agent);

    client.on("messageCreate", async (msg: Message) => {
      try {
        // Ignore bot messages & DMs for now
        if (msg.author.bot || !msg.inGuild()) return;

        // Only react when the message mentions *this* bot client
        if (!msg.mentions.has(client.user?.id ?? "")) return;

        // Extract content after mention (strip mention markup)
        const rawContent = msg.content.replace(/<@!?(\d+)>/g, "").trim();
        if (!rawContent) return;

        const sessionKey = MemoryStore.makeKey(
          msg.author.id,
          agent.id,
          msg.channel.id
        );

        const history = this.memory.get(sessionKey);

        const replyText = await agentClient.chat({
          userMessage: rawContent,
          memory: history,
        });

        // Send reply in same thread/channel
        await msg.reply(replyText);

        // Update memory
        this.memory.append(sessionKey, { role: "user", content: rawContent });
        this.memory.append(sessionKey, { role: "assistant", content: replyText });
      } catch (err) {
        console.error(`[router] error for agent ${agent.id}:`, err);
      }
    });
  }
} 