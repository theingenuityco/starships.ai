import { api } from "../testUtils";

describe("Health check", () => {
  it("GET / should return 200 and message", async () => {
    await api()
      .get("/")
      .expect(200)
      .expect("mcp-server running");
  });
}); 