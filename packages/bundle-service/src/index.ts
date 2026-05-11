import path from 'path';
import { createServer } from '@/server';

const port = process.env.BUNDLE_SERVICE_PORT ? parseInt(process.env.BUNDLE_SERVICE_PORT, 10) : 5100;
const bundlesDir = process.env.BUNDLES_DIR ?? path.join(__dirname, '../bundles');

const app = createServer(bundlesDir);

app.listen(port, () => {
  console.log(`Bundle service listening on port ${port}`);
  console.log(`Serving bundles from: ${bundlesDir}`);
});
