import { Router } from "express";
import type { Request, Response } from "express";
import getStore from "../store";

const router: Router = Router();

router.post("/reset", async (req: Request, res: Response) => {
  const { agentId, userId } = req.body as {
    agentId: string;
    userId: string;
  };
  const store = getStore();
  const key = store.makeKey(agentId, userId);
  await store.clear(key);
  res.status(204).send();
});

export default router; 