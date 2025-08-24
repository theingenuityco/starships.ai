import { LangChainMemoryStore } from "@starships/agent-engine";

let store: LangChainMemoryStore | null = null;

/**
 * Get singleton memory store instance
 */
export default function getStore(): LangChainMemoryStore {
  if (!store) {
    store = new LangChainMemoryStore();
  }
  return store;
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, graceful shutdown...');
  // No vector index to save anymore
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, graceful shutdown...');
  // No vector index to save anymore
  process.exit(0);
});