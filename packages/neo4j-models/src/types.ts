// Neo4j Node Types
export interface Agent {
  id: string;
  name: string;
  model: string;
  systemPrompt?: string;
  createdAt: string;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  maxTokens?: number;
  temperature?: number;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  type: string;
  guildId?: string;
  createdAt: string;
}

// Neo4j Relationship Types
export interface InteractsWithRelationship {
  type: 'INTERACTS_WITH';
  properties?: {
    lastInteraction?: string;
    interactionCount?: number;
  };
}

export interface UsesRelationship {
  type: 'USES';
  properties?: {
    configuredAt?: string;
  };
}

export interface ActiveInRelationship {
  type: 'ACTIVE_IN';
  properties?: {
    joinedAt?: string;
    role?: string;
  };
}

export interface DeployedInRelationship {
  type: 'DEPLOYED_IN';
  properties?: {
    deployedAt?: string;
    status?: string;
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

export interface ModelRepository extends Repository<Model> {
  findByProvider(provider: string): Promise<Model[]>;
} 