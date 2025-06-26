import { Router } from "express";
import { AgentService } from "../services/AgentService";
import type { AgentConfig } from "@starships/protocol";

const router: Router = Router();

router.get("/", async (req, res) => {
  try {
    // Load agents scoped to the authenticated user
    console.log(`[AGENTS] Loading agents for authenticated user: ${req.user.id}`);
    const agents = await AgentService.loadAgents();
    
    // TODO: Filter agents by user or implement user-scoped agent loading
    // For now, return all agents but add user context
    res.json(agents);
  } catch (error) {
    console.error("Error loading agents:", error);
    res.status(500).json({ error: "Failed to load agents" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const agent = await AgentService.getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
    } else {
      res.json(agent);
    }
  } catch (error) {
    console.error("Error getting agent:", error);
    res.status(500).json({ error: "Failed to get agent" });
  }
});

router.post("/", async (req, res) => {
  try {
    const agentData = req.body as Omit<AgentConfig, 'id'>;
    const agent = await AgentService.createAgent(agentData);
    res.status(201).json(agent);
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updates = req.body as Partial<AgentConfig>;
    const agent = await AgentService.updateAgent(req.params.id, updates);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
    } else {
      res.json(agent);
    }
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await AgentService.deleteAgent(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Agent not found" });
    } else {
      res.json({ message: "Agent deleted successfully" });
    }
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});

export default router; 