import { Router, Request, Response } from 'express';
import { BundleRegistry } from '@/services/BundleRegistry';

export function createBundleRouter(registry: BundleRegistry): Router {
  const router = Router();

  // GET /api/v1/bundles
  router.get('/', (_req: Request, res: Response) => {
    const bundles = registry.list();
    res.json(bundles);
  });

  // GET /api/v1/bundles/:id
  router.get('/:id', (req: Request, res: Response) => {
    const bundle = registry.get(req.params.id);
    if (!bundle) {
      res.status(404).json({ error: 'Bundle not found' });
      return;
    }
    res.json(bundle);
  });

  // GET /api/v1/bundles/:id/download
  router.get('/:id/download', async (req: Request, res: Response) => {
    const bundle = registry.get(req.params.id);
    if (!bundle) {
      res.status(404).json({ error: 'Bundle not found' });
      return;
    }

    try {
      const zip = await registry.createZip(req.params.id);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.zip"`);
      res.send(zip);
    } catch {
      res.status(500).json({ error: 'Failed to create zip archive' });
    }
  });

  // GET /api/v1/bundles/:id/files/*filePath
  router.get('/:id/files/*filePath', (req: Request, res: Response) => {
    const filePath = (req.params as Record<string, string>).filePath;
    if (!filePath) {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    const data = registry.getFile(req.params.id, filePath);
    if (!data) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  });

  return router;
}
