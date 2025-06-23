// Neo4j Node Types
export interface Agent {
  id: string;
  name: string;
  model: string;
  systemPrompt?: string;
  createdAt: string;
}

export interface LLM {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic';
  maxTokens?: number;
  temperature?: number;
  embeddingModel?: string;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  costPer1kTokens?: number;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  guildId?: string;
  type: 'text' | 'voice' | 'dm';
  createdAt: string;
}

// Neo4j Relationship Types (keeping only essential ones)
export interface ActiveInRelationship {
  type: 'ACTIVE_IN';
  properties?: {
    joinedAt?: string;
    role?: string;
  };
}

// Repository interfaces
export interface Repository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface AgentRepository extends Repository<Agent> {
  findByChannel(channelId: string): Promise<Agent[]>;
  findByUser(userId: string): Promise<Agent[]>;
}

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
}

export interface ChannelRepository extends Repository<Channel> {
  findByGuild(guildId: string): Promise<Channel[]>;
  findByType(type: string): Promise<Channel[]>;
}

export interface LLMRepository extends Repository<LLM> {
  findByProvider(provider: string): Promise<LLM[]>;
}

export interface AgentChannelRelationship {
  agentId: string;
  channelId: string;
  deployedAt: string;
  isActive: boolean;
}

export interface UserInteractionRelationship {
  userId: string;
  agentId: string;
  lastInteraction: string;
  messageCount: number;
} 