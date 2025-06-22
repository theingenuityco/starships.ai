import { MemoryStore } from "@starships/agent-engine";

// A single shared MemoryStore instance for the entire server process
const store = new MemoryStore();

export default store; 