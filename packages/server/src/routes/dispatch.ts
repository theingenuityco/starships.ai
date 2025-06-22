import { Router } from "express";
import { BotManager, DispatchPayload } from "@starships/bridge-core";

/**
 * Creates an Express router that proxies autonomous agent messages to Discord.
 */
export function createDispatchRouter(botManager: BotManager): Router {
  const router = Router();

  router.post<{}, any, DispatchPayload>("/dispatch", async (req, res) => {
    try {
      const { agent_id, channel_id, message } = req.body;
      if (!agent_id || !channel_id || !message) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const client = botManager.getBot(agent_id);
      if (!client) {
        return res.status(404).json({ error: `No running bot for agent ${agent_id}` });
      }

      const channel = await client.channels.fetch(channel_id);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: "Channel not found or not text-based" });
      }

      // @ts-ignore – channel type guard handled above
      await channel.send(message);

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[dispatch] error", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
} 