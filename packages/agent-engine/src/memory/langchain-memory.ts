import { BufferMemory } from "langchain/memory";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { MemoryEntry, EnhancedMemoryEntry, MemorySearchResult, SessionKey } from "@starships/protocol";

/**
 * Simple LangChain-based memory store for chat history
 * Removed all vector storage, embeddings, and semantic search functionality
 */
export class LangChainMemoryStore {
  private bufferMemories = new Map<SessionKey, BufferMemory>();
  private sessionsPath: string;

  constructor() {
    this.sessionsPath = path.join(process.cwd(), "data/sessions");
    
    // Create sessions directory if it doesn't exist
    fs.mkdirSync(this.sessionsPath, { recursive: true });
    
    console.log('🧠 [MEMORY-STORE] Simple memory store initialized (no vector storage)');
    console.log('📁 [MEMORY-STORE] Sessions path:', this.sessionsPath);
  }

  makeKey(agentId: string, userId: string): SessionKey {
    return `${agentId}:${userId}`;
  }

  async get(sessionKey: SessionKey): Promise<MemoryEntry[]> {
    console.log('🧠 [MEMORY-STORE] Getting memory for session:', sessionKey);
    console.log('📊 [MEMORY-STORE] Total stored sessions:', this.bufferMemories.size);
    
    let bufferMemory = this.bufferMemories.get(sessionKey);
    if (!bufferMemory) {
      console.log('❌ [MEMORY-STORE] No buffer memory found in RAM for session:', sessionKey);
      console.log('💾 [MEMORY-STORE] Attempting to load from disk...');
      
      // Try to load from persistent storage
      await this.loadSession(sessionKey);
      bufferMemory = this.bufferMemories.get(sessionKey);
      
      if (!bufferMemory) {
        console.log('❌ [MEMORY-STORE] No persistent session found for:', sessionKey);
        return [];
      }
    }

    const chatHistory = await bufferMemory.chatHistory.getMessages();
    console.log('💬 [MEMORY-STORE] Chat history messages found:', chatHistory.length);
    
    const entries = chatHistory.map(msg => ({
      role: msg instanceof HumanMessage ? "user" as const :
            msg instanceof AIMessage ? "assistant" as const : "system" as const,
      content: msg.content as string,
      timestamp: Date.now(),
    }));
    
    console.log('📝 [MEMORY-STORE] Returning memory entries:', entries.length);
    return entries;
  }

  async append(sessionKey: SessionKey, entry: MemoryEntry): Promise<void> {
    let bufferMemory = this.bufferMemories.get(sessionKey);
    if (!bufferMemory) {
      bufferMemory = new BufferMemory({
        returnMessages: true,
        memoryKey: "chat_history",
      });
      this.bufferMemories.set(sessionKey, bufferMemory);
    }

    if (entry.role === "user") {
      await bufferMemory.chatHistory.addMessage(new HumanMessage(entry.content));
    } else if (entry.role === "assistant") {
      await bufferMemory.chatHistory.addMessage(new AIMessage(entry.content));
    }
    
    // Save session to disk after each message
    await this.saveSession(sessionKey);
  }

  async semanticSearch(sessionKey: SessionKey, query: string, limit: number = 5): Promise<MemorySearchResult> {
    // Semantic search is no longer supported - return empty results
    console.log('⚠️ [MEMORY-STORE] Semantic search not available (vector storage removed)');
    return { entries: [], relevanceScores: [] };
  }

  async clear(sessionKey: SessionKey): Promise<void> {
    console.log('🗑️ [MEMORY-STORE] Clearing session:', sessionKey);
    
    // Clear from memory
    this.bufferMemories.delete(sessionKey);
    
    // Clear from disk
    try {
      const sessionFile = path.join(this.sessionsPath, `${sessionKey.replace(/[:/]/g, '_')}.json`);
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
        console.log('💾 [MEMORY-STORE] Session file deleted:', sessionFile);
      }
    } catch (error) {
      console.error('❌ [MEMORY-STORE] Failed to delete session file:', error);
    }
  }

  async saveIndex(): Promise<void> {
    // No index to save - this is a no-op
    console.log('ℹ️ [MEMORY-STORE] No vector index to save (vector storage removed)');
  }

  /**
   * Save session to persistent storage
   */
  private async saveSession(sessionKey: SessionKey): Promise<void> {
    try {
      const bufferMemory = this.bufferMemories.get(sessionKey);
      if (!bufferMemory) {
        console.log('⚠️ [MEMORY-STORE] No buffer memory to save for session:', sessionKey);
        return;
      }

      const sessionFile = path.join(this.sessionsPath, `${sessionKey.replace(/[:/]/g, '_')}.json`);
      const messages = await bufferMemory.chatHistory.getMessages();
      
      const serializedMessages = messages.map(msg => ({
        type: msg instanceof HumanMessage ? 'human' : 
              msg instanceof AIMessage ? 'ai' : 'system',
        content: msg.content,
        timestamp: Date.now()
      }));

      fs.writeFileSync(sessionFile, JSON.stringify(serializedMessages, null, 2));
      console.log('💾 [MEMORY-STORE] Session saved to disk:', sessionFile);
    } catch (error) {
      console.error('❌ [MEMORY-STORE] Failed to save session:', error);
    }
  }

  /**
   * Load session from persistent storage
   */
  private async loadSession(sessionKey: SessionKey): Promise<void> {
    try {
      const sessionFile = path.join(this.sessionsPath, `${sessionKey.replace(/[:/]/g, '_')}.json`);
      
      if (!fs.existsSync(sessionFile)) {
        console.log('📂 [MEMORY-STORE] No persistent session file found:', sessionFile);
        return;
      }

      console.log('📖 [MEMORY-STORE] Loading session from disk:', sessionFile);
      const serializedMessages = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      
      const bufferMemory = new BufferMemory({
        returnMessages: true,
        memoryKey: "chat_history",
      });

      // Restore messages to buffer memory
      for (const msg of serializedMessages) {
        if (msg.type === 'human') {
          await bufferMemory.chatHistory.addMessage(new HumanMessage(msg.content));
        } else if (msg.type === 'ai') {
          await bufferMemory.chatHistory.addMessage(new AIMessage(msg.content));
        }
      }

      this.bufferMemories.set(sessionKey, bufferMemory);
      console.log('✅ [MEMORY-STORE] Session loaded from disk:', serializedMessages.length, 'messages');
    } catch (error) {
      console.error('❌ [MEMORY-STORE] Failed to load session:', error);
    }
  }
}