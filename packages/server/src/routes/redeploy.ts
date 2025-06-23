import express, { Router, Request, Response, NextFunction } from 'express';

const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const router: Router = express.Router();

/**
 * Secure webhook endpoint to acknowledge redeploy pings
 * Requires Authorization: Bearer <secret> header if REDEPLOY_SECRET is set
 */
router.post('/', asyncHandler((req: Request, res: Response) => {
  const expectedSecret = process.env.REDEPLOY_SECRET;
  const providedAuth = req.headers.authorization;

  if (expectedSecret && providedAuth !== `Bearer ${expectedSecret}`) {
    console.warn('[WEBHOOK] Unauthorized redeploy attempt.');
    return res.status(403).send('Forbidden');
  }

  console.log('[WEBHOOK] Redeploy ping received.');
  res.status(200).send('Redeploy acknowledged.');
}));

export default router; 