import { Router, Request, Response } from 'express';
import { ConnectorTemplateRegistry } from '@/services/ConnectorTemplateRegistry';

export function createConnectorTemplateRouter(registry: ConnectorTemplateRegistry): Router {
  const router = Router();

  // GET /api/v1/connector-templates
  router.get('/', (_req: Request, res: Response) => {
    try {
      const templates = registry.list();
      res.json(templates);
    } catch (err) {
      console.error('[bundle-service] Failed to list connector templates', err);
      res.status(500).json({ error: 'Failed to list connector templates', detail: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/v1/connector-templates/:provider
  router.get('/:provider', (req: Request, res: Response) => {
    try {
      const template = registry.findByProvider(req.params.provider);
      if (!template) {
        res.status(404).json({ error: 'Connector template not found' });
        return;
      }
      res.json(template);
    } catch (err) {
      console.error('[bundle-service] Failed to get connector template', err);
      res.status(500).json({ error: 'Failed to get connector template', detail: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
