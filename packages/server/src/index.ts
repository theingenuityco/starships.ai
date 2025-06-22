import 'dotenv/config';
import express, { Express } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

import { BotManager } from '@starships/bridge-core';
import { createDispatchRouter } from './routes/dispatch';
import redeployRoute from './routes/redeploy';

const app: Express = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Boot bots
const botManager = new BotManager();
botManager
  .startAll()
  .then(() => console.log('[server] all bots started'))
  .catch((err: unknown) => {
    console.error('[server] failed to start bots', err);
    process.exit(1);
  });

// Routes
app.use(createDispatchRouter(botManager));

// Redeploy webhook (secured via REDEPLOY_SECRET)
app.use('/redeploy', redeployRoute);

// Health
app.get('/', (_req, res) => res.send('starships.ai bridge server running'));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bridge server listening on port ${PORT}`);
  });
}

export default app; 