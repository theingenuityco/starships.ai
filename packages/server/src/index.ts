import 'dotenv/config';
import express, { Express } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

import redeployRoute from './routes/redeploy';

const app: Express = express();
const PORT = Number(process.env.PORT) || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Redeploy webhook (secured via REDEPLOY_SECRET)
app.use('/redeploy', redeployRoute);

// Health
app.get('/', (_req, res) => res.send('starships.ai server running'));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export default app; 