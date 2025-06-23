import { api } from "../testUtils";
import getStore from "../../src/store";

describe("POST /v1/memory/reset", () => {
  it("should clear memory and return 204", async () => {
    const store = getStore();
    const spy = jest.spyOn(store, "clear");

    const payload = {
      agent_id: "agent-1",
      user_id: "user-1",
      channel_id: "ch-1",
    };

    const expectedKey = store.makeKey(payload.agent_id, payload.user_id, payload.channel_id);

    await api().post("/v1/memory/reset").send(payload).expect(204);

    expect(spy).toHaveBeenCalledWith(expectedKey);
  });
}); 