import { Router } from "express";
import type { Request, Response } from "express";
import getStore from "../store";

const router: Router = Router();

router.post("/reset", async (req: Request, res: Response) => {
  const { agent_id, user_id, channel_id } = req.body as {
    agent_id: string;
    user_id: string;
    channel_id?: string;
  };
  const store = getStore();
  const key = store.makeKey(agent_id, user_id, channel_id);
  await store.clear(key);
  res.status(204).send();
});

export default router; 