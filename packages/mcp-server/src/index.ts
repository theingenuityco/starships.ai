import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import chatRouter from "./routes/chat";
import agentsRouter from "./routes/agents";
import memoryRouter from "./routes/memory";

dotenv.config();

const app: import("express").Express = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => res.send("mcp-server running"));

app.use("/v1/agents", agentsRouter);
app.use("/v1/chat", chatRouter);
app.use("/v1/memory", memoryRouter);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Only start the HTTP server if this file is executed directly (e.g. `node dist/index.js`)
if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mcp-server listening on ${port}`);
  });
}

export { app }; 