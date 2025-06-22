import { Router } from "express";
import store from "../store";

const router: Router = Router();

router.post("/reset", async (req, res) => {
  const { agent_id, user_id, channel_id } = req.body as {
    agent_id: string;
    user_id: string;
    channel_id?: string;
  };
  const key = store.makeKey(agent_id, user_id, channel_id);
  await store.clear(key);
  res.status(204).send();
});

export default router; 