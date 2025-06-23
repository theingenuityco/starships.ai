import { api } from "../testUtils";
import { AgentService } from "../../src/services/AgentService";

// Mock AgentService
jest.mock("../../src/services/AgentService");

describe("GET /v1/agents", () => {
  it("should return list of agents", async () => {
    (AgentService.loadAgents as jest.Mock).mockResolvedValueOnce([
      { id: "agent-1", name: "Agent One" },
    ]);

    const res = await api().get("/v1/agents").expect(200);
    expect(res.body).toEqual([{ id: "agent-1", name: "Agent One" }]);
  });

  it("should handle errors from registry", async () => {
    (AgentService.loadAgents as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const res = await api().get("/v1/agents").expect(500);
    expect(res.body).toEqual({ error: "Failed to load agents" });
  });
}); 