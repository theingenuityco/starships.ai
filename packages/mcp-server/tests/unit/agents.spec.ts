import { api } from "../testUtils";
import { PersonaRegistry } from "@starships/agent-engine";

describe("GET /v1/agents", () => {
  it("should return list of agents", async () => {
    (PersonaRegistry.loadAgents as jest.Mock).mockResolvedValueOnce([
      { id: "agent-1", name: "Agent One" },
    ]);

    const res = await api().get("/v1/agents").expect(200);
    expect(res.body).toEqual([{ id: "agent-1", name: "Agent One" }]);
  });

  it("should handle errors from registry", async () => {
    (PersonaRegistry.loadAgents as jest.Mock).mockRejectedValueOnce(new Error("boom"));
    const res = await api().get("/v1/agents").expect(500);
    expect(res.body).toEqual({ error: "boom" });
  });
}); 