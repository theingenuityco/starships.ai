import { Router } from "express";
import { chat as agentChat } from "@starships/agent-engine";
import store from "../store";
import type { ChatRequest } from "@starships/protocol";

const router: import("express").Router = Router();

router.post("/", async (req, res) => {
  try {
    const body = req.body as ChatRequest;
    const result = await agentChat(body, store);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router; 