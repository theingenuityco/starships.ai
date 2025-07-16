// Starship-related types for API requests and responses

export interface UpdateStarshipRequest {
  name?: string;
  status?: 'active' | 'docked' | 'maintenance';
  class?: 'scout' | 'cruiser';
}

export interface UpdateStarshipStatusRequest {
  status: 'active' | 'docked' | 'maintenance';
}

export interface StarshipResponse {
  starship: {
    id: string;
    ownerId: string;
    class: 'scout' | 'cruiser';
    name: string;
    powerLevel: number;
    activeExpeditions: number;
    sibilInsights: number;
    maxAgents: number;
    status: 'active' | 'docked' | 'maintenance';
    createdAt: string;
    updatedAt: string;
  };
}

export interface StarshipAgentsResponse {
  starshipId: string;
  starshipName: string;
  starshipClass: 'scout' | 'cruiser';
  maxAgents: number;
  deployedAgents: Array<{
    id: string;
    name: string;
    model: string;
    systemPrompt?: string;
    createdAt: string;
    description?: string;
    tags: string[];
    category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
    authorId: string;
    isPublic: boolean;
    version: string;
    updatedAt: string;
    usageCount: number;
    rating?: number;
    temperature?: number;
    maxTokens?: number;
    customInstructions?: string;
    allowedStarshipClasses?: ('scout' | 'cruiser')[];
    requiredPermissions?: string[];
  }>;
  availableSlots: number;
  deployedCount: number;
}

export interface StarshipListResponse {
  starships: StarshipResponse['starship'][];
}

export interface StarshipDetailsResponse extends StarshipResponse {
  agents: StarshipAgentsResponse['deployedAgents'];
  availableSlots: number;
}

export interface CreateStarshipRequest {
  name: string;
  class: 'scout' | 'cruiser';
}

export interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface ApiError {
  error: string;
  code?: number;
  details?: any;
}