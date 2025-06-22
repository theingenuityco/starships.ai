import { BufferMemory } from "langchain/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { MemoryEntry, EnhancedMemoryEntry, MemorySearchResult, SessionKey } from "@starships/protocol";

export class LangChainMemoryStore {
  private bufferMemories = new Map<SessionKey, BufferMemory>();
  private vectorStore: FaissStore | null = null;
  private embeddings: OpenAIEmbeddings;
  private indexPath: string;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.DEFAULT_EMBEDDING_MODEL || "text-embedding-3-small",
    });
    this.indexPath = process.env.FAISS_INDEX_PATH || "./data/faiss_index";
    this.initializeVectorStore();
  }

  private async initializeVectorStore() {
    try {
      // Try to load existing index
      if (fs.existsSync(this.indexPath)) {
        this.vectorStore = await FaissStore.load(this.indexPath, this.embeddings);
      } else {
        // Create new vector store
        const docs = [new Document({ pageContent: "Initial document", metadata: {} })];
        this.vectorStore = await FaissStore.fromDocuments(docs, this.embeddings);
        
        // Ensure directory exists
        fs.mkdirSync(path.dirname(this.indexPath), { recursive: true });
      }
    } catch (error) {
      console.error("Failed to initialize vector store:", error);
      // Create empty vector store as fallback
      const docs = [new Document({ pageContent: "Initial document", metadata: {} })];
      this.vectorStore = await FaissStore.fromDocuments(docs, this.embeddings);
    }
  }

  makeKey(agentId: string, userId: string, channelId?: string): SessionKey {
    return channelId ? `${agentId}:${userId}:${channelId}` : `${agentId}:${userId}`;
  }

  async get(sessionKey: SessionKey): Promise<MemoryEntry[]> {
    const bufferMemory = this.bufferMemories.get(sessionKey);
    if (!bufferMemory) {
      return [];
    }

    const chatHistory = await bufferMemory.chatHistory.getMessages();
    return chatHistory.map(msg => ({
      role: msg._getType() === "human" ? "user" as const : 
            msg._getType() === "ai" ? "assistant" as const : "system" as const,
      content: msg.content as string,
      timestamp: Date.now(),
    }));
  }

  async append(sessionKey: SessionKey, entry: MemoryEntry): Promise<void> {
    // Get or create buffer memory
    let bufferMemory = this.bufferMemories.get(sessionKey);
    if (!bufferMemory) {
      bufferMemory = new BufferMemory({
        returnMessages: true,
        memoryKey: "chat_history",
      });
      this.bufferMemories.set(sessionKey, bufferMemory);
    }

    // Add to buffer memory
    if (entry.role === "user") {
      await bufferMemory.chatHistory.addMessage(new HumanMessage(entry.content));
    } else if (entry.role === "assistant") {
      await bufferMemory.chatHistory.addMessage(new AIMessage(entry.content));
    }

    // Add to vector store for semantic search
    await this.addToVectorStore(sessionKey, entry);
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
      
      // Filter by session key and minimum relevance score
      const filteredResults = results.filter(([doc, score]) => 
        doc.metadata.sessionKey === sessionKey && score > 0.7
      );

      const entries: EnhancedMemoryEntry[] = filteredResults.map(([doc]) => ({
        role: doc.metadata.role,
        content: doc.pageContent,
        timestamp: doc.metadata.timestamp,
        importance: 1 - (doc.metadata.timestamp ? (Date.now() - doc.metadata.timestamp) / (1000 * 60 * 60 * 24) : 0), // Decay over time
      }));

      const relevanceScores = filteredResults.map(([, score]) => score);

      return { entries, relevanceScores };
    } catch (error) {
      console.error("Semantic search failed:", error);
      return { entries: [], relevanceScores: [] };
    }
  }

  async clear(sessionKey: SessionKey): Promise<void> {
    this.bufferMemories.delete(sessionKey);
    
    // Note: Removing from vector store would require rebuilding the entire index
    // For now, we just clear the buffer memory
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
} 