import { DatabaseMemoryStore } from "../utils/database-memory";

let store: DatabaseMemoryStore | null = null;

/**
 * Get singleton memory store instance (now database-backed)
 */
export default function getStore(): DatabaseMemoryStore {
  if (!store) {
    store = new DatabaseMemoryStore();
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