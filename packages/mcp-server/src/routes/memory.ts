import { Router } from "express";
import { MemoryStore } from "@starships/agent-engine";

const router: import("express").Router = Router();
const store = new MemoryStore();

router.post("/reset", (req, res) => {
  const { agent_id, user_id, channel_id } = req.body as {
    agent_id: string;
    user_id: string;
    channel_id?: string;
  };
  const key = MemoryStore.makeKey(user_id, agent_id, channel_id ?? "default");
  store.clear(key);
  res.status(204).send();
});

export default router; 