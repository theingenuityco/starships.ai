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
  console.log('SIGTERM received, saving vector index...');
  if (store) {
    await store.saveIndex();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, saving vector index...');
  if (store) {
    await store.saveIndex();
  }
  process.exit(0);
}); 