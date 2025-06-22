import { api } from "../testUtils";
import store from "../../src/store";
import { MemoryStore } from "@starships/agent-engine";

describe("POST /v1/memory/reset", () => {
  it("should clear memory and return 204", async () => {
    const spy = jest.spyOn(store, "clear");

    const payload = {
      agent_id: "agent-1",
      user_id: "user-1",
      channel_id: "ch-1",
    };

    const expectedKey = MemoryStore.makeKey(payload.user_id, payload.agent_id, payload.channel_id);

    await api().post("/v1/memory/reset").send(payload).expect(204);

    expect(spy).toHaveBeenCalledWith(expectedKey);
  });
}); 