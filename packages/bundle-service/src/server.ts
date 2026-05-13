import express, { Express } from 'express';
import path from 'path';
import { BundleRegistry } from '@/services/BundleRegistry';
import { ConnectorTemplateRegistry } from '@/services/ConnectorTemplateRegistry';
import { createBundleRouter } from '@/routes/bundles';
import { createConnectorTemplateRouter } from '@/routes/connector-templates';

export function createServer(bundlesDir?: string): Express {
  const dir = bundlesDir ?? path.join(__dirname, '../bundles');
  const registry = new BundleRegistry(dir);
  const connectorTemplateRegistry = new ConnectorTemplateRegistry(dir);

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/bundles', createBundleRouter(registry));
  app.use('/api/v1/connector-templates', createConnectorTemplateRouter(connectorTemplateRegistry));

  return app;
}
