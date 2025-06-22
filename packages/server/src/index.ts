import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import chatRouter from "./routes/chat";
import agentsRouter from "./routes/agents";
import memoryRouter from "./routes/memory";
import redeployRouter from "./routes/redeploy";
import { Neo4jAgentService } from "./services/Neo4jAgentService";

dotenv.config();

const app: express.Express = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Health check
app.get("/", (_req, res) => res.send("starships.ai server running"));

// API routes
app.use("/v1/agents", agentsRouter);
app.use("/v1/chat", chatRouter);
app.use("/v1/memory", memoryRouter);

// Admin routes
app.use("/redeploy", redeployRouter);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Initialize Neo4j and start server
async function startServer() {
  try {
    // Skip Neo4j initialization during tests
    if (process.env.NODE_ENV !== 'test') {
      await Neo4jAgentService.initialize();
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