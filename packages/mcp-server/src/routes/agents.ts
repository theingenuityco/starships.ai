import { Router } from "express";
import { PersonaRegistry } from "@starships/agent-engine";

const router: import("express").Router = Router();

router.get("/", async (_req, res) => {
  try {
    const agents = await PersonaRegistry.loadAgents();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router; 