import { Client, GatewayIntentBits, Partials } from "discord.js";
import { PersonaRegistry } from "../registry";
import { MemoryStore } from "../services/memoryStore";
import { MessageRouter } from "../services/messageRouter";
import { AgentConfig } from "../types";

/**
 * Manages lifecycle of Discord clients, one per agent persona.
 */
export class BotManager {
  private readonly bots = new Map<string, Client>();
  private readonly memory = new MemoryStore();
  private readonly router = new MessageRouter({ memory: this.memory });

  /** Boot all agents fetched from the registry. */
  async startAll(): Promise<void> {
    const agents = await PersonaRegistry.loadAgents();
    await Promise.all(agents.map((a) => this.spawnBot(a)));
  }

  /** Look up a bot client by agent id. */
  getBot(agentId: string): Client | undefined {
    return this.bots.get(agentId);
  }

  /** Gracefully log-out each bot. */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.bots.values()).map((c) => c.destroy())
    );
    this.bots.clear();
  }

  private async spawnBot(agent: AgentConfig): Promise<void> {
    if (this.bots.has(agent.id)) return; // already running

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    client.once("ready", () => {
      console.log(`[bot] Logged in as ${client.user?.tag} for agent ${agent.id}`);
    });

    client.on("error", (err) => {
      console.error(`[bot] error for agent ${agent.id}:`, err);
    });

    // Wire message router
    this.router.bind(client, agent);

    await client.login(agent.botToken);
    this.bots.set(agent.id, client);
  }
} 