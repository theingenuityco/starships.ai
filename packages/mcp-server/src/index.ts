import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRouter from "./routes/chat";
import agentsRouter from "./routes/agents";
import memoryRouter from "./routes/memory";
import { Neo4jAgentService } from "./services/Neo4jAgentService";

dotenv.config();

const app: import("express").Express = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => res.send("mcp-server running"));

app.use("/v1/agents", agentsRouter);
app.use("/v1/chat", chatRouter);
app.use("/v1/memory", memoryRouter);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Initialize Neo4j and start server
async function startServer() {
  try {
    // Initialize Neo4j connection
    await Neo4jAgentService.initialize();
    console.log('Neo4j connection initialized');
    
    // Start HTTP server
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`mcp-server listening on ${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start the HTTP server if this file is executed directly (e.g. `node dist/index.js`)
if (require.main === module) {
  startServer();
}

export { app }; 