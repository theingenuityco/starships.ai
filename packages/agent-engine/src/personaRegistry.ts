import axios from "axios";
import { AgentConfig } from "@starships/protocol";

/**
 * Centralised registry responsible for loading the list of active personas/agents.
 *
 * Strategy (in priority order):
 * 1. If `PERSONA_REGISTRY_URL` env var exists → HTTP GET & parse JSON array.
 * 2. Else if `AGENTS_JSON` env var exists → directly parse the JSON string.
 * 3. Else throw an error.
 *
 * The shape expected from either source is `AgentConfig[]`.
 */
export class PersonaRegistry {
  private static cache: AgentConfig[] | null = null;
  /** Timestamp of last successful fetch (ms). */
  private static lastFetch = 0;
  /** Cache TTL (ms). */
  private static readonly TTL = 5 * 60 * 1000;

  /** Fetch the list of agents, with optional cache bypass. */
  static async loadAgents(forceRefresh = false): Promise<AgentConfig[]> {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.lastFetch < this.TTL) {
      return this.cache;
    }

    let raw: unknown;
    if (process.env.PERSONA_REGISTRY_URL) {
      // Remote registry (expects 200 JSON array)
      const { data } = await axios.get(process.env.PERSONA_REGISTRY_URL);
      raw = data as unknown;
    } else if (process.env.AGENTS_JSON) {
      // Env-inline registry (stringified JSON array)
      raw = JSON.parse(process.env.AGENTS_JSON);
    } else {
      throw new Error(
        "No persona registry configured. Set PERSONA_REGISTRY_URL or AGENTS_JSON."
      );
    }

    if (!Array.isArray(raw)) {
      throw new Error("Invalid persona registry payload – expected an array");
    }

    // Runtime validation + normalisation
    const agents: AgentConfig[] = (raw as unknown[]).map((entry) => {
      const { id, name, model, systemPrompt } = entry as Partial<AgentConfig>;
      if (!id || !name || !model) {
        throw new Error(`Invalid agent definition: ${JSON.stringify(entry)}`);
      }
      return { id, name, model, systemPrompt } as AgentConfig;
    });

    // Cache & return
    this.cache = agents;
    this.lastFetch = now;
    return agents;
  }

  /** Return a single agent by id (undefined if not found). */
  static async getAgent(id: string): Promise<AgentConfig | undefined> {
    const list = await this.loadAgents();
    return list.find((a) => a.id === id);
  }
} 