import { api } from "../testUtils";
import { AgentService } from "../../src/services/AgentService";

// Mock AgentService
jest.mock("../../src/services/AgentService");

// Enable auth testing backdoor
process.env.ENABLE_AUTH_TESTING_BACKDOOR = 'true';
delete process.env.KINDE_CLIENT_ID;
delete process.env.KINDE_ISSUER_URL;

describe("GET /api/agents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return list of agents", async () => {
    // Mock the methods that the route actually calls
    (AgentService.getAgentsByAuthor as jest.Mock).mockResolvedValueOnce([
      { id: "agent-1", name: "Agent One" }
    ]);
    (AgentService.getPublicAgents as jest.Mock).mockResolvedValueOnce([
      { id: "agent-2", name: "Public Agent" }
    ]);

    const res = await api().get("/api/agents").expect(200);
    
    // The route combines user + public agents
    expect(res.body).toEqual([
      { id: "agent-1", name: "Agent One" },
      { id: "agent-2", name: "Public Agent" }
    ]);
    
    expect(AgentService.getAgentsByAuthor).toHaveBeenCalledWith('test-user-1');
    expect(AgentService.getPublicAgents).toHaveBeenCalledWith(50, 0);
  });

  it("should handle errors gracefully with partial data", async () => {
    // The route catches individual service errors and continues with empty arrays
    (AgentService.getAgentsByAuthor as jest.Mock).mockRejectedValueOnce(new Error("user agent error"));
    (AgentService.getPublicAgents as jest.Mock).mockResolvedValueOnce([
      { id: "agent-2", name: "Public Agent" }
    ]);
    
    const res = await api().get("/api/agents").expect(200);
    // Should still return the public agents even if user agents fail
    expect(res.body).toEqual([
      { id: "agent-2", name: "Public Agent" }
    ]);
  });

  it("should return empty array when both services fail", async () => {
    (AgentService.getAgentsByAuthor as jest.Mock).mockRejectedValueOnce(new Error("user error"));
    (AgentService.getPublicAgents as jest.Mock).mockRejectedValueOnce(new Error("public error"));
    
    const res = await api().get("/api/agents").expect(200);
    // Should return empty array when both individual services fail
    expect(res.body).toEqual([]);
  });
});