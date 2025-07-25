import { getLogger, Logger } from '../utils/logger';
import { LangChainProvider } from '@starships/agent-engine/src/llm/langchain-provider';
import { LLMChatPrompt, LLMProvider } from '@starships/protocol';
import { env } from '../config/environment';
import { ExpeditionMessageRepository, ExpeditionMessage, MessageRole, MessageType } from '@starships/models';
import { LangChainMemoryStore } from '@starships/agent-engine/src/memory/langchain-memory';

// Type definitions from other parts of the system
type ExpeditionStatus = 'active' | 'completed' | 'failed' | 'paused';

interface AgentInfo {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'offline' | 'busy';
  currentTasks?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    progress: number;
  }>;
  completedTasksCount?: number;
  totalTasksCount?: number;
}

interface TaskSummary {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedTo?: string;
  assignedAgentName?: string;
  priority?: string;
  progress?: number;
  createdAt: string;
  completedAt?: string;
}

interface ResultSummary {
  id: string;
  taskId: string;
  content: string;
  createdAt: string;
  createdBy: string;
}

interface MessageSummary {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  type: 'user' | 'agent' | 'system';
}

interface ExpeditionStats {
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  failedTasks: number;
  blockedTasks?: number;
  totalMessages: number;
  averageCompletionTime?: number;
  agentsWorking?: number;
  totalAgents?: number;
}

// VirtualFirstOfficer specific interfaces
interface VirtualFirstOfficerConfig {
  expeditionId: string;
  starshipId: string;
  context: ExpeditionContext;
  conversationMemory: ConversationMemory;
  messageRepository?: ExpeditionMessageRepository; // Optional for dependency injection
}

interface ExpeditionContext {
  expeditionId: string;
  starshipId: string;
  state: ExpeditionStatus;
  title: string;
  objective: string;
  createdAt: string;
  assignedAgents: AgentInfo[];
  tasks: TaskSummary[];
  results: ResultSummary[];
  recentMessages: MessageSummary[];
  statistics: ExpeditionStats;
}

interface ConversationMemory {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  maxMessages: number;
}

export class VirtualFirstOfficer {
  private logger: Logger;
  private expeditionId: string;
  private starshipId: string;
  private context: ExpeditionContext;
  private conversationMemory: ConversationMemory;
  private lastActivity: Date;
  private llmProvider: LLMProvider;
  private messageRepository?: ExpeditionMessageRepository;
  private memoryStore: LangChainMemoryStore;

  constructor(config: VirtualFirstOfficerConfig) {
    this.logger = getLogger({ service: 'VirtualFirstOfficer' });
    this.expeditionId = config.expeditionId;
    this.starshipId = config.starshipId;
    this.context = config.context;
    this.conversationMemory = config.conversationMemory || {
      messages: [],
      maxMessages: 50
    };
    this.lastActivity = new Date();
    this.messageRepository = config.messageRepository; // Optional dependency injection

    // Initialize LLM provider
    this.llmProvider = this.createLLMProvider();

    // Initialize memory store for vector search
    this.memoryStore = new LangChainMemoryStore();

    this.logger.info('VirtualFirstOfficer initialized', {
      service: 'VirtualFirstOfficer',
      operation: 'constructor'
    }, {
      expeditionId: this.expeditionId,
      starshipId: this.starshipId,
      status: this.context.state,
      llmProvider: env.DEFAULT_LLM_PROVIDER || 'not configured',
      messageRepositoryAvailable: !!this.messageRepository,
      assignedAgents: this.context.assignedAgents.map(a => ({ 
        id: a.id, 
        name: a.name, 
        role: a.role 
      }))
    });

    // Load conversation history if repository is available
    if (this.messageRepository) {
      this.loadConversationHistory().catch(error => {
        this.logger.error('Failed to load conversation history', error instanceof Error ? error : new Error(String(error)), {
          service: 'VirtualFirstOfficer',
          operation: 'constructor'
        });
      });
    }
  }

  /**
   * Create an LLM provider instance for the Virtual First Officer
   */
  private createLLMProvider(): LLMProvider {
    // Create a default model configuration
    const modelConfig = {
      id: 'virtual-first-officer',
      name: env.DEFAULT_CHAT_MODEL || 'gpt-4',
      provider: (env.DEFAULT_LLM_PROVIDER as 'openai' | 'anthropic') || 'openai',
      temperature: env.DEFAULT_TEMPERATURE || 0.7,
      maxTokens: env.DEFAULT_MAX_TOKENS || 4096,
      createdAt: new Date().toISOString()
    };

    this.logger.debug('Creating LLM provider', {
      service: 'VirtualFirstOfficer',
      operation: 'createLLMProvider'
    }, {
      provider: modelConfig.provider,
      model: modelConfig.name,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens
    });

    return new LangChainProvider(modelConfig);
  }

  /**
   * Process a user message and generate an AI response
   */
  async processMessage(message: string, userId: string): Promise<string> {
    try {
      this.logger.debug('Processing message', {
        service: 'VirtualFirstOfficer',
        operation: 'processMessage'
      }, {
        userId,
        expeditionId: this.expeditionId,
        messageLength: message.length
      });

      // Update last activity
      this.lastActivity = new Date();

      // Add user message to conversation memory with persistence preparation
      await this.processMessageWithPersistence('user', message, userId);

      // Generate context-aware prompt with vector search
      const prompt = await this.generatePromptWithVectorSearch(message);

      this.logger.debug('Generated prompt for LLM', {
        service: 'VirtualFirstOfficer',
        operation: 'processMessage'
      }, {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + '...'
      });

      // Call the actual LLM provider
      try {
        const llmPrompt: LLMChatPrompt = {
          messages: [
            {
              role: 'system',
              content: prompt
            },
            {
              role: 'user',
              content: message
            }
          ]
        };

        this.logger.debug('Calling LLM provider', {
          service: 'VirtualFirstOfficer',
          operation: 'processMessage'
        }, {
          messageCount: llmPrompt.messages.length
        });

        const llmResult = await this.llmProvider.complete(llmPrompt, {
          temperature: 0.7,
          maxTokens: 2048
        });

        const response = llmResult.reply;

        this.logger.debug('LLM provider responded', {
          service: 'VirtualFirstOfficer',
          operation: 'processMessage'
        }, {
          responseLength: response.length,
          usage: llmResult.usage
        });

        // Add assistant response to conversation memory with persistence preparation
        await this.processMessageWithPersistence('assistant', response);

        this.logger.info('Message processed successfully with LLM', {
          service: 'VirtualFirstOfficer',
          operation: 'processMessage'
        }, {
          userId,
          expeditionId: this.expeditionId,
          responseLength: response.length,
          usage: llmResult.usage
        });

        return response;
      } catch (llmError) {
        this.logger.error('LLM provider failed, falling back to placeholder', llmError instanceof Error ? llmError : new Error(String(llmError)), {
          service: 'VirtualFirstOfficer',
          operation: 'processMessage'
        });

        // Fall back to placeholder response if LLM fails
        const fallbackResponse = await this.simulateLLMResponse(prompt, message);
        await this.processMessageWithPersistence('assistant', fallbackResponse);
        return fallbackResponse;
      }
    } catch (error) {
      this.logger.error('Error processing message', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficer',
        operation: 'processMessage'
      }, {
        userId,
        expeditionId: this.expeditionId
      });
      throw new Error(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update the expedition context with fresh data
   */
  updateContext(context: ExpeditionContext): void {
    try {
      this.logger.debug('Updating expedition context', {
        service: 'VirtualFirstOfficer',
        operation: 'updateContext'
      }, {
        expeditionId: this.expeditionId,
        oldState: this.context.state,
        newState: context.state,
        oldAgentCount: this.context.assignedAgents.length,
        newAgentCount: context.assignedAgents.length,
        newAgents: context.assignedAgents.map(a => ({
          id: a.id,
          name: a.name,
          role: a.role
        }))
      });

      this.context = context;
      this.lastActivity = new Date();

      this.logger.info('Context updated successfully', {
        service: 'VirtualFirstOfficer',
        operation: 'updateContext'
      }, {
        expeditionId: this.expeditionId,
        state: this.context.state,
        taskCount: this.context.tasks.length,
        agentCount: this.context.assignedAgents.length,
        agents: this.context.assignedAgents.map(a => ({
          id: a.id,
          name: a.name,
          role: a.role
        }))
      });
    } catch (error) {
      this.logger.error('Error updating context', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficer',
        operation: 'updateContext'
      }, {
        expeditionId: this.expeditionId
      });
      throw new Error(`Failed to update context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the last activity timestamp
   */
  getLastActivity(): Date {
    return this.lastActivity;
  }

  /**
   * Set the message repository for database integration
   * Phase 1.1: Allows setting repository after construction for flexibility
   */
  setMessageRepository(repository: ExpeditionMessageRepository): void {
    this.messageRepository = repository;
    this.logger.info('Message repository set for VirtualFirstOfficer', {
      service: 'VirtualFirstOfficer',
      operation: 'setMessageRepository'
    }, {
      expeditionId: this.expeditionId,
      repositorySet: true
    });
  }

  /**
   * Check if message repository is available
   */
  hasMessageRepository(): boolean {
    return !!this.messageRepository;
  }

  /**
   * Get conversation memory statistics for monitoring
   * Phase 1.2: Enhanced monitoring and metrics
   */
  getConversationStats(): {
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    memoryUtilization: number;
    oldestMessageAge: number | null;
    newestMessageAge: number | null;
  } {
    const now = new Date();
    const messages = this.conversationMemory.messages;
    
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    
    const oldestMessage = messages.length > 0 ? messages[0] : null;
    const newestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    
    return {
      totalMessages: messages.length,
      userMessages,
      assistantMessages,
      memoryUtilization: (messages.length / this.conversationMemory.maxMessages) * 100,
      oldestMessageAge: oldestMessage ? now.getTime() - oldestMessage.timestamp.getTime() : null,
      newestMessageAge: newestMessage ? now.getTime() - newestMessage.timestamp.getTime() : null
    };
  }

  /**
   * Force reload conversation history from database
   * Phase 1.2: Manual refresh capability
   */
  async refreshConversationHistory(): Promise<void> {
    this.logger.info('Manually refreshing conversation history', {
      service: 'VirtualFirstOfficer',
      operation: 'refreshConversationHistory'
    }, {
      expeditionId: this.expeditionId,
      currentMessageCount: this.conversationMemory.messages.length
    });

    // Clear current memory and reload
    this.conversationMemory.messages = [];
    await this.loadConversationHistory();
  }

  /**
   * Get message persistence status and metrics
   * Phase 1.2: Monitoring and diagnostics
   */
  getPersistenceStatus(): {
    hasRepository: boolean;
    repositoryType: string;
    lastActivity: string;
    expeditionId: string;
    starshipId: string;
    conversationStats: {
      totalMessages: number;
      userMessages: number;
      assistantMessages: number;
      memoryUtilization: number;
      oldestMessageAge: number | null;
      newestMessageAge: number | null;
    };
  } {
    return {
      hasRepository: this.hasMessageRepository(),
      repositoryType: this.messageRepository ? 'ExpeditionMessageRepository' : 'none',
      lastActivity: this.lastActivity.toISOString(),
      expeditionId: this.expeditionId,
      starshipId: this.starshipId,
      conversationStats: this.getConversationStats()
    };
  }

  /**
   * Add a message to conversation memory with size management
   */
  private addToConversationMemory(role: 'user' | 'assistant', content: string): void {
    const message = {
      role,
      content,
      timestamp: new Date()
    };

    this.conversationMemory.messages.push(message);

    // Trim conversation memory if it exceeds max messages
    if (this.conversationMemory.messages.length > this.conversationMemory.maxMessages) {
      const trimCount = this.conversationMemory.messages.length - this.conversationMemory.maxMessages;
      this.conversationMemory.messages = this.conversationMemory.messages.slice(trimCount);
      
      this.logger.debug('Trimmed conversation memory', {
        service: 'VirtualFirstOfficer',
        operation: 'addToConversationMemory'
      }, {
        trimmedMessages: trimCount,
        remainingMessages: this.conversationMemory.messages.length
      });
    }
  }

  /**
   * Prepare a message for database persistence with enhanced metadata
   * Phase 1.2: Enhanced message preparation with conversation memory and context
   */
  private async prepareMessageForPersistence(
    role: MessageRole,
    content: string,
    messageType: MessageType = 'coordination',
    userId?: string
  ): Promise<Omit<ExpeditionMessage, 'id'> | null> {
    try {
      // Enhanced metadata including conversation memory and full context
      const enhancedMetadata = {
        starshipId: this.starshipId,
        generatedByVFO: true,
        contextState: this.context.state,
        conversationMemory: {
          totalMessages: this.conversationMemory.messages.length,
          recentMessageCount: Math.min(this.conversationMemory.messages.length, 5),
          lastActivity: this.lastActivity.toISOString(),
          maxMessages: this.conversationMemory.maxMessages
        },
        expeditionContext: {
          title: this.context.title,
          objective: this.context.objective,
          status: this.context.state,
          totalTasks: this.context.statistics.totalTasks,
          completedTasks: this.context.statistics.completedTasks,
          activeTasks: this.context.statistics.totalTasks - this.context.statistics.completedTasks - this.context.statistics.failedTasks,
          assignedAgents: this.context.assignedAgents.length,
          onlineAgents: this.context.assignedAgents.filter(a => a.status === 'online').length
        },
        processingMetrics: {
          timestamp: new Date().toISOString(),
          contentLength: content.length,
          role,
          messageType
        }
      };

      const messageData: Omit<ExpeditionMessage, 'id'> = {
        expeditionId: this.expeditionId,
        role,
        content,
        messageType,
        timestamp: new Date().toISOString(),
        userId: userId || undefined,
        agentId: role === 'first-officer' ? 'virtual-first-officer' : undefined,
        metadata: enhancedMetadata
      };

      this.logger.debug('Message prepared for persistence with enhanced metadata', {
        service: 'VirtualFirstOfficer',
        operation: 'prepareMessageForPersistence'
      }, {
        role,
        messageType,
        contentLength: content.length,
        hasRepository: !!this.messageRepository,
        metadataKeys: Object.keys(enhancedMetadata)
      });

      return messageData;
    } catch (error) {
      this.logger.error('Error preparing message for persistence', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficer',
        operation: 'prepareMessageForPersistence'
      });
      return null;
    }
  }

  /**
   * Load conversation history from database on initialization
   * Phase 1.2: Enhanced conversation history loading with fallback and validation
   */
  async loadConversationHistory(): Promise<void> {
    if (!this.messageRepository) {
      this.logger.debug('No message repository available for loading conversation history', {
        service: 'VirtualFirstOfficer',
        operation: 'loadConversationHistory'
      });
      return;
    }

    const startTime = Date.now();
    
    try {
      this.logger.debug('Loading conversation history from database', {
        service: 'VirtualFirstOfficer',
        operation: 'loadConversationHistory'
      }, {
        expeditionId: this.expeditionId,
        maxMessages: this.conversationMemory.maxMessages
      });

      // Load recent messages from database to restore conversation memory
      const recentMessages = await this.messageRepository.getLatestMessages(
        this.expeditionId,
        this.conversationMemory.maxMessages
      );

      // Validate and convert database messages to conversation memory format
      const validMessages = recentMessages
        .filter(msg => {
          // Validate message structure
          if (!msg.content || !msg.timestamp || !msg.role) {
            this.logger.warn('Skipping invalid message during history load', {
              service: 'VirtualFirstOfficer',
              operation: 'loadConversationHistory'
            }, {
              messageId: msg.id,
              hasContent: !!msg.content,
              hasTimestamp: !!msg.timestamp,
              hasRole: !!msg.role
            });
            return false;
          }
          return true;
        })
        .map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
          timestamp: new Date(msg.timestamp)
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); // Ensure chronological order

      // Update conversation memory with validated messages
      this.conversationMemory.messages = validMessages;

      const loadTime = Date.now() - startTime;

      this.logger.info('Conversation history loaded successfully', {
        service: 'VirtualFirstOfficer',
        operation: 'loadConversationHistory'
      }, {
        expeditionId: this.expeditionId,
        messagesLoaded: this.conversationMemory.messages.length,
        messagesFiltered: recentMessages.length - validMessages.length,
        loadTimeMs: loadTime,
        oldestMessage: validMessages.length > 0 ? validMessages[0].timestamp.toISOString() : null,
        newestMessage: validMessages.length > 0 ? validMessages[validMessages.length - 1].timestamp.toISOString() : null
      });

      // Performance check - warn if loading takes too long
      if (loadTime > 100) {
        this.logger.warn('Conversation history loading took longer than expected', {
          service: 'VirtualFirstOfficer',
          operation: 'loadConversationHistory'
        }, {
          loadTimeMs: loadTime,
          expeditionId: this.expeditionId,
          messageCount: validMessages.length
        });
      }

    } catch (error) {
      const loadTime = Date.now() - startTime;
      
      this.logger.error('Failed to load conversation history', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficer',
        operation: 'loadConversationHistory'
      }, {
        expeditionId: this.expeditionId,
        loadTimeMs: loadTime
      });
      
      // Initialize with empty conversation memory if loading fails
      this.conversationMemory.messages = [];
    }
  }

  /**
   * Enhanced message processing with database persistence and async optimization
   * Phase 1.2: Complete persistence implementation with performance optimization
   */
  private async processMessageWithPersistence(
    role: 'user' | 'assistant',
    content: string,
    userId?: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Add to in-memory conversation immediately for responsiveness
      this.addToConversationMemory(role, content);

      // Phase 2: Store in vector index for semantic search (async, non-blocking)
      this.storeMessageInVectorIndex(content, role).catch(vectorError => {
        this.logger.warn('Vector storage failed, continuing without it', {
          service: 'VirtualFirstOfficer',
          operation: 'processMessageWithPersistence'
        }, {
          vectorError: vectorError instanceof Error ? vectorError.message : String(vectorError),
          expeditionId: this.expeditionId,
          role
        });
      });

      // Async database persistence - don't block the response
      if (this.messageRepository) {
        const messageRole: MessageRole = role === 'user' ? 'user' : 'first-officer';
        const messageType: MessageType = role === 'user' ? 'user-input' : 'coordination';
        
        // Prepare message data with enhanced metadata
        const messageData = await this.prepareMessageForPersistence(
          messageRole,
          content,
          messageType,
          userId
        );

        if (messageData) {
          this.logger.debug('Message data prepared for persistence', {
            service: 'VirtualFirstOfficer',
            operation: 'processMessageWithPersistence'
          }, {
            expeditionId: messageData.expeditionId,
            role: messageData.role,
            messageType: messageData.messageType,
            hasMetadata: !!messageData.metadata
          });
          
          // Perform async persistence with timeout protection
          const persistencePromise = Promise.race([
            this.messageRepository.create(messageData),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Persistence timeout')), 5000)
            )
          ]);

          try {
            const createdMessage = await persistencePromise;
            const persistTime = Date.now() - startTime;
            
            this.logger.debug('Message persisted to database successfully', {
              service: 'VirtualFirstOfficer',
              operation: 'processMessageWithPersistence'
            }, {
              messageId: createdMessage.id,
              expeditionId: createdMessage.expeditionId,
              role: createdMessage.role,
              persistTimeMs: persistTime
            });

            // Performance warning if persistence takes too long
            if (persistTime > 200) {
              this.logger.warn('Message persistence exceeded performance target', {
                service: 'VirtualFirstOfficer',
                operation: 'processMessageWithPersistence'
              }, {
                persistTimeMs: persistTime,
                messageId: createdMessage.id,
                targetMs: 200
              });
            }

          } catch (persistError) {
            const persistTime = Date.now() - startTime;
            
            this.logger.error('Failed to persist message to database', persistError instanceof Error ? persistError : new Error(String(persistError)), {
              service: 'VirtualFirstOfficer',
              operation: 'processMessageWithPersistence'
            }, {
              persistTimeMs: persistTime,
              expeditionId: this.expeditionId,
              role: messageRole
            });
            // Continue execution even if persistence fails - don't break the conversation
          }
        } else {
          this.logger.warn('Message data preparation failed, skipping persistence', {
            service: 'VirtualFirstOfficer',
            operation: 'processMessageWithPersistence'
          }, {
            role: messageRole,
            contentLength: content.length
          });
        }
      } else {
        this.logger.debug('No message repository available, skipping persistence', {
          service: 'VirtualFirstOfficer',
          operation: 'processMessageWithPersistence'
        }, {
          role,
          contentLength: content.length
        });
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Error in message processing with persistence', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficer',
        operation: 'processMessageWithPersistence'
      }, {
        processingTimeMs: processingTime,
        role,
        contentLength: content.length
      });
      
      // Fallback to basic functionality if preparation fails
      // (conversation memory was already added at the start)
    }
  }

  /**
   * Phase 2: Generate embeddings and store in vector index
   * Generates embeddings for messages and stores them in Faiss with expedition-specific namespacing
   */
  private async storeMessageInVectorIndex(content: string, role: 'user' | 'assistant'): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Create expedition-specific session key for namespacing
      const sessionKey = `expedition:${this.expeditionId}`;
      
      // Create memory entry for vector storage
      const memoryEntry = {
        role: role,
        content: content,
        timestamp: Date.now()
      };

      // Store in vector index using LangChainMemoryStore
      await this.memoryStore.append(sessionKey, memoryEntry);

      const storeTime = Date.now() - startTime;

      this.logger.debug('Message stored in vector index successfully', {
        service: 'VirtualFirstOfficer',
        operation: 'storeMessageInVectorIndex'
      }, {
        expeditionId: this.expeditionId,
        role,
        contentLength: content.length,
        storeTimeMs: storeTime,
        sessionKey
      });

      // Performance warning if vector storage takes too long
      if (storeTime > 200) {
        this.logger.warn('Vector storage exceeded performance target', {
          service: 'VirtualFirstOfficer',
          operation: 'storeMessageInVectorIndex'
        }, {
          storeTimeMs: storeTime,
          targetMs: 200,
          expeditionId: this.expeditionId
        });
      }

    } catch (error) {
      this.logger.error('Failed to store message in vector index', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficer',
        operation: 'storeMessageInVectorIndex'
      }, {
        expeditionId: this.expeditionId,
        role,
        contentLength: content.length
      });
      // Don't throw error - vector storage failure shouldn't break conversation
    }
  }

  /**
   * Phase 2: Perform semantic search across conversation history
   * Uses vector similarity search to find relevant context from past conversations
   */
  async performSemanticSearch(query: string, limit: number = 5): Promise<{
    relevantMessages: Array<{
      content: string;
      role: 'user' | 'assistant';
      relevanceScore: number;
      timestamp: number;
    }>;
    searchTimeMs: number;
  }> {
    try {
      const startTime = Date.now();
      
      // Create expedition-specific session key
      const sessionKey = `expedition:${this.expeditionId}`;

      this.logger.debug('Performing semantic search', {
        service: 'VirtualFirstOfficer',
        operation: 'performSemanticSearch'
      }, {
        expeditionId: this.expeditionId,
        query: query.substring(0, 100) + '...',
        limit,
        sessionKey
      });

      // Perform semantic search using LangChainMemoryStore
      const searchResult = await this.memoryStore.semanticSearch(sessionKey, query, limit);

      const searchTime = Date.now() - startTime;

      // Transform results to our format
      const relevantMessages = searchResult.entries.map((entry, index) => ({
        content: entry.content,
        role: entry.role as 'user' | 'assistant',
        relevanceScore: searchResult.relevanceScores[index] || 0,
        timestamp: entry.timestamp || Date.now()
      }));

      this.logger.debug('Semantic search completed', {
        service: 'VirtualFirstOfficer',
        operation: 'performSemanticSearch'
      }, {
        expeditionId: this.expeditionId,
        resultsFound: relevantMessages.length,
        searchTimeMs: searchTime,
        averageScore: relevantMessages.length > 0
          ? relevantMessages.reduce((sum, msg) => sum + msg.relevanceScore, 0) / relevantMessages.length
          : 0
      });

      // Performance warning if search takes too long
      if (searchTime > 200) {
        this.logger.warn('Semantic search exceeded performance target', {
          service: 'VirtualFirstOfficer',
          operation: 'performSemanticSearch'
        }, {
          searchTimeMs: searchTime,
          targetMs: 200,
          expeditionId: this.expeditionId
        });
      }

      return {
        relevantMessages,
        searchTimeMs: searchTime
      };

    } catch (error) {
      this.logger.error('Failed to perform semantic search', error instanceof Error ? error : new Error(String(error)), {
        service: 'VirtualFirstOfficer',
        operation: 'performSemanticSearch'
      }, {
        expeditionId: this.expeditionId,
        query: query.substring(0, 100) + '...'
      });

      // Return empty results on failure
      return {
        relevantMessages: [],
        searchTimeMs: 0
      };
    }
  }

  /**
   * Detect the user's intent from their message
   */
  private detectUserIntent(message: string): string {
    const lowerMessage = message.toLowerCase().trim();
    
    // Greeting patterns
    const greetingPatterns = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy'];
    if (greetingPatterns.some(pattern => lowerMessage === pattern || lowerMessage.startsWith(pattern + ' ') || lowerMessage.startsWith(pattern + ','))) {
      return 'greeting';
    }
    
    // Status inquiry patterns
    if (lowerMessage.includes('status') || lowerMessage.includes('how is') || lowerMessage.includes('how are things') || 
        lowerMessage.includes('progress') || lowerMessage.includes('update')) {
      return 'status_inquiry';
    }
    
    // Agent inquiry patterns
    if (lowerMessage.includes('agent') || lowerMessage.includes('who is') || lowerMessage.includes('team') ||
        lowerMessage.includes('crew') || lowerMessage.includes('assigned')) {
      return 'agent_inquiry';
    }
    
    // Task inquiry patterns
    if (lowerMessage.includes('task') || lowerMessage.includes('what is being') || lowerMessage.includes('working on') ||
        lowerMessage.includes('doing') || lowerMessage.includes('activities')) {
      return 'task_inquiry';
    }
    
    // Help patterns
    if (lowerMessage.includes('help') || lowerMessage.includes('assist') || lowerMessage.includes('what can you')) {
      return 'help_request';
    }
    
    return 'general';
  }

  /**
   * Generate a context-aware prompt for the LLM
   * Phase 2: Enhanced with vector search results for better context
   */
  private async generatePromptWithVectorSearch(userMessage: string): Promise<string> {
    const contextSummary = this.generateContextSummary();
    const conversationHistory = this.generateConversationHistory();
    
    // Log agent details for debugging
    this.logger.debug('Generating prompt with agent context', {
      service: 'VirtualFirstOfficer',
      operation: 'generatePromptWithVectorSearch'
    }, {
      expeditionId: this.expeditionId,
      agentCount: this.context.assignedAgents.length,
      agents: this.context.assignedAgents.map(a => ({ id: a.id, name: a.name }))
    });

    // Phase 2: Perform semantic search to find relevant context
    let vectorSearchContext = '';
    try {
      const searchResults = await this.performSemanticSearch(userMessage, 3);
      
      if (searchResults.relevantMessages.length > 0) {
        const relevantContext = searchResults.relevantMessages
          .filter(msg => msg.relevanceScore > 0.7) // Only include highly relevant messages
          .map(msg => `${msg.role.toUpperCase()}: ${msg.content} (relevance: ${msg.relevanceScore.toFixed(2)})`)
          .join('\n');
        
        if (relevantContext) {
          vectorSearchContext = `\nRELEVANT CONTEXT FROM PAST CONVERSATIONS:
${relevantContext}\n`;
        }
      }
      
      this.logger.debug('Vector search context generated for prompt', {
        service: 'VirtualFirstOfficer',
        operation: 'generatePromptWithVectorSearch'
      }, {
        expeditionId: this.expeditionId,
        searchResultsCount: searchResults.relevantMessages.length,
        relevantContextLength: vectorSearchContext.length,
        searchTimeMs: searchResults.searchTimeMs
      });
      
    } catch (error) {
      this.logger.warn('Failed to generate vector search context, continuing without it', {
        service: 'VirtualFirstOfficer',
        operation: 'generatePromptWithVectorSearch'
      }, {
        error: error instanceof Error ? error.message : String(error),
        expeditionId: this.expeditionId
      });
    }

    // Detect user intent to provide appropriate response
    const userIntent = this.detectUserIntent(userMessage);
    
    // Log the detected intent for debugging
    this.logger.debug('Detected user intent', {
      service: 'VirtualFirstOfficer',
      operation: 'generatePromptWithVectorSearch'
    }, {
      userIntent,
      messagePreview: userMessage.substring(0, 50)
    });

    const prompt = `You are a Virtual First Officer for an expedition management system. You are assisting with expedition "${this.context.title}".

EXPEDITION CONTEXT:
${contextSummary}

CONVERSATION HISTORY:
${conversationHistory}${vectorSearchContext}

USER MESSAGE:
${userMessage}

DETECTED INTENT: ${userIntent}

CRITICAL: The expedition has ID "${this.context.expeditionId}" but you must NEVER mention this ID. Always refer to it as "${this.context.title}" instead.

IMPORTANT INSTRUCTIONS:
- Be conversational and natural. Don't dump information unless asked.
- The detected intent is a hint, but analyze the actual message for nuance.
- For greetings, respond warmly and briefly. Ask how you can help. DO NOT provide expedition details.
- Only provide expedition status, agent details, or task information when specifically requested.
- When discussing agents, ALWAYS use their names (not IDs)
- NEVER include UUID strings (like "b7017750-f8f5-440c-b36a-2a9db64dbbdc") in responses
- Be concise by default. Elaborate only when the user asks for details.

RESPONSE GUIDELINES BY INTENT:
- greeting: "Hello! How can I assist you today?" or similar. Keep it short and friendly.
- status_inquiry: Provide current expedition status and key metrics.
- agent_inquiry: List agents with their names, roles, and current activities.
- task_inquiry: Show task information with assignments and progress.
- help_request: Ask what specific area they need help with.
- general: Respond appropriately to the query without over-sharing.

Remember: 
- Less is more. Answer what was asked, nothing more.
- CRITICAL: Never include any IDs (expedition IDs, agent IDs, task IDs) in your responses.
- Always use names and titles instead of IDs.
- For expeditions, say "the expedition 'title'" not "expedition with ID: xxx-xxx-xxx".`;

    return prompt;
  }


  /**
   * Generate a summary of the current expedition context
   * Note: This is included in every prompt, so it should be comprehensive
   * The LLM will decide what information to share based on user intent
   */
  private generateContextSummary(): string {
    const { context } = this;
    const onlineAgents = context.assignedAgents.filter(a => a.status === 'online').length;
    const busyAgents = context.assignedAgents.filter(a => a.status === 'busy').length;
    
    // Build detailed agent information
    const agentDetails = context.assignedAgents.length > 0 
      ? context.assignedAgents.map(agent => {
          let agentInfo = `\n  - ${agent.name} (${agent.role}) - Status: ${agent.status}`;
          
          // Add current task information if agent is busy
          if (agent.currentTasks && agent.currentTasks.length > 0) {
            agentInfo += `\n    Currently working on:`;
            agent.currentTasks.forEach(task => {
              agentInfo += `\n      • ${task.title} [${task.status}] (${task.progress}% complete)`;
            });
          }
          
          // Add task statistics
          if (agent.totalTasksCount !== undefined) {
            agentInfo += `\n    Task Statistics: ${agent.completedTasksCount || 0} completed out of ${agent.totalTasksCount} assigned`;
          }
          
          return agentInfo;
        }).join('')
      : '\n  - No agents assigned';

    // Build task overview by status
    const tasksByStatus = {
      pending: context.tasks.filter(t => t.status === 'pending').length,
      in_progress: context.tasks.filter(t => t.status === 'in_progress').length,
      completed: context.tasks.filter(t => t.status === 'completed').length,
      failed: context.tasks.filter(t => t.status === 'failed').length
    };
    
    // Get tasks in progress with agent assignments
    const tasksInProgress = context.tasks
      .filter(t => t.status === 'in_progress')
      .map(t => `\n    • ${t.title} - Assigned to: ${t.assignedAgentName || 'Unassigned'}`)
      .join('');

    return `
- Expedition Title: "${context.title}"
- Status: ${context.state}
- Objective: ${context.objective}
- Created: ${new Date(context.createdAt).toLocaleString()}

- Assigned Agents: ${context.assignedAgents.length} total (${onlineAgents} available, ${busyAgents} working)${agentDetails}

- Task Overview:
  • Total Tasks: ${context.statistics.totalTasks}
  • Pending: ${tasksByStatus.pending}
  • In Progress: ${tasksByStatus.in_progress}
  • Completed: ${tasksByStatus.completed}
  • Failed: ${tasksByStatus.failed}
  ${context.statistics.blockedTasks ? `• Blocked: ${context.statistics.blockedTasks}` : ''}

- Tasks Currently In Progress:${tasksInProgress || '\n  • No tasks currently in progress'}

- Recent Activity: ${context.recentMessages.length} messages
- Results Generated: ${context.results.length}`;
  }

  /**
   * Generate formatted conversation history
   */
  private generateConversationHistory(): string {
    const recentMessages = this.conversationMemory.messages.slice(-10); // Last 10 messages
    
    if (recentMessages.length === 0) {
      return 'No previous conversation';
    }

    return recentMessages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');
  }

  /**
   * Placeholder method to simulate LLM response
   * TODO: Replace with actual LLM provider call
   */
  private async simulateLLMResponse(_prompt: string, userMessage: string): Promise<string> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Generate a contextual placeholder response
    const taskCount = this.context.statistics.totalTasks;
    const activeAgents = this.context.assignedAgents.filter(a => a.status === 'online').length;

    return `I understand you're asking about "${userMessage}". 

As your Virtual First Officer for the expedition "${this.context.title}", I can see that we currently have ${taskCount} tasks with ${activeAgents} active agents assigned.

[This is a placeholder response. The actual implementation will use an LLM provider to generate contextually relevant responses based on the expedition state and conversation history.]`;
  }
}
