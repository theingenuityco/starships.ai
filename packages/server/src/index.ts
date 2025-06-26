import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import chatRouter from "./routes/chat";
import agentsRouter from "./routes/agents";
import memoryRouter from "./routes/memory";
import redeployRouter from "./routes/redeploy";
import usersRouter from "./routes/users";
import { AgentService } from "./services/AgentService";
import { env } from "./config/environment";
import { authMiddleware } from "./middleware/auth";

const app: express.Express = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (_req: Request, res: Response) => {
  res.send("starships.ai server running");
});

// API routes - protected with authentication middleware
app.use("/v1/agents", authMiddleware, agentsRouter);
app.use("/v1/chat", authMiddleware, chatRouter);
app.use("/v1/memory", authMiddleware, memoryRouter);

// User routes - mixed protection (sync is public, others protected)
app.use("/v1/users", usersRouter);

// Admin routes
app.use("/redeploy", redeployRouter);

const port = env.PORT;

/**
 * Initialize database and start HTTP server
 */
async function startServer() {
  try {
    // Skip Neo4j initialization during tests
    if (process.env.NODE_ENV !== 'test') {
      await AgentService.initialize();
      console.log('Neo4j connection initialized');
    }
    
    // Start HTTP server
    app.listen(port, () => {
      console.log(`starships.ai server listening on ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start the HTTP server if this file is executed directly
if (require.main === module) {
  startServer();
}

export { app }; 