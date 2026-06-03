/**
 * Internal connector-action endpoint.
 *
 * The autopilot runner (remote, server-authority mode) calls this to execute a connector
 * action: the server owns the connector definitions + secrets, runs the action via
 * ConnectorActionExecutor, and returns the HttpEnvelope. Authenticated by a shared secret
 * header (RUNNER_INTERNAL_SECRET), NOT user JWT — the caller is trusted infrastructure.
 *
 * The endpoint always responds 200 at the transport level; the connector's own HTTP status
 * lives inside the returned envelope so the ConnectorAction node can apply failOnNon2xx.
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import { connectorActionExecutor } from '@/services/ConnectorActionExecutor';
import { sendError } from '../utils/responseHelpers';

const router: Router = Router();

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

router.post('/internal/connector-action', async (req: Request, res: Response) => {
  const expected = process.env.RUNNER_INTERNAL_SECRET;
  if (expected) {
    const provided = req.header('x-runner-secret') ?? '';
    if (provided !== expected) {
      return sendError(res, 'ACCESS_DENIED', 'Invalid runner secret', 403);
    }
  } else {
    console.warn('[internal/connector-action] RUNNER_INTERNAL_SECRET is not set; endpoint is unauthenticated');
  }

  const body = isRecord(req.body) ? req.body : {};
  const connector = typeof body.connector === 'string' ? body.connector.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const starshipId = typeof body.starshipId === 'string' ? body.starshipId.trim() : '';
  const authUserId = typeof body.authUserId === 'string' ? body.authUserId.trim() : '';

  if (!connector || !action || !starshipId) {
    return sendError(res, 'VALIDATION_ERROR', 'connector, action and starshipId are required', 400);
  }

  try {
    const envelope = await connectorActionExecutor.execute({
      connector,
      action,
      args: isRecord(body.args) ? body.args : {},
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      starshipId,
      authUserId,
      runtimeEnv: isRecord(body.runtimeEnv) ? body.runtimeEnv : undefined,
    });
    res.status(200).json(envelope);
    return;
  } catch (err) {
    return sendError(res, 'INTERNAL_SERVER_ERROR', err instanceof Error ? err.message : 'connector action failed', 500, {
      connector,
      action,
    });
  }
});

export default router;
