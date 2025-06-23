import { LangChainMemoryStore } from "@starships/agent-engine";

// A single shared LangChainMemoryStore instance for the entire server process
let store: LangChainMemoryStore | null = null;

function getStore(): LangChainMemoryStore {
  if (!store) {
    store = new LangChainMemoryStore();
  }
  return store;
}

// Graceful shutdown handler to save vector index
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

export default getStore; 