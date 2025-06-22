import { Router } from "express";
import { Neo4jAgentService } from "../services/Neo4jAgentService";

const router: import("express").Router = Router();

router.get("/", async (_req, res) => {
  try {
    const agents = await Neo4jAgentService.loadAgents();
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get single agent by ID
router.get("/:id", async (req, res) => {
  try {
    const agent = await Neo4jAgentService.getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create new agent
router.post("/", async (req, res) => {
  try {
    const { name, model, systemPrompt } = req.body;
    if (!name || !model) {
      return res.status(400).json({ error: "name and model are required" });
    }
    
    const agent = await Neo4jAgentService.createAgent({ name, model, systemPrompt });
    res.status(201).json(agent);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router; 