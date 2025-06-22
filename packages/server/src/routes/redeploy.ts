import express, { Router } from 'express';

const router: Router = express.Router();

/**
 * POST /redeploy – secure webhook endpoint to acknowledge redeploy pings.
 * If REDEPLOY_SECRET is set, expects Authorization: Bearer <secret> header.
 */
router.post('/', (req, res) => {
  const expectedSecret = process.env.REDEPLOY_SECRET;
  const providedAuth = req.headers.authorization;

  if (expectedSecret && providedAuth !== `Bearer ${expectedSecret}`) {
    console.warn('[WEBHOOK] Unauthorized redeploy attempt.');
    return res.status(403).send('Forbidden');
  }

  console.log('[WEBHOOK] Redeploy ping received.');
  res.status(200).send('Redeploy acknowledged.');

  // Optional: trigger a graceful container restart. Uncomment if desired.
  // setTimeout(() => process.exit(0), 100);
});

export default router; 