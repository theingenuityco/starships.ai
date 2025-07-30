import { BufferMemory } from "langchain/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { MemoryEntry, EnhancedMemoryEntry, MemorySearchResult, SessionKey } from "@starships/protocol";

/**
 * LangChain-based memory store with vector similarity search
 */
export class LangChainMemoryStore {
  private bufferMemories = new Map<SessionKey, BufferMemory>();
  private vectorStore: FaissStore | null = null;
  private embeddings: OpenAIEmbeddings;
  private indexPath: string;
  private sessionsPath: string;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.DEFAULT_EMBEDDING_MODEL || "text-embedding-3-small",
    });
    this.indexPath = process.env.FAISS_INDEX_PATH || "./data/faiss_index";
    this.sessionsPath = path.join(path.dirname(this.indexPath), "sessions");
    
    // Create sessions directory if it doesn't exist
    fs.mkdirSync(this.sessionsPath, { recursive: true });
    
    this.initializeVectorStore();
  }

  private async initializeVectorStore() {
    console.log('🔧 [MEMORY-STORE] Initializing vector store...');
    console.log('📁 [MEMORY-STORE] FAISS index path:', this.indexPath);
    console.log('📂 [MEMORY-STORE] Index exists:', fs.existsSync(this.indexPath));
    
    try {
      if (fs.existsSync(this.indexPath)) {
        console.log('📖 [MEMORY-STORE] Loading existing FAISS index...');
        this.vectorStore = await FaissStore.load(this.indexPath, this.embeddings);
        console.log('✅ [MEMORY-STORE] FAISS index loaded successfully');
      } else {
        console.log('🆕 [MEMORY-STORE] Creating new FAISS index...');
        const docs = [new Document({ pageContent: "Initial document", metadata: {} })];
        this.vectorStore = await FaissStore.fromDocuments(docs, this.embeddings);
        
        fs.mkdirSync(path.dirname(this.indexPath), { recursive: true });
        console.log('✅ [MEMORY-STORE] New FAISS index created');
      }
    } catch (error) {
      console.error("❌ [MEMORY-STORE] Failed to initialize vector store:", error);
      console.log('🔄 [MEMORY-STORE] Falling back to in-memory vector store...');
      const docs = [new Document({ pageContent: "Initial document", metadata: {} })];
      this.vectorStore = await FaissStore.fromDocuments(docs, this.embeddings);
    }
  }

  makeKey(agentId: string, userId: string, channelId?: string): SessionKey {
    return channelId ? `${agentId}:${userId}:${channelId}` : `${agentId}:${userId}`;
  }

  async get(sessionKey: SessionKey): Promise<MemoryEntry[]> {
    console.log('🧠 [MEMORY-STORE] Getting memory for session:', sessionKey);
    console.log('📊 [MEMORY-STORE] Total stored sessions:', this.bufferMemories.size);
    console.log('🗝️ [MEMORY-STORE] Available session keys:', Array.from(this.bufferMemories.keys()));
    
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
      role: msg._getType() === "human" ? "user" as const :
            msg._getType() === "ai" ? "assistant" as const : "system" as const,
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

    await this.addToVectorStore(sessionKey, entry);
    
    // Save session to disk after each message
    await this.saveSession(sessionKey);
  }

  private async addToVectorStore(sessionKey: SessionKey, entry: MemoryEntry): Promise<void> {
    if (!this.vectorStore) {
      await this.initializeVectorStore();
    }

    const doc = new Document({
      pageContent: entry.content,
      metadata: {
        sessionKey,
        role: entry.role,
        timestamp: entry.timestamp || Date.now(),
        id: uuidv4(),
      },
    });

    await this.vectorStore!.addDocuments([doc]);
  }

  async semanticSearch(sessionKey: SessionKey, query: string, limit: number = 5): Promise<MemorySearchResult> {
    if (!this.vectorStore) {
      return { entries: [], relevanceScores: [] };
    }

    try {
      const results = await this.vectorStore.similaritySearchWithScore(query, limit);
      
      const filteredResults = results.filter(([doc, score]) => 
        doc.metadata.sessionKey === sessionKey && score > 0.7
      );

      const entries: EnhancedMemoryEntry[] = filteredResults.map(([doc]) => ({
        role: doc.metadata.role,
        content: doc.pageContent,
        timestamp: doc.metadata.timestamp,
        importance: 1 - (doc.metadata.timestamp ? (Date.now() - doc.metadata.timestamp) / (1000 * 60 * 60 * 24) : 0),
      }));

      const relevanceScores = filteredResults.map(([, score]) => score);

      return { entries, relevanceScores };
    } catch (error) {
      console.error("Semantic search failed:", error);
      return { entries: [], relevanceScores: [] };
    }
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
    
    if (!this.vectorStore) {
      return;
    }

    try {
      const allDocs = await this.getAllDocuments();
      const filteredDocs = allDocs.filter(doc => doc.metadata.sessionKey !== sessionKey);
      
      if (filteredDocs.length > 0) {
        this.vectorStore = await FaissStore.fromDocuments(filteredDocs, this.embeddings);
      } else {
        const emptyDoc = new Document({ pageContent: "Initial document", metadata: {} });
        this.vectorStore = await FaissStore.fromDocuments([emptyDoc], this.embeddings);
      }
      
      await this.saveIndex();
      console.log('✅ [MEMORY-STORE] Vector store cleared for session');
    } catch (error) {
      console.error("❌ [MEMORY-STORE] Failed to clear vector store for session:", error);
    }
  }

  private async getAllDocuments(): Promise<Document[]> {
    if (!this.vectorStore) {
      return [];
    }
    
    try {
      // Use a generic query to retrieve all documents
      const results = await this.vectorStore.similaritySearch("document", 1000);
      return results;
    } catch (error) {
      console.error("Failed to retrieve documents from vector store:", error);
      return [];
    }
  }

  async saveIndex(): Promise<void> {
    if (this.vectorStore) {
      try {
        await this.vectorStore.save(this.indexPath);
      } catch (error) {
        console.error("Failed to save vector index:", error);
      }
    }
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
        type: msg._getType(),
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