import { Router } from "express";
import { UserService } from "../services/UserService";
import type { Request, Response } from "express";

const router: Router = Router();

// Validation middleware for user sync requests
const validateSyncRequest = (req: any, res: any, next: any) => {
  const { kindeId, email, name, avatar } = req.body;
  
  if (!kindeId || typeof kindeId !== 'string') {
    return res.status(400).json({ error: 'kindeId is required and must be a string' });
  }
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email is required and must be a string' });
  }
  
  next();
};

// POST /v1/users/sync - Sync Kinde user to local database
router.post("/sync", validateSyncRequest, async (req: any, res: any) => {
  try {
    const { kindeId, email, name, avatar } = req.body;
    
    const user = await UserService.syncUser({
      kindeId,
      email,
      name,
      avatar
    });
    
    res.json(user);
  } catch (err) {
    console.error('User sync error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /v1/users/:id - Get user by ID
router.get("/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    const user = await UserService.getUserById(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /v1/users/kinde/:kindeId - Get user by Kinde ID
router.get("/kinde/:kindeId", async (req: any, res: any) => {
  try {
    const { kindeId } = req.params;
    
    const user = await UserService.getUserByKindeId(kindeId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Get user by Kinde ID error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router; 