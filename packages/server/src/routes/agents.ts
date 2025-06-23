import { Router, Request, Response } from "express";
import { AgentService } from "../services/AgentService";

const router: Router = Router();

router.get("/", async (_req, res) => {
  try {
    const agents = await AgentService.loadAgents();
    res.json(agents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get single agent by ID
router.get("/:id", async (req, res) => {
  try {
    const agent = await AgentService.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
    } else {
      res.json(agent);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create new agent
router.post("/", async (req, res) => {
  try {
    const { name, model, systemPrompt } = req.body;
    if (!name || !model) {
      res.status(400).json({ error: "name and model are required" });
    } else {
      const agent = await AgentService.createAgent({ name, model, systemPrompt });
      res.status(201).json(agent);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update agent
router.put("/:id", async (req, res) => {
  try {
    const updated = await AgentService.updateAgent(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: "Agent not found" });
    } else {
      res.json(updated);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete agent
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await AgentService.deleteAgent(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Agent not found" });
    } else {
      res.status(204).send();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router; 