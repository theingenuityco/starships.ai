import { api } from "../testUtils";
import { chat as mockChat } from "@starships/agent-engine";

const body = {
  agent_id: "agent-1",
  user_id: "user-1",
  message: "Hello",
};

describe("POST /v1/chat", () => {
  it("should invoke chat and return response", async () => {
    (mockChat as jest.Mock).mockResolvedValueOnce({ reply: "Hi there" });

    const res = await api().post("/v1/chat").send(body).expect(200);
    expect(res.body).toEqual({ reply: "Hi there" });
    expect(mockChat).toHaveBeenCalledWith(body, expect.anything());
  });

  it("should handle agent not found", async () => {
    (mockChat as jest.Mock).mockRejectedValueOnce(new Error("Agent not found"));

    const res = await api().post("/v1/chat").send(body).expect(404);
    expect(res.body).toEqual({ error: "Agent not found" });
  });
}); 