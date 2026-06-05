/**
 * Starship MCP server.
 *
 * Exposes the org-layer workspace (Tables, Rooms, Goals, dispatch, activity log)
 * to external agents over the MCP Streamable HTTP transport. Each request is
 * authenticated with a per-agent bearer connection token (sk-ship-…) and scoped
 * to one starship + one agent.
 */
import express, { type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getEnvConfig } from '@starships/env';
import { createConnection } from '@starships/models';
import { resolveAgentContext } from './auth';
import { buildServer } from './buildServer';

const config = getEnvConfig();
const PORT = Number(process.env.MCP_SERVER_PORT || 4100);

const dbConnection = createConnection({
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  database: config.POSTGRES_DATABASE,
  ssl: config.POSTGRES_SSL,
});

const app: express.Application = express();
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'starship-mcp' });
});

app.post('/mcp', async (req: Request, res: Response): Promise<void> => {
  const ctx = await resolveAgentContext(req.headers.authorization);
  if (!ctx) {
    res.status(401).json({ error: 'Invalid or missing agent token' });
    return;
  }
  try {
    const server = buildServer(ctx);
    // Stateless: a fresh transport per request (no session persistence).
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp] request error', error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal MCP error' });
  }
});

const httpServer = app.listen(PORT, async () => {
  try {
    await dbConnection.connect();
    console.log(`🛰️  Starship MCP server on :${PORT} (POST /mcp)`);
  } catch (error) {
    console.error('❌ MCP server failed to connect to database:', error);
    process.exit(1);
  }
});

export { app, httpServer };
