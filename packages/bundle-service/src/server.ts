import express, { Express } from 'express';
import path from 'path';
import { BundleRegistry } from '@/services/BundleRegistry';
import { createBundleRouter } from '@/routes/bundles';

export function createServer(bundlesDir?: string): Express {
  const dir = bundlesDir ?? path.join(__dirname, '../bundles');
  const registry = new BundleRegistry(dir);

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/bundles', createBundleRouter(registry));

  return app;
}
